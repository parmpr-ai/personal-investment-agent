"""
Standalone AI Agent server — runs independently of the main PIA backend.
Port: 8001 (default)  |  Main PIA: 8000

This server owns all /agent/* endpoints. It has no dependency on the PIA
portfolio/news/scanner services, so it keeps running and trading even when
the main PIA backend restarts.
"""
import os, asyncio
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from services.autonomous_agent import agent as autonomous_agent, get_recent_decisions, get_agent_log
from services.paper_trading import get_portfolio_summary as paper_summary, get_trade_history, reset_book
from services.ibkr_trader import test_ibkr_paper, get_ibkr_paper_account, cancel_ibkr_orders, get_ibkr_paper_status
from services.strategy_tracker import get_strategy_stats, get_pnl_series, get_hourly_stats, get_today_summary
from services.regime_detector import detect_regime
from services.institutional_signals import get_institutional_signal, get_institutional_signals_batch
from services.backtester import run_backtest, get_latest_results, get_backtest_status, run_walkforward_backtest, run_portfolio_backtest
from services.ml_scorer import train_all_models, models_status, walk_forward_validate, wf_results
from services.settings_store import get_settings

load_dotenv()

class AgentConfigRequest(BaseModel):
 enabled: bool|None=None
 mode: str|None=None
 cycle_minutes: int|None=None
 universe: list[str]|None=None

@asynccontextmanager
async def lifespan(app: FastAPI):
 yield

app = FastAPI(title='PIA Agent Server v1.0', lifespan=lifespan)
app.add_middleware(
 CORSMiddleware,
 allow_origins=['*'],
 allow_credentials=True,
 allow_methods=['*'],
 allow_headers=['*'],
)

# ── Health ────────────────────────────────────────────────────────────────────
@app.get('/health')
def health():
 return {'ok': True, 'app': 'PIA Agent Server', 'version': 'v1.0', 'agent_running': autonomous_agent.status().get('running', False)}

# ── Agent control ─────────────────────────────────────────────────────────────
@app.get('/agent/status')
def agent_status(): return autonomous_agent.status()

@app.post('/agent/start')
def agent_start(): return autonomous_agent.start()

@app.post('/agent/stop')
def agent_stop(): return autonomous_agent.stop()

@app.post('/agent/config')
def agent_config(req: AgentConfigRequest):
 updates = {k: v for k, v in req.model_dump().items() if v is not None}
 return autonomous_agent.configure(updates)

@app.post('/agent/cycle')
async def agent_cycle_once():
 await autonomous_agent._run_cycle()
 return autonomous_agent.status()

@app.get('/agent/decisions')
def agent_decisions(limit: int = 50): return get_recent_decisions(limit)

@app.get('/agent/log')
def agent_log_endpoint(limit: int = 100): return get_agent_log(limit)

# ── Paper portfolio ───────────────────────────────────────────────────────────
@app.get('/agent/paper/portfolio')
async def paper_portfolio():
 from services.market_data import fetch_quotes
 positions = paper_summary()
 tickers = [p['ticker'] for p in positions.get('positions', [])]
 if tickers:
  quotes = await fetch_quotes(tickers)
  prices = {t: q.get('price', 0) for t, q in quotes.items()}
  positions = paper_summary(prices)
 return positions

@app.get('/agent/paper/trades')
def paper_trades(limit: int = 100): return get_trade_history(limit)

@app.post('/agent/paper/reset')
def paper_reset(): return reset_book()

# ── IBKR paper ────────────────────────────────────────────────────────────────
@app.get('/agent/ibkr-paper/status')
def ibkr_paper_status(): return get_ibkr_paper_status(get_settings())

@app.get('/agent/ibkr-paper/test')
def ibkr_paper_test(): return test_ibkr_paper(get_settings())

@app.get('/agent/ibkr-paper/account')
def ibkr_paper_account(): return get_ibkr_paper_account(get_settings())

@app.post('/agent/ibkr-paper/cancel_all')
def ibkr_paper_cancel_all(): return cancel_ibkr_orders(get_settings())

# ── Analytics ─────────────────────────────────────────────────────────────────
@app.get('/agent/analytics/pnl')
def analytics_pnl(hours: int = 24): return get_pnl_series(hours)

@app.get('/agent/analytics/strategies')
def analytics_strategies(): return get_strategy_stats()

@app.get('/agent/analytics/hourly')
def analytics_hourly(hours: int = 24): return get_hourly_stats(hours)

@app.get('/agent/analytics/summary')
def analytics_summary(): return get_today_summary()

# ── Regime ────────────────────────────────────────────────────────────────────
@app.get('/agent/regime')
async def agent_regime(): return await detect_regime()

# ── Institutional signals ─────────────────────────────────────────────────────
@app.get('/agent/institutional')
async def agent_institutional_all():
 from services.autonomous_agent import UNIVERSE
 return await get_institutional_signals_batch(UNIVERSE)

@app.get('/agent/institutional/{ticker}')
async def agent_institutional(ticker: str): return await get_institutional_signal(ticker.upper())

# ── Backtest ──────────────────────────────────────────────────────────────────
@app.post('/agent/backtest')
async def agent_backtest_run(background_tasks: BackgroundTasks):
 async def _run(): await run_backtest()
 background_tasks.add_task(_run)
 return {'ok': True, 'message': 'Backtest started. Poll /agent/backtest/status.'}

@app.get('/agent/backtest/status')
def agent_backtest_status(): return get_backtest_status()

@app.get('/agent/backtest/results')
def agent_backtest_results(): return get_latest_results()

@app.post('/agent/backtest/walkforward')
async def agent_backtest_wf(background_tasks: BackgroundTasks):
 background_tasks.add_task(run_walkforward_backtest)
 return {'ok': True, 'message': 'Walk-forward backtest started.'}

@app.post('/agent/backtest/portfolio')
async def agent_backtest_portfolio(): return await run_portfolio_backtest()

# ── ML ────────────────────────────────────────────────────────────────────────
@app.post('/agent/ml/train')
async def agent_ml_train(): return await train_all_models()

@app.get('/agent/ml/status')
def agent_ml_status(): return models_status()

@app.post('/agent/ml/walkforward')
async def agent_ml_walkforward(background_tasks: BackgroundTasks):
 background_tasks.add_task(walk_forward_validate)
 return {'ok': True, 'message': 'Walk-forward validation started.'}

@app.get('/agent/ml/walkforward')
def agent_ml_walkforward_results(): return wf_results()

# ── Kelly / Pairs / Risk ──────────────────────────────────────────────────────
@app.get('/agent/kelly')
async def kelly_report():
 from services.strategy_tracker import kelly_diagnostics
 strategies = ['momentum', 'mean_reversion', 'breakout', 'trend_follow', 'short_momentum', 'short_breakdown']
 return {'ok': True, 'strategies': [kelly_diagnostics(s) for s in strategies]}

@app.get('/agent/pairs/scan')
async def pairs_scan():
 from services.pairs_trading import scan_pairs, get_open_pairs
 from services.market_data import fetch_quotes
 universe = autonomous_agent.config.get('universe', [])
 try:
  qs = await fetch_quotes(universe)
  prices = {t: q.get('price', 0) for t, q in qs.items()}
 except Exception:
  prices = {}
 signals = await scan_pairs(prices)
 return {'ok': True, 'signals': signals, 'open_pairs': get_open_pairs()}

@app.get('/agent/risk/report')
async def agent_risk_report():
 from services.paper_trading import get_open_longs, get_open_shorts, get_portfolio_summary as _ps
 from services.market_data import fetch_quotes, fetch_macro
 from services.risk_manager import RiskManager, _returns_cache
 risk = RiskManager()
 try:
  macro = await fetch_macro()
 except Exception:
  macro = {}
 longs = get_open_longs()
 shorts = get_open_shorts()
 all_pos = longs + shorts
 tickers = list({p['ticker'] for p in all_pos})
 try:
  quotes = await fetch_quotes(tickers) if tickers else {}
 except Exception:
  quotes = {}
 prices = {t: q.get('price', 0) for t, q in quotes.items()}
 portfolio = _ps(prices)
 health = risk.portfolio_health(portfolio, macro)
 cvar = risk.portfolio_cvar(all_pos, _returns_cache, portfolio.get('total_value', 1))
 peak = getattr(autonomous_agent, '_peak_value', portfolio.get('total_value', 1))
 pv = portfolio.get('total_value', 0)
 drawdown_pct = round((peak - pv) / peak * 100, 2) if peak > 0 else 0.0
 return {
  'portfolio_value': pv, 'peak_value': peak, 'drawdown_pct': drawdown_pct,
  'cash_pct': health.get('cash_pct', 0), 'open_longs': len(longs), 'open_shorts': len(shorts),
  'vix': macro.get('vix'), 'regime': (getattr(autonomous_agent, '_regime_cache', None) or {}).get('regime', 'UNKNOWN'),
  'cvar_pct': cvar.get('cvar_pct', 0), 'var_pct': cvar.get('var_pct', 0),
  'worst_day_pct': cvar.get('worst_day_pct', 0), 'days_analyzed': cvar.get('days_analyzed', 0),
  'alerts': health.get('alerts', []), 'total_return_pct': portfolio.get('total_return_pct', 0),
 }
