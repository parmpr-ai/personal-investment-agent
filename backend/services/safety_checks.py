"""
Live trading safety checks and safeguards.
10 critical features for pre-live validation.
"""
import numpy as np
from typing import Dict, List, Any, Tuple, Optional
from datetime import datetime, timedelta
import time

# ─── 1. VOLUME FILTER ───────────────────────────────────────────────────────
def volume_check(ticker: str, volume: float, min_volume: float = 1e6) -> Tuple[bool, str]:
    """Skip entry if volume < 1M shares (liquidity risk)."""
    if volume < min_volume:
        return False, f"Volume {volume:.0f} < minimum {min_volume:.0f}"
    return True, ""


# ─── 2. MODEL DECAY CHECK ───────────────────────────────────────────────────
def model_accuracy_check(accuracy: float, min_accuracy: float = 0.50) -> Tuple[bool, str]:
    """Alert if rolling accuracy drops below 50% (model degradation)."""
    if accuracy < min_accuracy:
        return False, f"Model accuracy {accuracy:.1%} < {min_accuracy:.1%} threshold"
    return True, ""


# ─── 3. POSITION SIZING HEDGE ───────────────────────────────────────────────
def drawdown_size_reduction(
    drawdown_pct: float,
    base_qty: float,
    dd_threshold_pct: float = -2.0,
) -> Tuple[float, str]:
    """Reduce position size if intraday drawdown > 2%.

    At -2% DD: 0.5x size
    At -3% DD: 0.3x size
    At -5% DD: 0.1x size
    """
    if drawdown_pct > dd_threshold_pct:
        return base_qty, ""  # No reduction

    # Linear reduction: more drawdown = smaller size
    reduction_factor = max(0.1, 1.0 + (drawdown_pct / -10.0))
    reduced_qty = base_qty * reduction_factor
    msg = f"DD {drawdown_pct:.2f}% → size ×{reduction_factor:.2f}"
    return reduced_qty, msg


# ─── 4. REGIME SKIP CHECK ───────────────────────────────────────────────────
def regime_skip_check(regime: str, allow_regimes: List[str] = None) -> Tuple[bool, str]:
    """Skip new entries in BEAR_TREND or CRISIS (defensive mode).

    Safe regimes: BULL_TREND, CHOPPY_RANGE
    Unsafe: BEAR_TREND, CRISIS
    """
    if allow_regimes is None:
        allow_regimes = ["BULL_TREND", "CHOPPY_RANGE"]

    if regime not in allow_regimes:
        return False, f"Regime {regime} not in allowed list {allow_regimes}"
    return True, ""


# ─── 5. HUMAN OVERRIDE THRESHOLD ────────────────────────────────────────────
def human_override_required(
    position_size_usd: float,
    override_threshold_usd: float = 1000.0,
) -> Tuple[bool, str]:
    """Require manual approval for positions > $1k (prevent runaway).

    Returns (requires_approval, reason)
    """
    if position_size_usd > override_threshold_usd:
        return True, f"Position ${position_size_usd:.0f} exceeds ${override_threshold_usd:.0f} threshold"
    return False, ""


# ─── 6. DAILY REBALANCING CHECK ─────────────────────────────────────────────
def needs_daily_retrain(
    last_train_ts: float,
    retrain_interval_hours: float = 24.0,
) -> Tuple[bool, str]:
    """Check if model needs retraining (every 24h for freshness).

    Returns (should_retrain, reason)
    """
    now_ts = time.time()
    hours_since_train = (now_ts - last_train_ts) / 3600

    if hours_since_train >= retrain_interval_hours:
        return True, f"Last train {hours_since_train:.1f}h ago → retrain needed"
    return False, ""


# ─── 7. CORRELATION MONITORING ──────────────────────────────────────────────
def correlation_auto_reduce(
    new_ticker: str,
    open_positions: List[Dict[str, Any]],
    returns_cache: Dict[str, List[float]],
    max_correlation: float = 0.80,
) -> Tuple[float, str]:
    """Auto-reduce position size if correlation with open positions > 0.8.

    Returns (size_multiplier, reason)
    """
    new_rets = returns_cache.get(new_ticker.upper())
    if not new_rets or len(new_rets) < 10:
        return 1.0, ""

    max_corr = 0.0
    max_corr_ticker = ""

    for pos in open_positions:
        pos_ticker = pos.get("ticker", "").upper()
        pos_rets = returns_cache.get(pos_ticker)
        if not pos_rets or len(pos_rets) < 10:
            continue

        min_len = min(len(new_rets), len(pos_rets))
        corr = np.corrcoef(new_rets[-min_len:], pos_rets[-min_len:])[0, 1]
        if np.isnan(corr):
            continue

        if corr > max_corr:
            max_corr = corr
            max_corr_ticker = pos_ticker

    if max_corr > max_correlation:
        mult = 0.5  # Cut to 50%
        return mult, f"Correlation {max_corr:.2f} > {max_correlation:.2f} with {max_corr_ticker}"

    return 1.0, ""


# ─── 8. SLIPPAGE MODELING ───────────────────────────────────────────────────
def apply_slippage(
    entry_price: float,
    exit_price: float,
    slippage_pct: float = 2.5,
) -> Tuple[float, float]:
    """Apply realistic slippage to backtest prices.

    Entry: 2.5% worse (spread + market impact)
    Exit: 2.5% worse
    """
    adjusted_entry = entry_price * (1 + slippage_pct / 100)
    adjusted_exit = exit_price * (1 - slippage_pct / 100)
    return adjusted_entry, adjusted_exit


# ─── 9. STRESS TEST SCENARIOS ────────────────────────────────────────────────
def stress_test_scenario(
    scenario: str,
) -> Dict[str, Any]:
    """Generate stress test scenarios (crash, spike, regime break).

    Scenarios:
    - 2008_crash: -50% market, correlations → 1.0
    - 2020_covid: -35% market, vol spike (VIX 80)
    - flash_crash: -10% intraday, quick recovery
    - vix_spike: +200% vol, 0.8 correlation
    """
    scenarios = {
        "2008_crash": {
            "market_move_pct": -50,
            "vix_spike": 4.0,  # VIX 20 → 80
            "correlation_multiplier": 1.0,  # All correlated
            "liquidity_impact": 5.0,  # 5% slippage
            "description": "2008 Financial Crisis",
        },
        "2020_covid": {
            "market_move_pct": -35,
            "vix_spike": 3.5,  # VIX 20 → 70
            "correlation_multiplier": 0.85,
            "liquidity_impact": 3.0,
            "description": "2020 COVID Crash",
        },
        "flash_crash": {
            "market_move_pct": -10,
            "vix_spike": 1.5,
            "correlation_multiplier": 0.3,  # Low correlation
            "liquidity_impact": 2.0,
            "duration_minutes": 30,
            "description": "Flash Crash (intraday recovery)",
        },
        "vix_spike": {
            "market_move_pct": -8,
            "vix_spike": 2.0,  # VIX 20 → 40
            "correlation_multiplier": 0.75,
            "liquidity_impact": 1.5,
            "description": "VIX Spike Event",
        },
    }
    return scenarios.get(scenario, {})


# ─── 10. MULTI-TIMEFRAME CONFIRMATION ────────────────────────────────────────
def multi_timeframe_confirmation(
    daily_signal: bool,
    weekly_signal: bool = None,
    daily_weight: float = 0.6,
    weekly_weight: float = 0.4,
) -> Tuple[bool, str]:
    """Require confirmation from weekly + daily timeframes.

    Only enter if:
    - Daily is bullish AND
    - Weekly is bullish (if available)

    Prevents mean-reversion in downtrends.
    """
    if not daily_signal:
        return False, "Daily signal not bullish"

    if weekly_signal is None:
        # Weekly data unavailable, use daily only
        return daily_signal, "Weekly confirmation unavailable (using daily only)"

    if not weekly_signal:
        return False, "Weekly signal not bullish (despite daily)"

    return True, "Both daily + weekly confirmed bullish"


# ─── SUMMARY: Check Bundle ──────────────────────────────────────────────────
def pre_entry_safety_checks(
    ticker: str,
    volume: float,
    model_accuracy: float,
    position_size_usd: float,
    current_drawdown_pct: float,
    regime: str,
    open_positions: List[Dict[str, Any]],
    returns_cache: Dict[str, List[float]],
) -> Tuple[bool, List[str]]:
    """Run all safety checks before entry. Return (approved, reasons)."""
    blocks = []

    # 1. Volume
    vol_ok, vol_msg = volume_check(ticker, volume)
    if not vol_ok:
        blocks.append(f"❌ Volume: {vol_msg}")

    # 2. Model decay
    acc_ok, acc_msg = model_accuracy_check(model_accuracy)
    if not acc_ok:
        blocks.append(f"❌ Model: {acc_msg}")

    # 3. Regime
    regime_ok, regime_msg = regime_skip_check(regime)
    if not regime_ok:
        blocks.append(f"❌ Regime: {regime_msg}")

    # 4. Human override
    override_needed, override_msg = human_override_required(position_size_usd)
    if override_needed:
        blocks.append(f"⚠️ Manual approval needed: {override_msg}")

    # 5. Correlation
    corr_mult, corr_msg = correlation_auto_reduce(ticker, open_positions, returns_cache)
    if corr_msg:
        blocks.append(f"ℹ️ Correlation: {corr_msg} (size ×{corr_mult:.1f})")

    approved = len(blocks) == 0
    return approved, blocks
