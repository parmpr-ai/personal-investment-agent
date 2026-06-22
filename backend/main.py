import os, asyncio, csv, io, shutil, socket, ssl, subprocess, time, urllib.request, urllib.error
from typing import Optional
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from services.state import portfolio_snapshot, macro_snapshot, news_items, catalyst_calendar, WATCHLIST
from services.trade_engine import scanner_items, opportunity_for
from services.ws import manager
from services.settings_store import get_settings, save_settings, initialize_settings_store
from services.portfolio_providers import get_data_source_mode, set_data_source_mode, get_provider_status, resolve_portfolio_provider, _PROVIDER_MODES, get_snapshot_history, normalize_positions, get_live_quote_trace, SnapshotPortfolioProvider, IbkrLivePortfolioProvider
from services.connectors import InstrumentSearchError, source_health, test_source, yahoo_news, yahoo_fundamentals, yahoo_symbol_search
from services.manual_holdings import create_manual_holding, delete_manual_holding, list_manual_holdings, merge_manual_holdings, update_manual_holding, initialize_manual_holdings_store
from services.news_intelligence import get_news_intelligence
from services.stock_intelligence import build_stock_panel_intelligence, get_ticker_news_intelligence
from services.ai_intelligence import build_ai_intelligence, build_ai_intelligence_test
from services.ai_intelligence_engine import build_ai_intelligence_score
from services.ai_intelligence_context import build_ai_intelligence_context, build_ai_intelligence_context_batch, context_score_kwargs
from services.ai_research import AIResearchResponse, build_ai_research
from services.performance_timing import AIRequestTimingMiddleware, TimedJSONResponse, time_stage
from services.provider_cache import cached_provider_call, initialize_provider_cache
from services.source_registry import build_source_coverage, build_source_status, build_symbol_inputs
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
 ticker: str=''
 name: str=''
 asset_type: str='Stock'
 broker: str='Manual'
 quantity: float=0.0
 avg_price: float=0.0
 currency: str='USD'
 notes: str=''
 underlying: Optional[str]=None
 expiry: Optional[str]=None
 strike: Optional[float]=None
 callPut: Optional[str]=None
 assetClass: Optional[str]=None
 multiplier: Optional[float]=None

THESIS_STORE={}
TRANSACTIONS=[]
FRONTEND_CONTRACT_SCHEMA_VERSION='ARTEMIS-AI-007.0'

_ROUTE_CACHE_TTL_SECONDS = {
 "dashboard": 8,
 "stock": 10,
 "context": 10,
 "context_batch": 10,
 "provider_status": 2,
 "fundamentals": 12,
 "news": 12,
}

_DEBUG_QUOTE_SYMBOLS = ("AMD", "NVDA", "TSM", "SOFI")


def _route_source_status(name:str, status:str, latency_ms:float, *, fallback_used:bool=False, error:str|None=None, detail:str|None=None):
 safe_error = None
 if error:
  safe_error = str(error)
  if len(safe_error) > 220:
   safe_error = safe_error[:217] + "..."
 return {
  "name": name,
  "status": status,
  "latencyMs": round(float(latency_ms), 1),
  "fallbackUsed": bool(fallback_used),
  "error": safe_error,
  "detail": detail,
 }


def _route_cache(namespace:str, key:str, ttl_seconds:int, loader, fallback, wait_timeout_seconds:float, refresh:bool=False):
 return cached_provider_call(namespace, key, ttl_seconds, loader, wait_timeout_seconds=wait_timeout_seconds, fallback=fallback, refresh=refresh)


def _quick_portfolio_payload():
 p=portfolio_snapshot()
 p['positions']=normalize_positions(p.get('positions',[]))
 return p


def _cache_layers_debug():
 return {
  'quoteCacheTtlSeconds': 12,
  'portfolioCacheTtlSeconds': 12,
  'dashboardCacheTtlSeconds': _ROUTE_CACHE_TTL_SECONDS['dashboard'],
  'stockCacheTtlSeconds': _ROUTE_CACHE_TTL_SECONDS['stock'],
  'providerStatusCacheTtlSeconds': _ROUTE_CACHE_TTL_SECONDS['provider_status'],
  'contextCacheTtlSeconds': _ROUTE_CACHE_TTL_SECONDS['context'],
  'contextBatchCacheTtlSeconds': _ROUTE_CACHE_TTL_SECONDS['context_batch'],
  'yahooFundamentalsCacheTtlSeconds': _ROUTE_CACHE_TTL_SECONDS['fundamentals'],
  'yahooNewsCacheTtlSeconds': _ROUTE_CACHE_TTL_SECONDS['news'],
  'providerCacheDb': 'backend/pia_provider_cache.sqlite3',
 }


def _quote_source_label(resolution, meta:dict, position:dict|None):
 if resolution.active_source == 'IBKR_LIVE':
  if meta.get('pricesLive'):
   return 'LIVE'
  if meta.get('fallback_active'):
   return 'CACHE'
  return 'LIVE'
 if resolution.active_source == 'LAST_UPDATE':
  return 'LAST_UPDATE'
 if resolution.active_source == 'MOCK':
  return 'CACHE'
 if position and position.get('quoteSource') == 'IBKR_MARKETDATA_SNAPSHOT' and position.get('quoteLastRefresh'):
  return 'CACHE'
 return 'LAST_UPDATE' if resolution.snapshot_available else 'CACHE'


def _select_debug_positions(portfolio:dict, symbols:list[str]):
 wanted = [s.upper().split()[0] for s in symbols if s]
 positions = portfolio.get('positions', []) if isinstance(portfolio, dict) else []
 return [p for p in positions if str(p.get('symbol') or p.get('underlying') or '').upper().split()[0] in wanted]

def get_portfolio_payload():
 import services.state as state_module
 from services.state import compute_exposures, risk_doctor, today_actions, stress_tests
 macros=macro_snapshot()
 try:
  resolution=resolve_portfolio_provider()
  provider=resolution.provider
  p=provider.get_portfolio()
  configured_mode=resolution.configured_mode
  p['configured_mode']=configured_mode
  p['mode']=p.get('mode') or configured_mode
  p['active_source']=resolution.active_source
  p['fallback_active']=resolution.fallback_active
  if resolution.fallback_reason:
   p['fallback_reason']=resolution.fallback_reason
  p['provider_class']=resolution.provider_class
  p['snapshot_available']=p.get('snapshot_available', resolution.snapshot_available)
  p['snapshot_timestamp']=p.get('snapshot_timestamp') or resolution.snapshot_timestamp
  p['is_live']=bool(resolution.is_live)
  p['is_stale']=bool(resolution.is_stale or p.get('is_stale'))
  p['stale_reason']=resolution.stale_reason or p.get('stale_reason')
  p['pricesLive']=bool(p.get('pricesLive', False))
  p['pricesLastRefresh']=p.get('pricesLastRefresh')
  p['pricesAgeSeconds']=p.get('pricesAgeSeconds')
  p['positionsLastRefresh']=p.get('positionsLastRefresh') or p.get('positions_refreshed_at')
  p['summaryLastRefresh']=p.get('summaryLastRefresh') or p.get('summary_refreshed_at')
  p['lastRefresh']=p.get('lastRefresh') or p.get('refreshed_at') or resolution.snapshot_timestamp
  p['nextRefresh']=p.get('nextRefresh')
  p['isLiveUpdating']=p.get('isLiveUpdating', bool(resolution.is_live))
  p['positions']=normalize_positions(p.get('positions',[]))
  if not p.get('exposures'): p['exposures']=compute_exposures(p.get('positions',[]),p.get('total_value',0))
  if 'guardrails' not in p: p['guardrails']=risk_doctor(p.get('positions',[]),macros)
  if 'today_actions' not in p: p['today_actions']=today_actions(p.get('positions',[]),macros)
  if 'stress_tests' not in p: p['stress_tests']=stress_tests(p.get('total_value',0))
  if configured_mode == 'mock':
   return merge_manual_holdings(p,macros,state_module)
  return p
 except Exception as e:
  resolution=resolve_portfolio_provider()
  demo={
   'source': resolution.active_source or 'DISCONNECTED',
   'mode': resolution.configured_mode,
   'configured_mode': resolution.configured_mode,
   'active_source': resolution.active_source or 'DISCONNECTED',
   'fallback_active': True,
   'fallback_reason': resolution.fallback_reason or str(e),
   'provider_class': resolution.provider_class,
   'snapshot_available': resolution.snapshot_available,
   'snapshot_timestamp': resolution.snapshot_timestamp,
   'is_live': resolution.is_live,
   'is_stale': True,
   'stale_reason': resolution.stale_reason or str(e),
   'lastRefresh': resolution.snapshot_timestamp,
   'nextRefresh': None,
   'isLiveUpdating': False,
   'pricesLive': False,
   'pricesLastRefresh': None,
   'pricesAgeSeconds': None,
   'positionsLastRefresh': None,
   'summaryLastRefresh': None,
   'total_value': 0,
   'cost_basis': 0,
   'daily_pnl': 0,
   'daily_pnl_pct': 0,
   'unrealized': 0,
   'unrealized_pct': 0,
   'cash': 0,
   'buying_power': 0,
   'margin_used': 0,
   'risk_mode': 'DISCONNECTED',
   'positions': [],
   'exposures': {'rows': [], 'top_name': None, 'top_pct': 0},
   'guardrails': [],
   'today_actions': [],
   'stress_tests': [],
   'journal': [],
  }
  demo['provider_error']=str(e)
  demo['positions']=normalize_positions(demo.get('positions',[]))
  if resolution.configured_mode == 'mock':
   return merge_manual_holdings(demo,macros,state_module)
  return demo

def payload():
 p=get_portfolio_payload(); m=macro_snapshot()
 return {'type':'dashboard_update','portfolio':p,'macros':m,'news':news_items(),'scanner':scanner_items(p.get('positions',[]),m,WATCHLIST),'calendar':catalyst_calendar(),'watchlist':[opportunity_for(w,m) for w in WATCHLIST]}

async def stream_loop():
 while True:
  snapshot=await asyncio.to_thread(payload)
  await manager.broadcast(snapshot)
  await asyncio.sleep(1.5)

@asynccontextmanager
async def lifespan(app: FastAPI):
 initialize_settings_store(); initialize_manual_holdings_store(); initialize_provider_cache()
 stream_task=asyncio.create_task(stream_loop())
 try:
  yield
 finally:
  stream_task.cancel()

app=FastAPI(title='Personal Investment Agent v5.6', lifespan=lifespan, default_response_class=TimedJSONResponse)
app.add_middleware(AIRequestTimingMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_credentials=True, allow_methods=['*'], allow_headers=['*'])

@app.middleware("http")
async def no_store_portfolio_cache(request, call_next):
 response = await call_next(request)
 if request.url.path.startswith(('/api/portfolio', '/portfolio', '/dashboard')):
  response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
  response.headers['Pragma'] = 'no-cache'
 return response

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
def dashboard():
 def loader():
  return _build_dashboard_payload()
 fallback=_build_dashboard_partial('Dashboard data is still warming up.')
 return _route_cache('route', 'dashboard', _ROUTE_CACHE_TTL_SECONDS['dashboard'], loader, fallback, wait_timeout_seconds=0.8)
@app.get('/macros')
def macros(): return macro_snapshot()
@app.get('/news')
def news(): return news_items()
@app.get('/news-intelligence')
def news_intelligence(): return get_news_intelligence()
@app.get('/news/{ticker}')
def ticker_news(ticker:str):
 symbol=ticker.upper()
 def loader():
  start=time.perf_counter()
  items=yahoo_news(symbol)
  return {
   'ticker': symbol,
   'status': 'ok' if items else 'missing',
   'items': items or [n for n in news_items() if n.get('ticker')==symbol],
   'sourceStatus': {
    'news': _route_source_status('news', 'ok' if items else 'missing', (time.perf_counter()-start)*1000, fallback_used=not bool(items)),
   },
  }
 fallback={'ticker': symbol, 'status': 'partial', 'items': [n for n in news_items() if n.get('ticker')==symbol], 'sourceStatus': {'news': _route_source_status('news', 'timeout', 0, fallback_used=True, detail='Yahoo news timed out.')}}
 return _route_cache('route', f'news:{symbol}', _ROUTE_CACHE_TTL_SECONDS['news'], loader, fallback, wait_timeout_seconds=0.6)
@app.get('/fundamentals/{ticker}')
def fundamentals(ticker:str):
 symbol=ticker.upper()
 def loader():
  start=time.perf_counter()
  data=yahoo_fundamentals(symbol, wait_timeout_seconds=0.75)
  return {
   **data,
   'status': data.get('status') or 'ok',
   'sourceStatus': {
    'fundamentals': _route_source_status('fundamentals', str(data.get('status') or 'ok'), (time.perf_counter()-start)*1000, fallback_used=data.get('status') not in {'ok','partial'}, detail=data.get('source')),
   },
  }
 fallback={'ticker': symbol, 'status': 'partial', 'source': 'cache', 'sourceStatus': {'fundamentals': _route_source_status('fundamentals', 'timeout', 0, fallback_used=True, detail='Yahoo fundamentals timed out.')}}
 return _route_cache('route', f'fundamentals:{symbol}', _ROUTE_CACHE_TTL_SECONDS['fundamentals'], loader, fallback, wait_timeout_seconds=0.6)
@app.get('/ai-intelligence/test')
def ai_intelligence_test(symbols:str='NVDA,AMD,SOFI,NBIS', refresh:bool=False):
 return build_ai_intelligence_test([s.strip() for s in symbols.split(',') if s.strip()], refresh=refresh)
@app.get('/ai-intelligence/{symbol}')
def ai_intelligence(symbol:str, refresh:bool=False):
 def loader():
  start=time.perf_counter()
  data=build_ai_intelligence(symbol, refresh=refresh)
  return {**data, 'status': data.get('status') or 'ok', 'performanceMs': round((time.perf_counter()-start)*1000, 1)}
 fallback={'symbol': symbol.upper().split()[0], 'status': 'partial', 'sourceStatus': {'aiIntelligence': _route_source_status('aiIntelligence', 'timeout', 0, fallback_used=True, detail='AI intelligence timed out.')}}
 return _route_cache('route', f'ai:{symbol.upper().split()[0]}', 10, loader, fallback, wait_timeout_seconds=0.8)
@app.get('/scanner')
def scanner():
 p=get_portfolio_payload(); return scanner_items(p.get('positions',[]),macro_snapshot(),WATCHLIST)
@app.post('/scanner/rescan')
def rescan(): return {'ok':True,'message':'Rescan complete','dashboard':payload()}
def _intelligence_provider_status():
 try:
  from services.portfolio_providers import get_provider_status as provider_status
  return provider_status()
 except Exception as e:
  return {'status':'missing','message':f'Portfolio provider status unavailable: {e}'}


def _build_dashboard_payload():
 t0=time.perf_counter()
 portfolio_start=time.perf_counter()
 portfolio=get_portfolio_payload()
 portfolio_ms=(time.perf_counter()-portfolio_start)*1000
 macro_start=time.perf_counter()
 macro=macro_snapshot()
 macro_ms=(time.perf_counter()-macro_start)*1000
 news_start=time.perf_counter()
 news=news_items()
 news_ms=(time.perf_counter()-news_start)*1000
 scanner_start=time.perf_counter()
 scanner=scanner_items(portfolio.get('positions',[]),macro,WATCHLIST)
 scanner_ms=(time.perf_counter()-scanner_start)*1000
 calendar_start=time.perf_counter()
 calendar=catalyst_calendar()
 calendar_ms=(time.perf_counter()-calendar_start)*1000
 watchlist_start=time.perf_counter()
 watch=[opportunity_for(w,macro) for w in WATCHLIST]
 watchlist_ms=(time.perf_counter()-watchlist_start)*1000
 return {
  'type':'dashboard_update',
  'status':'ok',
  'portfolio':portfolio,
  'macros':macro,
  'news':news,
  'scanner':scanner,
  'calendar':calendar,
  'watchlist':watch,
  'sourceStatus':{
   'portfolio': _route_source_status('portfolio', 'ok', portfolio_ms, fallback_used=False),
   'macro': _route_source_status('macro', 'ok', macro_ms, fallback_used=False),
   'news': _route_source_status('news', 'ok', news_ms, fallback_used=False),
   'scanner': _route_source_status('scanner', 'ok', scanner_ms, fallback_used=False),
   'calendar': _route_source_status('calendar', 'ok', calendar_ms, fallback_used=False),
   'watchlist': _route_source_status('watchlist', 'ok', watchlist_ms, fallback_used=False),
  },
  'performanceMs': round((time.perf_counter()-t0)*1000, 1),
 }


def _build_dashboard_partial(reason:str):
 portfolio=_quick_portfolio_payload()
 macro=macro_snapshot()
 news=news_items()
 scanner=scanner_items(portfolio.get('positions',[]),macro,WATCHLIST)
 calendar=catalyst_calendar()
 watch=[opportunity_for(w,macro) for w in WATCHLIST]
 return {
  'type':'dashboard_update',
  'status':'partial',
  'portfolio':portfolio,
  'macros':macro,
  'news':news,
  'scanner':scanner,
  'calendar':calendar,
  'watchlist':watch,
  'sourceStatus':{
   'portfolio': _route_source_status('portfolio', 'stale', 0, fallback_used=True, detail=reason),
   'macro': _route_source_status('macro', 'ok', 0, fallback_used=False),
   'news': _route_source_status('news', 'ok', 0, fallback_used=False),
   'scanner': _route_source_status('scanner', 'ok', 0, fallback_used=False),
   'calendar': _route_source_status('calendar', 'ok', 0, fallback_used=False),
   'watchlist': _route_source_status('watchlist', 'ok', 0, fallback_used=False),
  },
  'staleReason': reason,
  'performanceMs': 0,
 }


def _build_stock_payload(t:str):
 portfolio_start=time.perf_counter()
 portfolio=get_portfolio_payload()
 portfolio_ms=(time.perf_counter()-portfolio_start)*1000
 pos=next((x for x in portfolio.get('positions',[]) if x.get('symbol','').split()[0].upper()==t or x.get('underlying','').upper()==t),None)
 wl=next((x for x in WATCHLIST if x['symbol']==t),None)
 macro_start=time.perf_counter()
 macro=macro_snapshot()
 macro_ms=(time.perf_counter()-macro_start)*1000
 calendar_start=time.perf_counter()
 calendar=catalyst_calendar()
 calendar_ms=(time.perf_counter()-calendar_start)*1000
 news_intel_start=time.perf_counter()
 news_intel=get_ticker_news_intelligence(t)
 news_intel_ms=(time.perf_counter()-news_intel_start)*1000
 fundamentals_start=time.perf_counter()
 fundamentals=yahoo_fundamentals(t, wait_timeout_seconds=0.65)
 fundamentals_ms=(time.perf_counter()-fundamentals_start)*1000
 forecast={'bull':'Momentum + positive catalysts continue','base':'Range trade until news confirms thesis','bear':'Macro/yields or thesis deterioration pressures multiple'}
 intel_start=time.perf_counter()
 intel=build_stock_panel_intelligence(t,pos,opportunity_for(wl,macro) if wl else None,macro,forecast,news_intel,calendar)
 intel_ms=(time.perf_counter()-intel_start)*1000
 news_items_value=(news_intel.get('items') or [n for n in news_items() if n.get('ticker')==t])
 return {
  'ticker':t,
  'status':'ok',
  'position':pos,
  'watch':opportunity_for(wl,macro) if wl else None,
  'news':news_items_value,
  'news_intelligence':news_intel,
  'intelligence':intel,
  'thesis':THESIS_STORE.get(t,[]),
  'fundamentals':fundamentals,
  'forecast':forecast,
  'sourceStatus':{
   'portfolio': _route_source_status('portfolio', 'ok', portfolio_ms, fallback_used=False),
   'macro': _route_source_status('macro', 'ok', macro_ms, fallback_used=False),
   'calendar': _route_source_status('calendar', 'ok', calendar_ms, fallback_used=False),
   'news': _route_source_status('news', 'ok', news_intel_ms, fallback_used=False if not news_intel.get('unavailable') else True, detail=news_intel.get('digest')),
   'fundamentals': _route_source_status('fundamentals', str(fundamentals.get('status') or 'ok'), fundamentals_ms, fallback_used=fundamentals.get('status') not in {'ok','partial'}, detail=fundamentals.get('source')),
   'intelligence': _route_source_status('intelligence', 'ok', intel_ms, fallback_used=False),
  },
  'performanceMs': round(portfolio_ms + macro_ms + calendar_ms + news_intel_ms + fundamentals_ms + intel_ms, 1),
 }


def _build_stock_partial(t:str, reason:str):
 portfolio=_quick_portfolio_payload()
 pos=next((x for x in portfolio.get('positions',[]) if x.get('symbol','').split()[0].upper()==t or x.get('underlying','').upper()==t),None)
 macro=macro_snapshot()
 calendar=catalyst_calendar()
 wl=next((x for x in WATCHLIST if x['symbol']==t),None)
 forecast={'bull':'Momentum + positive catalysts continue','base':'Range trade until news confirms thesis','bear':'Macro/yields or thesis deterioration pressures multiple'}
 news_intel={'is_demo':False,'unavailable':True,'digest':f'Live news temporarily unavailable for {t}.','items':[]}
 fundamentals={'ticker':t,'status':'partial','source':'cache','price':None,'currency':'USD'}
 return {
  'ticker':t,
  'status':'partial',
  'position':pos,
  'watch':opportunity_for(wl,macro) if wl else None,
  'news': [n for n in news_items() if n.get('ticker')==t],
  'news_intelligence': news_intel,
  'intelligence': build_stock_panel_intelligence(t,pos,opportunity_for(wl,macro) if wl else None,macro,forecast,news_intel,calendar),
  'thesis': THESIS_STORE.get(t,[]),
  'fundamentals': fundamentals,
  'forecast': forecast,
  'sourceStatus':{
   'portfolio': _route_source_status('portfolio', 'stale', 0, fallback_used=True, detail=reason),
   'news': _route_source_status('news', 'timeout', 0, fallback_used=True, detail=reason),
   'fundamentals': _route_source_status('fundamentals', 'timeout', 0, fallback_used=True, detail=reason),
   'intelligence': _route_source_status('intelligence', 'ok', 0, fallback_used=False),
  },
  'staleReason': reason,
  'performanceMs': 0,
 }


def _build_context_payload(t:str, refresh:bool=False, debug:bool=False):
 settings=get_settings()
 portfolio_start=time.perf_counter()
 p=get_portfolio_payload()
 portfolio_status=_intelligence_provider_status()
 portfolio_ms=(time.perf_counter()-portfolio_start)*1000
 watchlist_payload=WATCHLIST
 macro=macro_snapshot()
 calendar=catalyst_calendar()
 context_start=time.perf_counter()
 context=build_ai_intelligence_context(t, settings=settings, portfolio=p, macro=macro, calendar=calendar, watchlist=watchlist_payload, provider_status=portfolio_status, refresh=refresh, debug=debug)
 context_ms=(time.perf_counter()-context_start)*1000
 payload=context.get('frontendPayload') or {}
 if debug or context.get('missingDataReport'):
  payload = {**payload, 'contextPerformance': context.get('performance'), 'missingDataReport': context.get('missingDataReport')}
 payload.setdefault('status', 'ok')
 payload.setdefault('sourceStatus', context.get('sourceStatus') or {})
 payload['sourceStatus']['portfolio'] = _route_source_status('portfolio', 'ok', portfolio_ms, fallback_used=False)
 payload['sourceStatus']['context'] = _route_source_status('context', 'ok', context_ms, fallback_used=False)
 payload['sourceStatus']['provider'] = portfolio_status
 payload['performanceMs'] = round(portfolio_ms + context_ms, 1)
 return payload


def _build_context_partial(t:str, reason:str):
 portfolio_status=_intelligence_provider_status()
 return {
  'symbol': t,
  'schemaVersion': FRONTEND_CONTRACT_SCHEMA_VERSION,
  'status': 'partial',
  'sourceStatus': {
   'portfolio': _route_source_status('portfolio', 'stale', 0, fallback_used=True, detail=reason),
   'context': _route_source_status('context', 'timeout', 0, fallback_used=True, detail=reason),
   'provider': portfolio_status,
  },
  'contextPerformance': {'status': 'partial', 'timingMs': 0},
  'missingDataReport': {'status': 'partial', 'reason': reason},
  'staleReason': reason,
  'performanceMs': 0,
 }
@app.get('/api/intelligence/sources/status')
def intelligence_sources_status():
 settings=get_settings(); p=get_portfolio_payload(); macro=macro_snapshot()
 return build_source_status(settings, portfolio=p, macro=macro, calendar=catalyst_calendar(), provider_status=_intelligence_provider_status())
@app.get('/api/intelligence/sources/coverage')
def intelligence_sources_coverage():
 settings=get_settings(); p=get_portfolio_payload(); macro=macro_snapshot()
 return build_source_coverage(settings, portfolio=p, macro=macro, calendar=catalyst_calendar(), provider_status=_intelligence_provider_status())
@app.get('/api/intelligence/context/test')
def intelligence_context_test(symbols:str='AAPL,NVDA,AMD,TSM,PLTR', refresh:bool=False, debug:bool=False, contract:str='context'):
 cleaned=[s.strip() for s in symbols.split(',') if s.strip()]
 def loader():
  settings=get_settings(); p=get_portfolio_payload(); macro=macro_snapshot(); calendar=catalyst_calendar()
  batch=build_ai_intelligence_context_batch(cleaned, settings=settings, portfolio=p, macro=macro, calendar=calendar, watchlist=WATCHLIST, provider_status=_intelligence_provider_status(), refresh=refresh, debug=debug)
  if contract.lower()=='frontend':
   return {'type':'AIIntelligenceFrontendPayloadBatch','schemaVersion':batch.get('schemaVersion'),'symbols':batch.get('symbols'),'count':batch.get('count'),'payloads':batch.get('frontendPayloads'),'performance':batch.get('performance'),'missingDataReport':batch.get('missingDataReport'),'status':'ok'}
  return batch
 fallback={'type':'AIIntelligenceFrontendPayloadBatch','schemaVersion':'ARTEMIS-AI-007.0','symbols':cleaned,'count':len(cleaned),'payloads':{symbol: {'symbol': symbol, 'status': 'partial', 'sourceStatus': {'context': _route_source_status('context', 'timeout', 0, fallback_used=True, detail='AI context batch timed out.')}} for symbol in cleaned},'performance':{'status':'partial'},'missingDataReport':{'status':'partial','reason':'AI context batch timed out.'},'status':'partial'}
 return _route_cache('route', f'ctx-batch:{contract}:{",".join(cleaned)}', _ROUTE_CACHE_TTL_SECONDS['context_batch'], loader, fallback, wait_timeout_seconds=1.5)
@app.get('/api/intelligence/{symbol}/inputs')
def intelligence_symbol_inputs(symbol:str):
 t=symbol.upper().split()[0]
 def loader():
  settings=get_settings(); p=get_portfolio_payload(); macro=macro_snapshot(); calendar=catalyst_calendar()
  pos=next((x for x in p.get('positions',[]) if x.get('symbol','').split()[0].upper()==t or x.get('underlying','').upper()==t),None)
  wl=next((x for x in WATCHLIST if x['symbol']==t),None)
  watch=opportunity_for(wl,macro) if wl else None
  news_bundle=get_ticker_news_intelligence(t)
  fundamentals_data=yahoo_fundamentals(t, wait_timeout_seconds=0.55)
  news_data=news_bundle.get('items') or [n for n in news_items() if n.get('ticker')==t]
  return build_symbol_inputs(t, settings, portfolio=p, position=pos, watch=watch, macro=macro, calendar=calendar, fundamentals=fundamentals_data, news=news_data, news_intelligence=news_bundle, provider_status=_intelligence_provider_status())
 fallback={'symbol': t, 'status': 'partial', 'sourceStatus': {'inputs': _route_source_status('inputs', 'timeout', 0, fallback_used=True, detail='Symbol inputs timed out.')}}
 return _route_cache('route', f'inputs:{t}', 10, loader, fallback, wait_timeout_seconds=0.9)
@app.get('/api/intelligence/{symbol}/context')
def intelligence_symbol_context(symbol:str, refresh:bool=False, debug:bool=False, contract:str='context'):
 t=symbol.upper().split()[0]
 def loader():
  return _build_context_payload(t, refresh=refresh, debug=debug) if contract.lower()=='frontend' else build_ai_intelligence_context(t, settings=get_settings(), portfolio=get_portfolio_payload(), macro=macro_snapshot(), calendar=catalyst_calendar(), watchlist=WATCHLIST, provider_status=_intelligence_provider_status(), refresh=refresh, debug=debug)
 fallback=_build_context_partial(t, 'AI context payload timed out.')
 return _route_cache('route', f'ctx:{contract}:{t}', _ROUTE_CACHE_TTL_SECONDS['context'], loader, fallback, wait_timeout_seconds=1.1)
@app.get('/api/intelligence/{symbol}/research', response_model=AIResearchResponse)
def intelligence_symbol_research(symbol:str, refresh:bool=False, debug:bool=False):
 t=symbol.upper().split()[0]; settings=get_settings()
 with time_stage('Portfolio Provider'):
  p=get_portfolio_payload(); portfolio_status=_intelligence_provider_status()
 with time_stage('Watchlists Provider'): watchlist_payload=WATCHLIST
 macro=macro_snapshot(); calendar=catalyst_calendar()
 return build_ai_research(t, settings=settings, portfolio=p, macro=macro, calendar=calendar, watchlist=watchlist_payload, provider_status=portfolio_status, refresh=refresh, debug=debug)
def _score_provider_status(portfolio_payload:dict):
 return {'configured_mode':portfolio_payload.get('configured_mode'),'active_source':portfolio_payload.get('active_source') or portfolio_payload.get('source'),'fallback_active':portfolio_payload.get('fallback_active'),'status':'connected' if portfolio_payload.get('active_source')=='IBKR_LIVE' else ('fallback' if portfolio_payload.get('fallback_active') else 'connected')}
@app.get('/api/intelligence/{symbol}/score')
def intelligence_symbol_score(symbol:str, strategy:str='long_term', debug:bool=False, refresh:bool=False):
 t=symbol.upper().split()[0]; settings=get_settings(); p=get_portfolio_payload(); macro=macro_snapshot(); calendar=catalyst_calendar()
 context=build_ai_intelligence_context(t, settings=settings, portfolio=p, macro=macro, calendar=calendar, watchlist=WATCHLIST, provider_status=_intelligence_provider_status(), refresh=refresh, debug=False)
 score=build_ai_intelligence_score(t, settings=settings, **context_score_kwargs(context), strategy=strategy, debug=debug, refresh=refresh)
 if debug:
  score.setdefault('debug',{})['aiIntelligenceContext']={'schemaVersion':context.get('schemaVersion'),'coverage':context.get('coverage'),'missingDataReport':context.get('missingDataReport'),'performance':context.get('performance')}
 return score
@app.get('/watchlist')
def watchlist(): return [opportunity_for(w,macro_snapshot()) for w in WATCHLIST]
@app.get('/stock/{ticker}')
def stock(ticker:str):
 t=ticker.upper().split()[0]
 def loader():
  return _build_stock_payload(t)
 fallback=_build_stock_partial(t, 'Stock panel timed out or upstream provider was slow.')
 return _route_cache('route', f'stock:{t}', _ROUTE_CACHE_TTL_SECONDS['stock'], loader, fallback, wait_timeout_seconds=0.9)
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

# ── Portfolio Provider Routes ──────────────────────────────────────────────────

class DataSourceModeRequest(BaseModel):
 mode: str

@app.get('/api/portfolio/provider/status')
def portfolio_provider_status():
 def loader():
  start=time.perf_counter()
  status=get_provider_status()
  status['sourceStatus']={
   'provider': _route_source_status('provider', str(status.get('status') or 'unknown').lower(), (time.perf_counter()-start)*1000, fallback_used=False),
  }
  status['routeStatus']='ok'
  return status
 fallback={
  'status': 'partial',
  'message': 'Provider status warming up.',
  'configured_mode': get_data_source_mode(),
  'active_source': 'DISCONNECTED',
  'fallback_active': True,
  'fallback_reason': 'Provider status request timed out.',
  'provider_class': 'Unknown',
  'sourceStatus': {'provider': _route_source_status('provider', 'timeout', 0, fallback_used=True, detail='Provider status request timed out.')},
 }
 return _route_cache('route', 'provider-status', _ROUTE_CACHE_TTL_SECONDS['provider_status'], loader, fallback, wait_timeout_seconds=0.25)

@app.get('/api/portfolio/provider/mode')
def portfolio_provider_mode():
 return {'mode': get_data_source_mode()}

@app.post('/api/portfolio/provider/mode')
def portfolio_provider_mode_set(req: DataSourceModeRequest):
 if req.mode not in _PROVIDER_MODES:
  raise HTTPException(status_code=400, detail=f"Invalid mode '{req.mode}'. Must be one of: {', '.join(_PROVIDER_MODES)}")
 mode=set_data_source_mode(req.mode)
 return {'ok': True, 'mode': mode, 'status': get_provider_status()}

@app.get('/api/portfolio/live/positions')
def portfolio_live_positions():
 try:
  resolution=resolve_portfolio_provider()
  provider=resolution.provider
  portfolio_meta = provider.get_portfolio() if hasattr(provider, 'get_portfolio') else {}
  meta = portfolio_meta if isinstance(portfolio_meta, dict) else {}
  is_live = bool(resolution.is_live or meta.get('is_live'))
  is_stale = bool(resolution.is_stale or meta.get('is_stale'))
  return {
   'source': resolution.active_source,
   'mode': resolution.configured_mode,
   'configured_mode': resolution.configured_mode,
   'as_of': meta.get('as_of') or meta.get('snapshot_timestamp') or resolution.snapshot_timestamp,
   'lastRefresh': meta.get('lastRefresh') or meta.get('refreshed_at') or meta.get('as_of') or resolution.snapshot_timestamp,
   'nextRefresh': meta.get('nextRefresh'),
   'isLiveUpdating': meta.get('isLiveUpdating', bool(resolution.is_live)),
   'pricesLive': bool(meta.get('pricesLive', False)),
   'pricesLastRefresh': meta.get('pricesLastRefresh'),
   'pricesAgeSeconds': meta.get('pricesAgeSeconds'),
   'positionsLastRefresh': meta.get('positionsLastRefresh') or meta.get('positions_refreshed_at'),
   'summaryLastRefresh': meta.get('summaryLastRefresh') or meta.get('summary_refreshed_at'),
   'fallback_active': resolution.fallback_active,
   'fallback_reason': resolution.fallback_reason,
   'provider_class': resolution.provider_class,
   'snapshot_available': bool(resolution.snapshot_available or meta),
   'snapshot_timestamp': resolution.snapshot_timestamp or meta.get('snapshot_timestamp') or meta.get('as_of'),
   'is_live': bool(resolution.is_live),
   'is_stale': bool(resolution.is_stale or meta.get('is_stale')),
   'stale_reason': resolution.stale_reason or meta.get('stale_reason'),
   'positions': meta.get('positions') if isinstance(meta.get('positions'), list) else provider.get_positions()
  }
 except Exception as e:
  raise HTTPException(status_code=503, detail=str(e))

@app.get('/api/portfolio/live/summary')
def portfolio_live_summary():
 try:
  resolution=resolve_portfolio_provider()
  provider=resolution.provider
  meta = provider.get_runtime_status() if hasattr(provider, 'get_runtime_status') else (provider.get_snapshot_meta() if hasattr(provider, 'get_snapshot_meta') else {})
  summary=provider.get_summary()
  summary['configured_mode']=resolution.configured_mode
  summary['mode']=summary.get('mode') or resolution.configured_mode
  summary['source']=resolution.active_source
  summary['as_of']=summary.get('as_of') or meta.get('as_of') or meta.get('snapshot_timestamp') or resolution.snapshot_timestamp
  summary['lastRefresh']=summary.get('lastRefresh') or meta.get('lastRefresh') or meta.get('refreshed_at') or meta.get('as_of') or resolution.snapshot_timestamp
  summary['nextRefresh']=summary.get('nextRefresh') or meta.get('nextRefresh')
  summary['isLiveUpdating']=summary.get('isLiveUpdating', meta.get('isLiveUpdating', bool(resolution.is_live)))
  summary['pricesLive']=bool(summary.get('pricesLive', meta.get('pricesLive', False)))
  summary['pricesLastRefresh']=summary.get('pricesLastRefresh') or meta.get('pricesLastRefresh')
  if summary.get('pricesAgeSeconds') is None:
   summary['pricesAgeSeconds']=meta.get('pricesAgeSeconds')
  summary['positionsLastRefresh']=summary.get('positionsLastRefresh') or meta.get('positionsLastRefresh') or meta.get('positions_refreshed_at')
  summary['summaryLastRefresh']=summary.get('summaryLastRefresh') or meta.get('summaryLastRefresh') or meta.get('summary_refreshed_at')
  summary['fallback_active']=resolution.fallback_active
  summary['fallback_reason']=resolution.fallback_reason
  summary['provider_class']=resolution.provider_class
  summary['snapshot_available']=bool(resolution.snapshot_available or meta)
  summary['snapshot_timestamp']=resolution.snapshot_timestamp or meta.get('snapshot_timestamp') or meta.get('as_of')
  summary['is_live']=bool(resolution.is_live)
  summary['is_stale']=bool(resolution.is_stale or meta.get('is_stale'))
  summary['stale_reason']=resolution.stale_reason or meta.get('stale_reason')
  return summary
 except Exception as e:
  raise HTTPException(status_code=503, detail=str(e))

@app.get('/api/portfolio/live/trades')
def portfolio_live_trades():
 try:
  resolution=resolve_portfolio_provider()
  provider=resolution.provider
  portfolio_meta = provider.get_portfolio() if hasattr(provider, 'get_portfolio') else {}
  meta = portfolio_meta if isinstance(portfolio_meta, dict) else {}
  is_live = bool(resolution.is_live or meta.get('is_live'))
  is_stale = bool(resolution.is_stale or meta.get('is_stale'))
  return {
   'source': resolution.active_source,
   'mode': resolution.configured_mode,
   'configured_mode': resolution.configured_mode,
   'as_of': meta.get('as_of') or meta.get('snapshot_timestamp') or resolution.snapshot_timestamp,
   'lastRefresh': meta.get('lastRefresh') or meta.get('refreshed_at') or meta.get('as_of') or resolution.snapshot_timestamp,
   'nextRefresh': meta.get('nextRefresh'),
   'isLiveUpdating': meta.get('isLiveUpdating', bool(resolution.is_live)),
   'pricesLive': bool(meta.get('pricesLive', False)),
   'pricesLastRefresh': meta.get('pricesLastRefresh'),
   'pricesAgeSeconds': meta.get('pricesAgeSeconds'),
   'positionsLastRefresh': meta.get('positionsLastRefresh') or meta.get('positions_refreshed_at'),
   'summaryLastRefresh': meta.get('summaryLastRefresh') or meta.get('summary_refreshed_at'),
   'fallback_active': resolution.fallback_active,
   'fallback_reason': resolution.fallback_reason,
   'provider_class': resolution.provider_class,
   'snapshot_available': bool(resolution.snapshot_available or meta),
   'snapshot_timestamp': resolution.snapshot_timestamp or meta.get('snapshot_timestamp') or meta.get('as_of'),
  'is_live': bool(resolution.is_live),
  'is_stale': bool(resolution.is_stale or meta.get('is_stale')),
   'stale_reason': resolution.stale_reason or meta.get('stale_reason'),
   'trades': provider.get_trades()
  }
 except Exception as e:
  raise HTTPException(status_code=503, detail=str(e))


@app.get('/api/debug/live-status')
def debug_live_status():
 try:
  provider_status = portfolio_provider_status()
  quote_trace = get_live_quote_trace(limit=20)
  last_quote_received = quote_trace[0] if quote_trace else None
  active_source = str(provider_status.get('active_source') or '').upper()
  market_data_subscribed = bool(active_source == 'IBKR_LIVE' and provider_status.get('pricesLive'))
  account_connected = bool(provider_status.get('accounts_available') or provider_status.get('positions_available'))
  gateway_connected = bool(provider_status.get('ibkr_gateway_reachable') and provider_status.get('ibkr_authenticated'))
  positions_live = bool(provider_status.get('is_live'))
  prices_live = bool(provider_status.get('is_live') and provider_status.get('pricesLive'))
  return {
   'gatewayConnected': gateway_connected,
   'accountConnected': account_connected,
   'marketDataSubscribed': market_data_subscribed,
   'pricesLive': prices_live,
   'positionsLive': positions_live,
   'lastQuoteReceived': last_quote_received,
   'quoteAgeSeconds': provider_status.get('pricesAgeSeconds'),
   'providerStatus': provider_status,
   'portfolioStatus': {
    'source': provider_status.get('active_source'),
    'mode': provider_status.get('configured_mode'),
    'is_live': provider_status.get('is_live'),
    'is_stale': provider_status.get('is_stale'),
    'pricesLive': provider_status.get('pricesLive'),
    'pricesLastRefresh': provider_status.get('pricesLastRefresh'),
    'positionsLastRefresh': provider_status.get('positionsLastRefresh'),
    'summaryLastRefresh': provider_status.get('summaryLastRefresh'),
   },
   'cacheLayers': _cache_layers_debug(),
   'providerTrace': quote_trace[:10],
   'providerClass': provider_status.get('provider_class'),
  }
 except Exception as e:
  raise HTTPException(status_code=503, detail=str(e))


@app.get('/api/debug/live-quotes')
def debug_live_quotes():
 try:
  provider_status = portfolio_provider_status()
  active_source = str(provider_status.get('active_source') or '').upper()
  provider = IbkrLivePortfolioProvider() if active_source == 'IBKR_LIVE' else SnapshotPortfolioProvider()
  positions = provider.get_positions() if hasattr(provider, 'get_positions') else []
  meta = provider.get_snapshot_meta() if hasattr(provider, 'get_snapshot_meta') else {}
  positions = _select_debug_positions({'positions': positions}, list(_DEBUG_QUOTE_SYMBOLS))
  quote_trace = get_live_quote_trace(limit=50)
  trace_lookup = {}
  for row in quote_trace:
   key = f"{str(row.get('symbol') or '').upper().split()[0]}:{str(row.get('conid') or '')}"
   trace_lookup.setdefault(key, row)
  output = []
  for symbol in _DEBUG_QUOTE_SYMBOLS:
   pos = next((row for row in positions if str(row.get('symbol') or row.get('underlying') or '').upper().split()[0] == symbol), None)
   key = f"{symbol}:{str(pos.get('conid') or '')}" if pos else f"{symbol}:"
   trace = trace_lookup.get(key)
   timestamp = None
   age_seconds = None
   source = 'LAST_UPDATE'
   if trace:
    timestamp = trace.get('quoteTimestamp') or trace.get('serverTimestamp')
    age_seconds = trace.get('ageSeconds')
    source = trace.get('source') or source
   elif pos:
    timestamp = pos.get('quoteLastRefresh') or pos.get('lastRefresh') or meta.get('lastRefresh')
    age_seconds = pos.get('quoteAgeSeconds')
    source = _quote_source_label(type('Resolution', (), {'active_source': active_source, 'snapshot_available': bool(provider_status.get('snapshot_available'))}), meta, pos)
   output.append({
    'symbol': symbol,
    'conid': pos.get('conid') if pos else None,
    'price': pos.get('last') if pos else None,
    'timestamp': timestamp,
    'ageSeconds': age_seconds,
    'source': source,
    'quoteTimestamp': timestamp,
    'serverTimestamp': trace.get('serverTimestamp') if trace else meta.get('lastRefresh') or meta.get('snapshot_timestamp'),
   })
  return {
   'gatewayConnected': bool(provider_status.get('ibkr_gateway_reachable') and provider_status.get('ibkr_authenticated')),
   'accountConnected': bool(provider_status.get('accounts_available') or provider_status.get('positions_available')),
   'marketDataSubscribed': bool(provider_status.get('is_live') and (provider_status.get('pricesLive') or meta.get('pricesLive'))),
   'pricesLive': bool(provider_status.get('is_live') and (provider_status.get('pricesLive') or meta.get('pricesLive'))),
   'positionsLive': bool(provider_status.get('is_live')),
   'lastQuoteReceived': output[0] if output else None,
   'quoteAgeSeconds': provider_status.get('pricesAgeSeconds') or meta.get('pricesAgeSeconds'),
   'quotes': output,
   'providerTrace': quote_trace[:20],
   'cacheLayers': _cache_layers_debug(),
   'providerClass': provider_status.get('provider_class'),
   'source': provider_status.get('active_source'),
   'fallbackActive': provider_status.get('fallback_active'),
   'fallbackReason': provider_status.get('fallback_reason'),
  }
 except Exception as e:
  raise HTTPException(status_code=503, detail=str(e))

@app.get('/api/portfolio/history')
def portfolio_history(limit:int=90):
 history = get_snapshot_history(limit=limit if limit > 0 else None)
 return {
  'source':'IBKR_LIVE',
  'count':len(history),
  'items':history,
 }

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

@app.get('/ibkr/executions')
def ibkr_executions(symbol:str|None=None):
 """
 Fetch live executions from IBKR (if enabled), persist to DB, return full history.
 GET /ibkr/executions
 GET /ibkr/executions?symbol=AMD
 """
 from services.analytics_store import get_executions, store_executions
 newly_imported=0
 ibkr_fetch=False
 fetch_error=None
 if os.getenv('IBKR_ENABLED','false').lower()=='true' and get_ibkr_portfolio:
  try:
   from services.ibkr_service import get_ibkr_executions
   fills=get_ibkr_executions(symbol)
   if fills:
    result=store_executions(fills)
    newly_imported=result['stored']
   ibkr_fetch=True
  except Exception as e:
   fetch_error=str(e)
 executions=get_executions(symbol)
 return {'ok':True,'symbol':symbol,'ibkr_fetch':ibkr_fetch,'fetch_error':fetch_error,'newly_imported':newly_imported,'count':len(executions),'executions':executions}

@app.post('/portfolio/snapshot')
def portfolio_snapshot_capture(force:bool=False):
 """
 Capture today's portfolio and position snapshots.
 Safe to call multiple times — duplicates are skipped unless ?force=true.
 POST /portfolio/snapshot
 POST /portfolio/snapshot?force=true
 """
 from services.analytics_store import capture_portfolio_snapshot
 portfolio=get_portfolio_payload()
 return capture_portfolio_snapshot(portfolio,force=force)

@app.get('/positions/{symbol}/history')
def position_history(symbol:str,range:str='ALL'):
 """
 Return position value series, trade markers, and analytics summary for a symbol.
 Supported ranges: 1W, 1M, 3M, YTD, 1Y, ALL
 GET /positions/AMD/history
 GET /positions/AMD/history?range=1M
 """
 from services.analytics_store import get_position_history
 return get_position_history(symbol.upper(),range.upper())

@app.websocket('/ws')
async def ws(ws:WebSocket):
 await manager.connect(ws)
 try:
  await ws.send_json(payload())
  while True: await ws.receive_text()
 except Exception:
  manager.disconnect(ws)
