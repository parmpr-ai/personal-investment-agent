import os, asyncio, csv, io, shutil, socket, ssl, subprocess, urllib.request, urllib.error
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from services.state import portfolio_snapshot, macro_snapshot, news_items, catalyst_calendar, WATCHLIST
from services.trade_engine import scanner_items, opportunity_for
from services.ws import manager
from services.settings_store import get_settings, save_settings
from services.connectors import InstrumentSearchError, source_health, test_source, yahoo_news, yahoo_fundamentals, yahoo_symbol_search
from services.manual_holdings import create_manual_holding, delete_manual_holding, list_manual_holdings, merge_manual_holdings, update_manual_holding
from services.news_intelligence import get_news_intelligence
from services.stock_intelligence import build_stock_panel_intelligence, get_ticker_news_intelligence
load_dotenv()
try:
 from services.ibkr_service import get_ibkr_portfolio
except Exception:
 get_ibkr_portfolio=None

class AnalyzeRequest(BaseModel):
 source: str='manual'
 text: str
class ThesisRequest(BaseModel):
 ticker: str
 title: str='Manual thesis'
 summary: str
 full_text: str
class ManualHoldingRequest(BaseModel):
 ticker: str
 name: str
 asset_type: str='Stock'
 broker: str='Manual'
 quantity: float
 avg_price: float
 currency: str='USD'
 notes: str=''

THESIS_STORE={}
TRANSACTIONS=[]

def get_portfolio_payload():
 import services.state as state_module
 macros=macro_snapshot()
 if os.getenv('IBKR_ENABLED','false').lower()=='true' and get_ibkr_portfolio:
  try:
   p=get_ibkr_portfolio()
   # enrich live with exposure/risk/trade engine compatible fields
   from services.state import compute_exposures, risk_doctor, today_actions, stress_tests
   p['exposures']=compute_exposures(p.get('positions',[]),p.get('total_value',0))
   p['guardrails']=risk_doctor(p.get('positions',[]),macros)
   p['today_actions']=today_actions(p.get('positions',[]),macros)
   p['stress_tests']=stress_tests(p.get('total_value',0))
   return merge_manual_holdings(p,macros,state_module)
  except Exception as e:
   demo=portfolio_snapshot(); demo['source']='DEMO_FALLBACK'; demo['ibkr_error']=str(e); return merge_manual_holdings(demo,macros,state_module)
 return merge_manual_holdings(portfolio_snapshot(),macros,state_module)

def payload():
 p=get_portfolio_payload(); m=macro_snapshot()
 return {'type':'dashboard_update','portfolio':p,'macros':m,'news':news_items(),'scanner':scanner_items(p.get('positions',[]),m,WATCHLIST),'calendar':catalyst_calendar(),'watchlist':[opportunity_for(w,m) for w in WATCHLIST]}

async def stream_loop():
 while True:
  await manager.broadcast(payload())
  await asyncio.sleep(1.5)

@asynccontextmanager
async def lifespan(app: FastAPI):
 asyncio.create_task(stream_loop()); yield

app=FastAPI(title='Personal Investment Agent v5.6', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_credentials=True, allow_methods=['*'], allow_headers=['*'])

@app.get('/health')
def health():
 settings=get_settings()
 return {'ok':True,'app':'Personal Investment Agent','version':'v5.6','ibkr_enabled':os.getenv('IBKR_ENABLED','false').lower()=='true','settings_db':True,'configured_sources':[k for k,v in settings.items() if isinstance(v,dict) and v.get('enabled')]}

def command_available(command:str, args:list[str], timeout:float=1.5)->bool:
 if not shutil.which(command):
  return False
 try:
  subprocess.run([command,*args], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=timeout, check=False)
  return True
 except Exception:
  return False

def command_ok(command:str, args:list[str], timeout:float=1.5)->bool:
 if not shutil.which(command):
  return False
 try:
  result=subprocess.run([command,*args], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=timeout, check=False)
  return result.returncode==0
 except Exception:
  return False

def port_reachable(host:str, port:int, timeout:float=0.8)->bool:
 try:
  with socket.create_connection((host,port), timeout=timeout):
   return True
 except OSError:
  return False

def ibkr_authenticated(timeout:float=1.2)->bool:
 try:
  context=ssl._create_unverified_context()
  with urllib.request.urlopen('https://localhost:5000/v1/api/iserver/auth/status', timeout=timeout, context=context) as response:
   if response.status != 200:
    return False
   import json
   data=json.loads(response.read().decode('utf-8'))
   return bool(data.get('authenticated'))
 except (urllib.error.URLError, TimeoutError, ValueError, OSError):
  return False

@app.get('/setup/diagnostics')
def setup_diagnostics():
 gateway_running=port_reachable('127.0.0.1',5000,0.6)
 return {
  'backend_ok':True,
  'java_installed':command_available('java',['-version'],1.0),
  'docker_installed':command_available('docker',['--version'],1.0),
  'docker_daemon_running':command_ok('docker',['info'],1.5),
  'gateway_running':gateway_running,
  'ibkr_gateway_reachable':gateway_running,
  'ibkr_authenticated':ibkr_authenticated(1.0) if gateway_running else False,
  'demo_mode_available':True,
  'frontend_ok':True,
 }

@app.get('/portfolio')
def portfolio(): return get_portfolio_payload()
@app.get('/manual-holdings')
def manual_holdings(): return list_manual_holdings()
@app.get('/instruments/search')
def instruments_search(q:str='', limit:int=8):
 try:
  return {'query':q,'matches':yahoo_symbol_search(q, max(1, min(limit, 12)))}
 except InstrumentSearchError as e:
  raise HTTPException(status_code=503, detail=str(e))
@app.get('/ticker-lookup')
def ticker_lookup(q:str=''):
 return instruments_search(q)
@app.post('/manual-holdings')
def manual_holdings_create(req:ManualHoldingRequest):
 try:
  return create_manual_holding(req.model_dump())
 except ValueError as e:
  raise HTTPException(status_code=400, detail=str(e))
@app.put('/manual-holdings/{holding_id}')
def manual_holdings_update(holding_id:str, req:ManualHoldingRequest):
 try:
  updated=update_manual_holding(holding_id, req.model_dump())
 except ValueError as e:
  raise HTTPException(status_code=400, detail=str(e))
 if not updated: raise HTTPException(status_code=404, detail='Manual holding not found')
 return updated
@app.delete('/manual-holdings/{holding_id}')
def manual_holdings_delete(holding_id:str):
 if not delete_manual_holding(holding_id): raise HTTPException(status_code=404, detail='Manual holding not found')
 return {'ok':True,'id':holding_id}
@app.get('/dashboard')
def dashboard(): return payload()
@app.get('/macros')
def macros(): return macro_snapshot()
@app.get('/news')
def news(): return news_items()
@app.get('/news-intelligence')
def news_intelligence(): return get_news_intelligence()
@app.get('/news/{ticker}')
def ticker_news(ticker:str): return yahoo_news(ticker.upper()) or [n for n in news_items() if n.get('ticker')==ticker.upper()]
@app.get('/fundamentals/{ticker}')
def fundamentals(ticker:str): return yahoo_fundamentals(ticker.upper())
@app.get('/scanner')
def scanner():
 p=get_portfolio_payload(); return scanner_items(p.get('positions',[]),macro_snapshot(),WATCHLIST)
@app.post('/scanner/rescan')
def rescan(): return {'ok':True,'message':'Rescan complete','dashboard':payload()}
@app.get('/watchlist')
def watchlist(): return [opportunity_for(w,macro_snapshot()) for w in WATCHLIST]
@app.get('/stock/{ticker}')
def stock(ticker:str):
 t=ticker.upper().split()[0]; p=get_portfolio_payload(); pos=next((x for x in p.get('positions',[]) if x.get('symbol','').split()[0].upper()==t or x.get('underlying','').upper()==t),None)
 wl=next((x for x in WATCHLIST if x['symbol']==t),None)
 macro=macro_snapshot(); calendar=catalyst_calendar(); news_intel=get_ticker_news_intelligence(t)
 forecast={'bull':'Momentum + positive catalysts continue','base':'Range trade until news confirms thesis','bear':'Macro/yields or thesis deterioration pressures multiple'}
 return {'ticker':t,'position':pos,'watch':opportunity_for(wl,macro) if wl else None,'news':(yahoo_news(t) or [n for n in news_items() if n.get('ticker')==t]),'news_intelligence':news_intel,'intelligence':build_stock_panel_intelligence(t,pos,opportunity_for(wl,macro) if wl else None,macro,forecast,news_intel,calendar),'thesis':THESIS_STORE.get(t,[]),'fundamentals':yahoo_fundamentals(t),'forecast':forecast}
@app.post('/thesis')
def save_thesis(req:ThesisRequest):
 THESIS_STORE.setdefault(req.ticker.upper(),[]).append({'title':req.title,'summary':req.summary,'full_text':req.full_text})
 return {'ok':True,'count':len(THESIS_STORE[req.ticker.upper()])}
@app.post('/analyze')
def analyze(req:AnalyzeRequest):
 upper=req.text.upper(); tickers=[t for t in ['AMD','NVDA','NBIS','SOFI','SOUN','MELI','IREN','AVAV','CRWV','TSLA','META','GOOGL','QQQ','SPY','BTC'] if t in upper]
 return {'source':req.source,'tickers':tickers,'urgency':'High' if tickers else 'Medium','summary':'Signal parsed and routed to Advisor Intel / Trade Radar.','action':'Check portfolio weight, macro regime and entry/stop before acting.'}
@app.post('/tax/import')
async def tax_import(file:UploadFile=File(...)):
 raw=(await file.read()).decode('utf-8', errors='ignore'); rows=[]
 try:
  reader=csv.DictReader(io.StringIO(raw)); rows=list(reader)
 except Exception: rows=[]
 net_taxable_gain=0.0; trades=[]
 for r in rows[:500]:
  ticker=(r.get('Symbol') or r.get('symbol') or r.get('Ticker') or '').upper()
  try:
   gain=float(r.get('Realized P/L') or r.get('realized') or r.get('PnL') or 0)
  except Exception:
   gain=0.0
  desc=(r.get('Description') or r.get('description') or '').upper()
  is_ucits='UCITS' in desc
  taxable_component=0.0 if is_ucits else gain
  net_taxable_gain += taxable_component
  trades.append({'ticker':ticker,'gain':gain,'taxable_component':round(taxable_component,2),'ucits':is_ucits})
 estimated_tax=max(net_taxable_gain,0)*0.15
 return {'ok':True,'trades':trades,'net_taxable_gain':round(net_taxable_gain,2),'estimated_tax':round(estimated_tax,2),'rule':'Greece estimate: 15% on net stock/options gains after loss offset; UCITS ETFs excluded.'}

@app.get('/settings/integrations')
def integrations_settings():
 return get_settings()

@app.post('/settings/integrations')
def integrations_save(settings:dict):
 return {'ok':True,'settings':save_settings(settings)}

@app.get('/settings/integrations/test/{source}')
def integrations_test(source:str):
 return test_source(source, get_settings())

@app.get('/source-health')
def source_health_endpoint():
 return source_health(get_settings())

@app.get('/about')
def about():
 return {
  'app':'Personal Investment Agent',
  'version':'v5.6',
  'tagline':'Personalized investment decision platform, not a generic market dashboard.',
  'changelog':[
   {'version':'v5.6','title':'Integration + Product Hardening','features':['Integration Center UI/API','IBKR in-app config scaffold','Yahoo connector: news/fundamentals health','Seeking Alpha RSS + authenticated session-cookie deep parsing scaffold','RSS/email adapter scaffolding','Settings persistence in SQLite','Source Health Monitor','About/Changelog/QA Center','TradingView chart embed in stock drawer','Widget order persistence scaffold'], 'deferred':['Discord cloud connector','AI reasoning API','Chart OCR']},
   {'version':'v5.5','title':'Intelligence Workbench','features':['Live IBKR structure','Portfolio Snapshot','Positions tabs','Exposure Map','Risk Doctor','Opportunity Board','Rules-based Trade Engine','Stock Intelligence Drawer','Tax/Transactions shell','Thesis Vault shell'], 'bugs_fixed':['IBKR persistent connection approach','Demo fallback visibility','Rescan endpoint shell']},
   {'version':'v5.3','title':'Black UI / Tax / Live Prep','features':['Black UI','Tax center shell','Market strip','Portfolio scanner shell'], 'bugs_fixed':['frontend TypeScript fixes','environment setup issues']}
  ],
  'known_issues':['Seeking Alpha authenticated parsing depends on user subscription/session and may break if site changes.','Yahoo public endpoints are best-effort and should have fallback providers later.','Discord Advisor Connector is scoped for V5.7+.'],
  'next_version':['Discord Advisor Intel connector','Persistent drag/drop resize grid','AI Lite optional layer','Chart screenshot/OCR later']
 }

@app.get('/qa-checklist')
def qa_checklist():
 return {
  'version':'v5.6',
  'groups':[
   {'name':'Core UI','items':['Dashboard loads','No layout jumping','Mobile responsive','Privacy toggle','About/Changelog visible']},
   {'name':'IBKR','items':['Health true','Portfolio source IBKR_LIVE when enabled','Options formatted','No client reconnect spam','Buying power/margin visible']},
   {'name':'Integrations','items':['Settings save/reload','IBKR test button','Yahoo test receives data','Seeking Alpha RSS test receives data','Source Health Monitor updates']},
   {'name':'Portfolio/Trade','items':['Positions tabs','Exposure map','Risk Doctor','Trade Engine entries/stops/targets','Rescan refresh']},
   {'name':'Tax','items':['Import works','15% Greek gains logic','Loss offset','UCITS exemption flag']}
  ]
 }

@app.websocket('/ws')
async def ws(ws:WebSocket):
 await manager.connect(ws)
 try:
  await ws.send_json(payload())
  while True: await ws.receive_text()
 except Exception:
  manager.disconnect(ws)
