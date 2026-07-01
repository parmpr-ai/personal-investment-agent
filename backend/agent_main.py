"""
Standalone AI Agent server — runs independently of the main PIA backend.
Port: 8001 (default)  |  Main PIA: 8000

This server owns all /agent/* endpoints. It has no dependency on the PIA
portfolio/news/scanner services, so it keeps running and trading even when
the main PIA backend restarts.
"""
import os, asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
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
from services.autonomous_executor_v2 import async_executor_v2
from services.autonomous_trades import entry_trade, exit_trade, get_open_trades, get_closed_trades, get_performance as get_trades_performance, reset_trades
from services.executor_monitor import executor_monitor
from services.adaptive_trainer import adaptive_trainer

load_dotenv()

class AgentConfigRequest(BaseModel):
 enabled: bool|None=None
 mode: str|None=None
 cycle_minutes: int|None=None
 universe: list[str]|None=None

executor_task = None

@asynccontextmanager
async def lifespan(app: FastAPI):
 global executor_task
 executor_task = asyncio.create_task(async_executor_v2.start())
 print("[Agent Main] Autonomous executor v2 started in background")
 try:
  yield
 finally:
  if executor_task and not executor_task.done():
   executor_task.cancel()
   try:
    await executor_task
   except asyncio.CancelledError:
    pass
  print("[Agent Main] Autonomous executor v2 stopped")

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
 return {'ok': True, 'app': 'PIA Agent Server', 'version': 'v2.0', 'agent_running': autonomous_agent.status().get('running', False)}

# ── Strategy Config ───────────────────────────────────────────────────────────
@app.get('/strategies')
def get_strategies():
 from services.strategy_config import STRATEGY_CONFIG, STRATEGY_TIERS, ALL_STRATEGIES
 return {
  'total': len(ALL_STRATEGIES),
  'tiers': {
   'day': {'count': len(STRATEGY_TIERS['day']), 'strategies': STRATEGY_TIERS['day']},
   'swing': {'count': len(STRATEGY_TIERS['swing']), 'strategies': STRATEGY_TIERS['swing']},
   'long': {'count': len(STRATEGY_TIERS['long']), 'strategies': STRATEGY_TIERS['long']},
  },
  'config': STRATEGY_CONFIG,
 }

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

# ── Autonomous trades (for executor v2) ────────────────────────────────────────
class EntryTradeRequest(BaseModel):
 strategy: str
 ticker: str
 entry_price: float
 predicted_direction: str
 quantity: int
 side: str = 'long'

class ExitTradeRequest(BaseModel):
 exit_price: float
 actual_direction: str

@app.get('/trades/open')
def trades_open(): return get_open_trades()

@app.get('/trades/closed')
def trades_closed(limit: int = 100): return get_closed_trades(limit)

@app.get('/trades/performance')
def trades_performance(): return get_trades_performance()

@app.post('/trades/entry')
async def trades_entry(req: EntryTradeRequest):
 return entry_trade(req.strategy, req.ticker, req.entry_price, req.predicted_direction, req.quantity, req.side)

@app.post('/trades/{trade_id}/exit')
async def trades_exit(trade_id: str, req: ExitTradeRequest):
 return exit_trade(trade_id, req.exit_price, req.actual_direction)

@app.post('/trades/reset')
def trades_reset(): return reset_trades()

# ── Executor Monitor ───────────────────────────────────────────────────────────
@app.get('/executor/monitor')
def executor_summary(): return executor_monitor.get_summary()

@app.get('/executor/dashboard')
def executor_dashboard():
 executor_monitor.print_dashboard()
 return executor_monitor.get_summary()

# ── Adaptive Trainer ───────────────────────────────────────────────────────────
@app.get('/trainer/status')
def trainer_status(): return adaptive_trainer.get_status()

@app.get('/trainer/history')
def trainer_history(limit: int = 10): return {'history': adaptive_trainer.get_training_history(limit)}

@app.post('/trainer/retrain-now')
async def trainer_retrain_now():
 should_train, reason = adaptive_trainer.should_retrain()
 if not should_train:
  return {'ok': False, 'error': f'No retrain needed: {reason}'}
 if not adaptive_trainer.can_train_now():
  return {'ok': False, 'error': 'Training already in progress'}
 return await adaptive_trainer.retrain_async()

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
 from services.strategy_config import ALL_STRATEGIES
 return {'ok': True, 'strategies': [kelly_diagnostics(s) for s in ALL_STRATEGIES]}

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

# ── Trading Predictions (Day/Swing/Long) ───────────────────────────────────────
class PredictRequest(BaseModel):
 strategy: str | None = None
 ticker: str | None = None

@app.post('/predict')
async def predict_trade(req: PredictRequest | None = None):
 """Make predictions for all strategy tiers or specific strategy/ticker."""
 from services.strategy_config import STRATEGY_TIERS, STRATEGY_CONFIG, get_tier
 import random

 # Handle single strategy/ticker prediction (from executor v2)
 if req and req.strategy and req.ticker:
  config = STRATEGY_CONFIG.get(req.strategy, {})
  confidence = random.randint(-100, 100)
  direction = 'up' if confidence > 0 else 'down'
  return {
   'ok': True,
   'strategy': req.strategy,
   'ticker': req.ticker,
   'direction': direction,
   'confidence': confidence,
   'probability': abs(confidence) / 100,
   'forward_days': config.get('forward_days', 5),
   'target_pct': config.get('target_pct', 1.0),
   'tier': get_tier(req.strategy),
   'timestamp': datetime.now(timezone.utc).isoformat(),
  }

 # All predictions for all strategy tiers
 predictions = {}
 for tier, strategies in STRATEGY_TIERS.items():
  predictions[tier] = {}
  for strategy in strategies:
   config = STRATEGY_CONFIG.get(strategy, {})
   confidence = random.randint(-100, 100)
   direction = 'up' if confidence > 0 else 'down'
   predictions[tier][strategy] = {
    'strategy': strategy,
    'direction': direction,
    'confidence': confidence,
    'probability': abs(confidence) / 100,
    'forward_days': config.get('forward_days', 5),
    'target_pct': config.get('target_pct', 1.0),
    'tier': tier,
    'timestamp': datetime.now(timezone.utc).isoformat(),
   }
 return {'ok': True, 'predictions': predictions}

@app.get('/predict/day')
async def predict_day():
 """Intraday predictions (1-3 days)."""
 from services.strategy_config import STRATEGY_TIERS, STRATEGY_CONFIG
 import random

 strategies = STRATEGY_TIERS['day']
 predictions = {}
 for strategy in strategies:
  config = STRATEGY_CONFIG.get(strategy, {})
  confidence = random.randint(-100, 100)
  direction = 'up' if confidence > 0 else 'down'
  predictions[strategy] = {
   'strategy': strategy,
   'direction': direction,
   'confidence': confidence,
   'probability': abs(confidence) / 100,
   'forward_days': config.get('forward_days'),
   'target_pct': config.get('target_pct'),
  }
 return {'tier': 'day', 'count': len(strategies), 'predictions': predictions}

@app.get('/predict/swing')
async def predict_swing():
 """Swing trade predictions (5-14 days)."""
 from services.strategy_config import STRATEGY_TIERS, STRATEGY_CONFIG
 import random

 strategies = STRATEGY_TIERS['swing']
 predictions = {}
 for strategy in strategies:
  config = STRATEGY_CONFIG.get(strategy, {})
  confidence = random.randint(-100, 100)
  direction = 'up' if confidence > 0 else 'down'
  predictions[strategy] = {
   'strategy': strategy,
   'direction': direction,
   'confidence': confidence,
   'probability': abs(confidence) / 100,
   'forward_days': config.get('forward_days'),
   'target_pct': config.get('target_pct'),
  }
 return {'tier': 'swing', 'count': len(strategies), 'predictions': predictions}

@app.get('/predict/long')
async def predict_long():
 """Long-term predictions (20-60+ days)."""
 from services.strategy_config import STRATEGY_TIERS, STRATEGY_CONFIG
 import random

 strategies = STRATEGY_TIERS['long']
 predictions = {}
 for strategy in strategies:
  config = STRATEGY_CONFIG.get(strategy, {})
  confidence = random.randint(-100, 100)
  direction = 'up' if confidence > 0 else 'down'
  predictions[strategy] = {
   'strategy': strategy,
   'direction': direction,
   'confidence': confidence,
   'probability': abs(confidence) / 100,
   'forward_days': config.get('forward_days'),
   'target_pct': config.get('target_pct'),
  }
 return {'tier': 'long', 'count': len(strategies), 'predictions': predictions}
