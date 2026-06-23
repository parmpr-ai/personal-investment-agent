import os, asyncio, csv, io, json, logging, shutil, socket, sqlite3, ssl, subprocess, time, urllib.request, urllib.error
from typing import Optional
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from services.state import portfolio_snapshot, macro_snapshot, news_items, catalyst_calendar, WATCHLIST
from services.trade_engine import scanner_items, opportunity_for
from services.ws import manager
from services.settings_store import get_settings, save_settings, initialize_settings_store
from services.portfolio_providers import get_data_source_mode, set_data_source_mode, get_provider_status, resolve_portfolio_provider, _PROVIDER_MODES, get_snapshot_history, normalize_positions, get_live_quote_trace, SnapshotPortfolioProvider, IbkrLivePortfolioProvider, log_ibkr_startup_config
from services.connectors import InstrumentSearchError, source_health, test_source, yahoo_news, yahoo_fundamentals, yahoo_symbol_search, get_fx_rate
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
 "dashboard": 3,
 "stock": 10,
 "context": 10,
 "context_batch": 10,
 "provider_status": 2,
 "fundamentals": 12,
 "news": 12,
}

_DEBUG_QUOTE_SYMBOLS = ("AMD", "NVDA", "TSM", "SOFI")
_UI_REFRESH_LOGGER = logging.getLogger("uvicorn.error")
_UI_REFRESH_RELEVANT_PATHS = {
 '/portfolio',
 '/dashboard',
 '/setup/diagnostics',
 '/api/portfolio/provider/status',
 '/api/portfolio/live/positions',
 '/api/portfolio/live/summary',
 '/api/portfolio/live/trades',
}


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


def _utc_now_iso():
 return datetime.now(timezone.utc).isoformat()


def _stamp_ui_refresh_response(payload:dict, path:str):
 if not isinstance(payload, dict):
  return payload
 portfolio = payload.get('portfolio') if isinstance(payload.get('portfolio'), dict) else payload
 response_timestamp = _utc_now_iso()
 quote_timestamp = portfolio.get('pricesLastRefresh') or portfolio.get('quoteLastRefresh')
 portfolio_timestamp = portfolio.get('summaryLastRefresh') or portfolio.get('lastRefresh') or portfolio.get('as_of')
 payload['responseTimestamp'] = response_timestamp
 payload['quoteTimestamp'] = quote_timestamp
 payload['portfolioTimestamp'] = portfolio_timestamp
 if path in _UI_REFRESH_RELEVANT_PATHS:
  _UI_REFRESH_LOGGER.info(
   'UI refresh response path=%s response_timestamp=%s quote_timestamp=%s portfolio_timestamp=%s source=%s',
   path,
   response_timestamp,
   quote_timestamp,
   portfolio_timestamp,
   portfolio.get('source') or portfolio.get('active_source'),
  )
 return payload


def _dashboard_cache_debug():
 try:
  from services.provider_cache import DB_PATH
  with sqlite3.connect(DB_PATH, timeout=0.2) as conn:
   row=conn.execute(
    'SELECT payload, updated_at FROM provider_cache WHERE namespace=? AND cache_key=?',
    ('route', 'DASHBOARD'),
   ).fetchone()
  if not row:
   return {'available':False, 'ttlSeconds':_ROUTE_CACHE_TTL_SECONDS['dashboard']}
  updated_at=float(row[1])
  age=max(0.0,time.time()-updated_at)
  cached=json.loads(row[0])
  portfolio=cached.get('portfolio') if isinstance(cached,dict) and isinstance(cached.get('portfolio'),dict) else {}
  return {
   'available':True,
   'updatedAt':datetime.fromtimestamp(updated_at,timezone.utc).isoformat(),
   'ageSeconds':round(age,3),
   'ttlSeconds':_ROUTE_CACHE_TTL_SECONDS['dashboard'],
   'fresh':age <= _ROUTE_CACHE_TTL_SECONDS['dashboard'],
   'quoteTimestamp':portfolio.get('pricesLastRefresh'),
   'portfolioTimestamp':portfolio.get('summaryLastRefresh') or portfolio.get('lastRefresh') or portfolio.get('as_of'),
   'source':portfolio.get('source') or portfolio.get('active_source'),
  }
 except Exception as exc:
  return {'available':False, 'ttlSeconds':_ROUTE_CACHE_TTL_SECONDS['dashboard'], 'error':str(exc)}

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
  p['provider_class']=resolution.provider_class
  p['snapshot_available']=p.get('snapshot_available', resolution.snapshot_available)
  p['snapshot_timestamp']=p.get('snapshot_timestamp') or resolution.snapshot_timestamp
  p['nextRefresh']=p.get('nextRefresh')
  p['positions']=normalize_positions(p.get('positions',[]))
  if configured_mode == 'mock':
   p['source']='MOCK'
   p['active_source']='MOCK'
   p['portfolioMode']='MOCK'
   p['positionsSource']='MOCK'
   p['priceSource']='MOCK'
   p['activePriceProvider']='MOCK'
   p['activePositionProvider']='MOCK'
   p['isLivePositions']=False
   p['isLivePricing']=False
   p['isHybrid']=False
   p['fallback_active']=False
   p['fallback_reason']=None
   p['is_live']=False
   p['is_stale']=False
   p['stale_reason']=None
   p=merge_manual_holdings(p,macros,state_module)
   manual_positions=[pos for pos in p.get('positions',[]) if str(pos.get('positionSource') or pos.get('manual') or '').upper() == 'MANUAL_HOLDINGS' or bool(pos.get('manual'))]
   manual_quote_sources=[str(pos.get('priceSource') or pos.get('quoteSource') or '').upper() for pos in manual_positions if pos.get('priceSource') or pos.get('quoteSource')]
   manual_live_quotes=any(src in {'YAHOO_LIVE','YAHOO_DELAYED','FALLBACK_PROVIDER'} for src in manual_quote_sources) or any(bool(pos.get('isLiveQuote')) for pos in manual_positions)
   manual_prices_last_refresh=max([str(pos.get('quoteLastRefresh')) for pos in manual_positions if pos.get('quoteLastRefresh')], default=None)
   if manual_positions and manual_live_quotes:
    p['positionsSource']='MANUAL_HOLDINGS'
    p['activePositionProvider']='MANUAL_HOLDINGS'
    p['isLivePositions']=False
    p['portfolioMode']='MANUAL_HOLDINGS_LIVE_QUOTES'
    p['source']='MANUAL_HOLDINGS_LIVE_QUOTES'
    p['active_source']='MANUAL_HOLDINGS_LIVE_QUOTES'
    p['priceSource']='YAHOO_LIVE' if 'YAHOO_LIVE' in manual_quote_sources else ('YAHOO_DELAYED' if 'YAHOO_DELAYED' in manual_quote_sources else 'FALLBACK_PROVIDER')
    p['activePriceProvider']='YAHOO'
    p['pricesLive']=True
    p['pricesLastRefresh']=manual_prices_last_refresh
    p['lastPriceTimestamp']=manual_prices_last_refresh
    p['isLivePricing']=True
    p['isHybrid']=True
    p['fallback_active']=True
    p['fallback_reason']='Manual holdings priced from live fallback provider.'
    p['is_live']=False
    p['is_stale']=False
    p['stale_reason']=None
  else:
   helper = IbkrLivePortfolioProvider.__new__(IbkrLivePortfolioProvider)
   p = helper._normalize_portfolio_after_price_overlay(p, resolution=resolution)
  p['positions']=normalize_positions(p.get('positions',[]))
  p['pricesLive']=bool(p.get('pricesLive', False))
  p['pricesLastRefresh']=p.get('pricesLastRefresh')
  p['pricesAgeSeconds']=p.get('pricesAgeSeconds')
  p['positionsLastRefresh']=p.get('positionsLastRefresh') or p.get('positions_refreshed_at')
  p['summaryLastRefresh']=p.get('summaryLastRefresh') or p.get('summary_refreshed_at')
  p['lastRefresh']=p.get('lastRefresh') or p.get('refreshed_at') or p.get('summaryLastRefresh') or resolution.snapshot_timestamp
  p['isLiveUpdating']=p.get('isLiveUpdating', bool(p.get('isLivePricing', False) or resolution.is_live))
  if not p.get('exposures'): p['exposures']=compute_exposures(p.get('positions',[]),p.get('total_value',0))
  if 'guardrails' not in p: p['guardrails']=risk_doctor(p.get('positions',[]),macros)
  if 'today_actions' not in p: p['today_actions']=today_actions(p.get('positions',[]),macros)
  if 'stress_tests' not in p: p['stress_tests']=stress_tests(p.get('total_value',0))
  p['baseCurrency']=p.get('currency','USD')
  p['fxRate']=get_fx_rate('USD','EUR')
  if p.get('portfolioMode') == 'IBKR_LIVE' and not p.get('fallback_active'):
   p['is_live']=True
  return p
 except Exception as e:
  resolution=resolve_portfolio_provider()
  demo={
   'source': resolution.active_source or 'DISCONNECTED',
   'mode': resolution.configured_mode,
   'configured_mode': resolution.configured_mode,
   'active_source': resolution.active_source or 'DISCONNECTED',
   'portfolioMode': 'LAST_UPDATE_ONLY' if resolution.snapshot_available else 'DISCONNECTED',
   'positionsSource': 'IBKR_LAST_UPDATE' if resolution.snapshot_available else 'DISCONNECTED',
   'priceSource': 'STALE',
   'activePriceProvider': 'STALE',
   'activePositionProvider': 'IBKR_LAST_UPDATE' if resolution.snapshot_available else 'DISCONNECTED',
   'isLivePositions': False,
   'isLivePricing': False,
   'isHybrid': False,
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
   'lastPriceTimestamp': None,
   'pricesAgeSeconds': None,
   'positionsLastRefresh': None,
   'lastPositionsTimestamp': resolution.snapshot_timestamp,
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
  demo['baseCurrency']='USD'
  demo['fxRate']=get_fx_rate('USD','EUR')
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
 log_ibkr_startup_config()
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
  result=IbkrLivePortfolioProvider().get_connectivity_diagnostics(timeout=timeout)
  return bool((result.get('authStatusResult') or {}).get('authenticated'))
 except Exception:
  return False

@app.get('/setup/diagnostics')
def setup_diagnostics():
 gateway_running=port_reachable('127.0.0.1',5000,0.6)
 return _stamp_ui_refresh_response({
  'backend_ok':True,
  'java_installed':command_available('java',['-version'],1.0),
  'docker_installed':command_available('docker',['--version'],1.0),
  'docker_daemon_running':command_ok('docker',['info'],1.5),
  'gateway_running':gateway_running,
  'ibkr_gateway_reachable':gateway_running,
  'ibkr_authenticated':ibkr_authenticated(1.0) if gateway_running else False,
  'demo_mode_available':True,
  'frontend_ok':True,
 }, '/setup/diagnostics')

@app.get('/portfolio')
def portfolio(): return _stamp_ui_refresh_response(get_portfolio_payload(), '/portfolio')
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
 result=_route_cache('route', 'dashboard', _ROUTE_CACHE_TTL_SECONDS['dashboard'], loader, fallback, wait_timeout_seconds=0.8)
 return _stamp_ui_refresh_response(result, '/dashboard')
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
 live_refresh=False
 try:
  provider_status=get_provider_status()
  live_refresh=bool(provider_status.get('isLivePricing') or provider_status.get('is_live'))
 except Exception:
  live_refresh=False
 def loader():
  start=time.perf_counter()
  data=build_ai_intelligence(symbol, refresh=refresh)
  return {**data, 'status': data.get('status') or 'ok', 'performanceMs': round((time.perf_counter()-start)*1000, 1)}
 fallback={'symbol': symbol.upper().split()[0], 'status': 'partial', 'sourceStatus': {'aiIntelligence': _route_source_status('aiIntelligence', 'timeout', 0, fallback_used=True, detail='AI intelligence timed out.')}}
 return _route_cache('route', f'ai:{symbol.upper().split()[0]}', 10, loader, fallback, wait_timeout_seconds=0.8, refresh=refresh or live_refresh)
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
 try:
  from services.price_providers import get_yahoo_live_quote

  live_quote = get_yahoo_live_quote(t, wait_timeout_seconds=0.55)
 except Exception:
  live_quote = {}
 if isinstance(live_quote, dict) and live_quote.get('last') is not None:
  fundamentals = {
   **fundamentals,
   'price': live_quote.get('last'),
   'regularMarketPrice': live_quote.get('last'),
   'last': live_quote.get('last'),
   'prev_close': live_quote.get('previousClose'),
   'regularMarketPreviousClose': live_quote.get('previousClose'),
   'day_change': live_quote.get('dayChange'),
   'day_change_pct': live_quote.get('dayChangePercent'),
   'quoteSource': live_quote.get('priceSource'),
   'quoteLastRefresh': live_quote.get('quoteTimestamp'),
   'quoteAgeSeconds': live_quote.get('quoteAgeSeconds'),
   'isLiveQuote': live_quote.get('isLiveQuote'),
  }
  if not pos or pos.get('quoteStale') or pos.get('priceSource') == 'STALE':
   pos = {
    **(pos or {}),
    'last': live_quote.get('last'),
    'previousClose': live_quote.get('previousClose'),
    'prevClose': live_quote.get('previousClose'),
    'day_change': live_quote.get('dayChange'),
    'day_change_pct': live_quote.get('dayChangePercent'),
    'quoteSource': live_quote.get('priceSource'),
    'priceSource': live_quote.get('priceSource'),
    'quoteLastRefresh': live_quote.get('quoteTimestamp'),
    'quoteAgeSeconds': live_quote.get('quoteAgeSeconds'),
    'isLiveQuote': live_quote.get('isLiveQuote'),
    'quoteStale': False,
    'quoteStaleReason': None,
   }
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
 live_refresh=False
 try:
  provider_status=get_provider_status()
  live_refresh=bool(provider_status.get('isLivePricing') or provider_status.get('is_live'))
 except Exception:
  live_refresh=False
 def loader():
  return _build_context_payload(t, refresh=refresh, debug=debug) if contract.lower()=='frontend' else build_ai_intelligence_context(t, settings=get_settings(), portfolio=get_portfolio_payload(), macro=macro_snapshot(), calendar=catalyst_calendar(), watchlist=WATCHLIST, provider_status=_intelligence_provider_status(), refresh=refresh, debug=debug)
 fallback=_build_context_partial(t, 'AI context payload timed out.')
 return _route_cache('route', f'ctx:{contract}:{t}', _ROUTE_CACHE_TTL_SECONDS['context'], loader, fallback, wait_timeout_seconds=1.1, refresh=refresh or live_refresh)
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
 live_refresh=False
 try:
  provider_status=get_provider_status()
  live_refresh=bool(provider_status.get('isLivePricing') or provider_status.get('is_live') or provider_status.get('portfolioMode')=='IBKR_LIVE')
 except Exception:
  live_refresh=False
 def loader():
  return _build_stock_payload(t)
 fallback=_build_stock_partial(t, 'Stock panel timed out or upstream provider was slow.')
 return _route_cache('route', f'stock:{t}', _ROUTE_CACHE_TTL_SECONDS['stock'], loader, fallback, wait_timeout_seconds=0.9, refresh=live_refresh)
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
  _UI_REFRESH_LOGGER.info(
   'Provider status resolved configured_mode=%s active_source=%s gateway_status=%s fallback_active=%s provider_class=%s',
   status.get('configured_mode'),
   status.get('active_source'),
   status.get('gateway_status'),
   status.get('fallback_active'),
   status.get('provider_class'),
  )
  return status
 fallback={
  'status': 'partial',
  'message': 'Provider status warming up.',
  'configured_mode': get_data_source_mode(),
  'active_source': 'DISCONNECTED',
  'fallback_active': True,
  'fallback_reason': 'Provider status request timed out.',
  'provider_class': 'Unknown',
  'portfolioMode': 'LAST_UPDATE_ONLY',
  'positionsSource': 'DISCONNECTED',
  'priceSource': 'STALE',
  'activePriceProvider': 'STALE',
  'activePositionProvider': 'DISCONNECTED',
  'isLivePositions': False,
  'isLivePricing': False,
  'isHybrid': False,
  'lastPositionsTimestamp': None,
  'lastPriceTimestamp': None,
  'pricesLastRefresh': None,
  'positionsLastRefresh': None,
  'summaryLastRefresh': None,
  'sourceStatus': {'provider': _route_source_status('provider', 'timeout', 0, fallback_used=True, detail='Provider status request timed out.')},
 }
 result=_route_cache('route', 'provider-status', _ROUTE_CACHE_TTL_SECONDS['provider_status'], loader, fallback, wait_timeout_seconds=0.8)
 return _stamp_ui_refresh_response(result, '/api/portfolio/provider/status')

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
  portfolio = get_portfolio_payload()
  return _stamp_ui_refresh_response({
   'source': portfolio.get('source'),
   'active_source': portfolio.get('active_source'),
   'portfolioMode': portfolio.get('portfolioMode'),
   'positionsSource': portfolio.get('positionsSource'),
   'priceSource': portfolio.get('priceSource'),
   'activePriceProvider': portfolio.get('activePriceProvider'),
   'activePositionProvider': portfolio.get('activePositionProvider'),
   'mode': portfolio.get('mode'),
   'configured_mode': portfolio.get('configured_mode'),
   'as_of': portfolio.get('as_of') or portfolio.get('snapshot_timestamp'),
   'lastRefresh': portfolio.get('lastRefresh') or portfolio.get('summaryLastRefresh') or portfolio.get('as_of') or portfolio.get('snapshot_timestamp'),
   'nextRefresh': portfolio.get('nextRefresh'),
   'isLiveUpdating': portfolio.get('isLiveUpdating'),
   'pricesLive': bool(portfolio.get('isLivePricing') or portfolio.get('pricesLive', False)),
   'pricesLastRefresh': portfolio.get('pricesLastRefresh'),
   'pricesAgeSeconds': portfolio.get('pricesAgeSeconds'),
   'positionsLastRefresh': portfolio.get('positionsLastRefresh') or portfolio.get('lastPositionsTimestamp'),
   'summaryLastRefresh': portfolio.get('summaryLastRefresh'),
   'fallback_active': portfolio.get('fallback_active'),
   'fallback_reason': portfolio.get('fallback_reason'),
   'provider_class': portfolio.get('provider_class'),
   'snapshot_available': portfolio.get('snapshot_available'),
   'snapshot_timestamp': portfolio.get('snapshot_timestamp'),
   'is_live': portfolio.get('is_live'),
   'is_stale': portfolio.get('is_stale'),
   'stale_reason': portfolio.get('stale_reason'),
   'positions': portfolio.get('positions') if isinstance(portfolio.get('positions'), list) else []
  }, '/api/portfolio/live/positions')
 except Exception as e:
  raise HTTPException(status_code=503, detail=str(e))

@app.get('/api/portfolio/live/summary')
def portfolio_live_summary():
 try:
  portfolio = get_portfolio_payload()
  summary = dict(portfolio.get('summary') or {})
  summary['configured_mode']=portfolio.get('configured_mode')
  summary['mode']=summary.get('mode') or portfolio.get('portfolioMode') or portfolio.get('mode')
  summary['source']=portfolio.get('source')
  summary['active_source']=portfolio.get('active_source')
  summary['portfolioMode']=portfolio.get('portfolioMode')
  summary['positionsSource']=portfolio.get('positionsSource')
  summary['priceSource']=portfolio.get('priceSource')
  summary['activePriceProvider']=portfolio.get('activePriceProvider')
  summary['activePositionProvider']=portfolio.get('activePositionProvider')
  summary['as_of']=summary.get('as_of') or portfolio.get('as_of') or portfolio.get('snapshot_timestamp')
  summary['lastRefresh']=summary.get('lastRefresh') or portfolio.get('lastRefresh') or summary.get('as_of') or portfolio.get('snapshot_timestamp')
  summary['nextRefresh']=summary.get('nextRefresh') or portfolio.get('nextRefresh')
  summary['isLiveUpdating']=summary.get('isLiveUpdating', portfolio.get('isLiveUpdating'))
  summary['pricesLive']=bool(summary.get('pricesLive', portfolio.get('pricesLive', portfolio.get('isLivePricing', False))))
  summary['pricesLastRefresh']=summary.get('pricesLastRefresh') or portfolio.get('pricesLastRefresh') or portfolio.get('lastPriceTimestamp')
  if summary.get('pricesAgeSeconds') is None:
   summary['pricesAgeSeconds']=portfolio.get('pricesAgeSeconds')
  summary['positionsLastRefresh']=summary.get('positionsLastRefresh') or portfolio.get('positionsLastRefresh') or portfolio.get('lastPositionsTimestamp')
  summary['summaryLastRefresh']=summary.get('summaryLastRefresh') or portfolio.get('summaryLastRefresh')
  summary['fallback_active']=portfolio.get('fallback_active')
  summary['fallback_reason']=portfolio.get('fallback_reason')
  summary['provider_class']=portfolio.get('provider_class')
  summary['snapshot_available']=portfolio.get('snapshot_available')
  summary['snapshot_timestamp']=portfolio.get('snapshot_timestamp') or portfolio.get('lastPositionsTimestamp')
  summary['is_live']=portfolio.get('is_live')
  summary['is_stale']=portfolio.get('is_stale')
  summary['stale_reason']=portfolio.get('stale_reason')
  return _stamp_ui_refresh_response(summary, '/api/portfolio/live/summary')
 except Exception as e:
  raise HTTPException(status_code=503, detail=str(e))

@app.get('/api/portfolio/live/trades')
def portfolio_live_trades():
 try:
  portfolio = get_portfolio_payload()
  resolution=resolve_portfolio_provider()
  provider=resolution.provider
  return _stamp_ui_refresh_response({
   'source': portfolio.get('source'),
   'active_source': portfolio.get('active_source'),
   'portfolioMode': portfolio.get('portfolioMode'),
   'positionsSource': portfolio.get('positionsSource'),
   'priceSource': portfolio.get('priceSource'),
   'activePriceProvider': portfolio.get('activePriceProvider'),
   'activePositionProvider': portfolio.get('activePositionProvider'),
   'mode': portfolio.get('mode'),
   'configured_mode': portfolio.get('configured_mode'),
   'as_of': portfolio.get('as_of') or portfolio.get('snapshot_timestamp'),
   'lastRefresh': portfolio.get('lastRefresh') or portfolio.get('summaryLastRefresh') or portfolio.get('as_of') or portfolio.get('snapshot_timestamp'),
   'nextRefresh': portfolio.get('nextRefresh'),
   'isLiveUpdating': portfolio.get('isLiveUpdating'),
   'pricesLive': bool(portfolio.get('isLivePricing') or portfolio.get('pricesLive', False)),
   'pricesLastRefresh': portfolio.get('pricesLastRefresh'),
   'pricesAgeSeconds': portfolio.get('pricesAgeSeconds'),
   'positionsLastRefresh': portfolio.get('positionsLastRefresh') or portfolio.get('lastPositionsTimestamp'),
   'summaryLastRefresh': portfolio.get('summaryLastRefresh'),
   'fallback_active': portfolio.get('fallback_active'),
   'fallback_reason': portfolio.get('fallback_reason'),
   'provider_class': portfolio.get('provider_class'),
   'snapshot_available': portfolio.get('snapshot_available'),
   'snapshot_timestamp': portfolio.get('snapshot_timestamp'),
  'is_live': portfolio.get('is_live'),
  'is_stale': portfolio.get('is_stale'),
   'stale_reason': portfolio.get('stale_reason'),
   'trades': provider.get_trades()
  }, '/api/portfolio/live/trades')
 except Exception as e:
  raise HTTPException(status_code=503, detail=str(e))


@app.get('/api/debug/live-status')
def debug_live_status():
 try:
  provider_status = portfolio_provider_status()
  quote_trace = get_live_quote_trace(limit=20)
  last_quote_received = quote_trace[0] if quote_trace else None
  active_source = str(provider_status.get('active_source') or '').upper()
  market_data_subscribed = bool(provider_status.get('isLivePricing') or provider_status.get('priceSource') in {'IBKR_LIVE', 'YAHOO_LIVE', 'YAHOO_DELAYED', 'FALLBACK_PROVIDER'})
  account_connected = bool(provider_status.get('accounts_available') or provider_status.get('positions_available') or provider_status.get('isLivePositions'))
  gateway_connected = bool(provider_status.get('ibkr_gateway_reachable') and provider_status.get('ibkr_authenticated'))
  positions_live = bool(provider_status.get('isLivePositions') or provider_status.get('activePositionProvider') == 'IBKR_LIVE')
  prices_live = bool(provider_status.get('isLivePricing') or provider_status.get('pricesLive'))
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
    'portfolioMode': provider_status.get('portfolioMode'),
    'positionsSource': provider_status.get('positionsSource'),
    'priceSource': provider_status.get('priceSource'),
    'activePriceProvider': provider_status.get('activePriceProvider'),
    'activePositionProvider': provider_status.get('activePositionProvider'),
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

@app.get('/api/price-providers/status')
def price_providers_status():
 try:
  portfolio = get_portfolio_payload()
  from services.price_providers import get_price_provider_status

  yahoo_status = get_price_provider_status(portfolio.get('positions', []) or [])
  ibkr = {
   'available': bool(portfolio.get('is_live')),
   'authenticated': bool(portfolio.get('portfolioMode') == 'IBKR_LIVE'),
   'pricesLive': bool(portfolio.get('priceSource') == 'IBKR_LIVE'),
   'positionsLive': bool(portfolio.get('positionsSource') == 'IBKR_LIVE'),
   'gatewayConnected': bool(portfolio.get('portfolioMode') == 'IBKR_LIVE'),
   'gatewayStatus': portfolio.get('portfolioMode') or 'DISCONNECTED',
   'fallbackActive': bool(portfolio.get('fallback_active')),
   'fallbackReason': portfolio.get('fallback_reason'),
  }
  price_source = portfolio.get('priceSource') or 'STALE'
  active_price_provider = portfolio.get('activePriceProvider') or ('IBKR' if price_source == 'IBKR_LIVE' else ('YAHOO' if price_source in {'YAHOO_LIVE', 'YAHOO_DELAYED', 'FALLBACK_PROVIDER'} else 'STALE'))
  active_position_provider = portfolio.get('activePositionProvider') or portfolio.get('positionsSource') or 'DISCONNECTED'
  portfolio_mode = portfolio.get('portfolioMode') or 'LAST_UPDATE_ONLY'
  return {
   'ibkr': ibkr,
   'yahoo': yahoo_status.get('yahoo') or {},
   'activePriceProvider': active_price_provider,
   'activePositionProvider': active_position_provider,
   'portfolioMode': portfolio_mode,
   'isLivePricing': bool(portfolio.get('isLivePricing')),
   'isLivePositions': bool(portfolio.get('isLivePositions')),
   'isHybrid': bool(portfolio.get('isHybrid')),
   'source': portfolio.get('source'),
   'active_source': portfolio.get('active_source'),
   'positionsSource': portfolio.get('positionsSource'),
   'priceSource': price_source,
   'lastPositionsTimestamp': portfolio.get('lastPositionsTimestamp'),
   'lastPriceTimestamp': portfolio.get('lastPriceTimestamp'),
   'snapshot_available': portfolio.get('snapshot_available'),
   'snapshot_timestamp': portfolio.get('snapshot_timestamp'),
   'fallbackActive': portfolio.get('fallback_active'),
   'fallbackReason': portfolio.get('fallback_reason'),
   'pricesLastRefresh': portfolio.get('pricesLastRefresh'),
   'positionsLastRefresh': portfolio.get('positionsLastRefresh'),
   'summaryLastRefresh': portfolio.get('summaryLastRefresh'),
   'portfolio': portfolio,
  }
 except Exception as e:
  raise HTTPException(status_code=503, detail=str(e))


@app.get('/api/debug/ibkr-connectivity')
def debug_ibkr_connectivity():
 provider = IbkrLivePortfolioProvider()
 return provider.get_connectivity_diagnostics()


@app.get('/api/debug/ui-refresh-status')
def debug_ui_refresh_status():
 provider_status = get_provider_status()
 dashboard_cache = _dashboard_cache_debug()
 provider_last_updated = provider_status.get('pricesLastRefresh') or provider_status.get('lastRefresh')
 portfolio_last_updated = provider_status.get('summaryLastRefresh') or provider_status.get('positionsLastRefresh') or provider_last_updated
 return {
  'responseTimestamp': _utc_now_iso(),
  'portfolioLastUpdated': portfolio_last_updated,
  'dashboardLastUpdated': dashboard_cache.get('updatedAt'),
  'providerLastUpdated': provider_last_updated,
  'expectedRefreshInterval': {
   'providerSeconds': 12,
   'websocketPushSeconds': 1.5,
   'dashboardCacheSeconds': _ROUTE_CACHE_TTL_SECONDS['dashboard'],
   'providerStatusCacheSeconds': _ROUTE_CACHE_TTL_SECONDS['provider_status'],
   'frontendPollingSeconds': 10,
   'setupAuthenticationPollingSeconds': 2,
  },
  'cacheTtl': _cache_layers_debug(),
  'dashboardCache': dashboard_cache,
  'source': provider_status.get('active_source'),
  'isLive': bool(provider_status.get('is_live')),
  'pricesLive': bool(provider_status.get('pricesLive')),
  'deliveryContract': {
   'backendPush': 'websocket',
   'backendWebsocketPath': '/ws',
   'pollingFallback': True,
   'setupAuthenticationPolling': True,
  },
 }


@app.get('/api/debug/live-quotes')
def debug_live_quotes():
 try:
  portfolio = get_portfolio_payload()
  provider_status = portfolio_provider_status()
  active_source = str(provider_status.get('active_source') or portfolio.get('active_source') or '').upper()
  positions = _select_debug_positions({'positions': portfolio.get('positions', [])}, list(_DEBUG_QUOTE_SYMBOLS))
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
    timestamp = pos.get('quoteLastRefresh') or pos.get('lastRefresh') or portfolio.get('lastRefresh')
    age_seconds = pos.get('quoteAgeSeconds')
    source = pos.get('priceSource') or pos.get('quoteSource') or _quote_source_label(type('Resolution', (), {'active_source': active_source, 'snapshot_available': bool(provider_status.get('snapshot_available'))}), portfolio, pos)
   output.append({
    'symbol': symbol,
    'conid': pos.get('conid') if pos else None,
    'price': pos.get('last') if pos else None,
    'dayPnl': pos.get('day_pnl') if pos else None,
    'dayPnlPct': pos.get('day_pnl_pct') if pos else None,
    'unrealized': pos.get('unrealized') if pos else None,
    'unrealizedPct': pos.get('unrealized_pct') if pos else None,
    'timestamp': timestamp,
    'ageSeconds': age_seconds,
    'source': source,
    'quoteTimestamp': timestamp,
    'serverTimestamp': trace.get('serverTimestamp') if trace else portfolio.get('lastRefresh') or portfolio.get('snapshot_timestamp'),
    'calculationProvenance': pos.get('calculationProvenance') if pos else None,
   })
  quote_timestamps = [row.get('quoteTimestamp') for row in output if row.get('quoteTimestamp')]
  latest_quote_timestamp = None
  if quote_timestamps:
   try:
    latest_quote_timestamp = max(datetime.fromisoformat(str(value).replace('Z', '+00:00')) for value in quote_timestamps).isoformat()
   except Exception:
    latest_quote_timestamp = max(str(value) for value in quote_timestamps)
  return {
   'source': active_source,
   'gatewayConnected': bool(provider_status.get('ibkr_gateway_reachable') and provider_status.get('ibkr_authenticated')),
   'accountConnected': bool(provider_status.get('accounts_available') or provider_status.get('positions_available') or portfolio.get('isLivePositions')),
   'marketDataSubscribed': bool(provider_status.get('isLivePricing') or portfolio.get('priceSource') in {'IBKR_LIVE', 'YAHOO_LIVE', 'YAHOO_DELAYED', 'FALLBACK_PROVIDER'}),
   'pricesLive': bool(provider_status.get('isLivePricing') or portfolio.get('pricesLive') or portfolio.get('isLivePricing')),
   'positionsLive': bool(provider_status.get('isLivePositions') or portfolio.get('isLivePositions')),
   'quotesReceived': sum(1 for row in output if row.get('quoteTimestamp')),
   'lastQuoteTimestamp': latest_quote_timestamp,
   'symbols': [row.get('symbol') for row in output if row.get('symbol')],
   'lastQuoteReceived': output[0] if output else None,
   'quoteAgeSeconds': provider_status.get('pricesAgeSeconds') or portfolio.get('pricesAgeSeconds'),
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
