"""Unit tests for risk mode and trade style determination."""
import pytest
from services.autonomous_agent import (
    TRADE_STYLE_PARAMS,
    _STYLE_MATRIX,
    _degrade_mode,
    _upgrade_mode,
    _determine_risk_mode,
    _get_trade_style,
)


# ── TRADE_STYLE_PARAMS completeness ──────────────────────────────────────────

REQUIRED_KEYS = {
    "stop_loss_pct", "take_profit_pct", "cut_loss_pct",
    "short_stop_pct", "short_profit_pct", "max_hold_days",
    "min_confidence", "size_mult",
}

def test_all_styles_defined():
    for style in ("DAY_TRADE", "SWING_TRADE", "POSITION_TRADE"):
        assert style in TRADE_STYLE_PARAMS, f"Missing style: {style}"


def test_all_styles_have_required_keys():
    for style, params in TRADE_STYLE_PARAMS.items():
        for key in REQUIRED_KEYS:
            assert key in params, f"{style} missing key: {key}"


def test_stop_loss_ordering():
    """Tighter stop for day trade vs swing vs position."""
    assert TRADE_STYLE_PARAMS["DAY_TRADE"]["stop_loss_pct"] < TRADE_STYLE_PARAMS["SWING_TRADE"]["stop_loss_pct"]
    assert TRADE_STYLE_PARAMS["SWING_TRADE"]["stop_loss_pct"] < TRADE_STYLE_PARAMS["POSITION_TRADE"]["stop_loss_pct"]


def test_take_profit_ordering():
    """Higher target for longer holds."""
    assert TRADE_STYLE_PARAMS["DAY_TRADE"]["take_profit_pct"] < TRADE_STYLE_PARAMS["SWING_TRADE"]["take_profit_pct"]
    assert TRADE_STYLE_PARAMS["SWING_TRADE"]["take_profit_pct"] < TRADE_STYLE_PARAMS["POSITION_TRADE"]["take_profit_pct"]


def test_max_hold_days_ordering():
    assert TRADE_STYLE_PARAMS["DAY_TRADE"]["max_hold_days"] == 1
    assert TRADE_STYLE_PARAMS["SWING_TRADE"]["max_hold_days"] < TRADE_STYLE_PARAMS["POSITION_TRADE"]["max_hold_days"]


# ── _degrade_mode / _upgrade_mode ────────────────────────────────────────────

def test_degrade_mode_one_step():
    assert _degrade_mode("AGGRESSIVE") == "NORMAL"
    assert _degrade_mode("NORMAL") == "CONSERVATIVE"
    assert _degrade_mode("CONSERVATIVE") == "DEFENSIVE"


def test_degrade_mode_clamps_at_defensive():
    assert _degrade_mode("DEFENSIVE") == "DEFENSIVE"
    assert _degrade_mode("DEFENSIVE", 5) == "DEFENSIVE"


def test_degrade_mode_two_steps():
    assert _degrade_mode("AGGRESSIVE", 2) == "CONSERVATIVE"
    assert _degrade_mode("NORMAL", 2) == "DEFENSIVE"


def test_upgrade_mode():
    assert _upgrade_mode("DEFENSIVE") == "CONSERVATIVE"
    assert _upgrade_mode("CONSERVATIVE") == "NORMAL"
    assert _upgrade_mode("NORMAL") == "AGGRESSIVE"


def test_upgrade_mode_clamps_at_aggressive():
    assert _upgrade_mode("AGGRESSIVE") == "AGGRESSIVE"


# ── _determine_risk_mode ─────────────────────────────────────────────────────

def test_vix_defensive():
    assert _determine_risk_mode(vix=30, drawdown_pct=0, recent_win_rate=0.5) == "DEFENSIVE"
    assert _determine_risk_mode(vix=28, drawdown_pct=0, recent_win_rate=0.7) == "DEFENSIVE"


def test_vix_aggressive():
    assert _determine_risk_mode(vix=12, drawdown_pct=0, recent_win_rate=0.5) == "AGGRESSIVE"


def test_vix_normal():
    assert _determine_risk_mode(vix=17, drawdown_pct=0, recent_win_rate=0.5) == "NORMAL"


def test_vix_conservative():
    assert _determine_risk_mode(vix=24, drawdown_pct=0, recent_win_rate=0.5) == "CONSERVATIVE"


def test_high_drawdown_degrades_mode():
    # VIX=12 → AGGRESSIVE, but 6% drawdown → NORMAL
    assert _determine_risk_mode(vix=12, drawdown_pct=6, recent_win_rate=0.5) == "NORMAL"


def test_extreme_drawdown_degrades_two_levels():
    # VIX=12 → AGGRESSIVE, 12% drawdown → CONSERVATIVE
    assert _determine_risk_mode(vix=12, drawdown_pct=12, recent_win_rate=0.5) == "CONSERVATIVE"


def test_low_win_rate_degrades_mode():
    # VIX=17 → NORMAL, poor win rate → CONSERVATIVE
    assert _determine_risk_mode(vix=17, drawdown_pct=0, recent_win_rate=0.30) == "CONSERVATIVE"


def test_high_win_rate_upgrades_mode():
    # VIX=17 → NORMAL, great win rate → AGGRESSIVE
    assert _determine_risk_mode(vix=17, drawdown_pct=0, recent_win_rate=0.70) == "AGGRESSIVE"


def test_combined_degrade_caps_at_defensive():
    # VIX=24 → CONSERVATIVE, + drawdown 12% (-2) → DEFENSIVE (capped)
    assert _determine_risk_mode(vix=24, drawdown_pct=12, recent_win_rate=0.5) == "DEFENSIVE"


# ── _get_trade_style ─────────────────────────────────────────────────────────

def test_bull_aggressive_gives_position():
    assert _get_trade_style("BULL_TREND", "AGGRESSIVE") == "POSITION_TRADE"


def test_bull_normal_gives_swing():
    assert _get_trade_style("BULL_TREND", "NORMAL") == "SWING_TRADE"


def test_bear_any_gives_day():
    for mode in ("AGGRESSIVE", "NORMAL", "CONSERVATIVE", "DEFENSIVE"):
        assert _get_trade_style("BEAR_TREND", mode) == "DAY_TRADE"


def test_crisis_any_gives_day():
    for mode in ("AGGRESSIVE", "NORMAL", "CONSERVATIVE", "DEFENSIVE"):
        assert _get_trade_style("CRISIS", mode) == "DAY_TRADE"


def test_choppy_aggressive_gives_swing():
    assert _get_trade_style("CHOPPY_RANGE", "AGGRESSIVE") == "SWING_TRADE"


def test_choppy_conservative_gives_day():
    assert _get_trade_style("CHOPPY_RANGE", "CONSERVATIVE") == "DAY_TRADE"


def test_all_style_matrix_entries_valid():
    """Every entry in _STYLE_MATRIX maps to a known trade style."""
    for (regime, mode), style in _STYLE_MATRIX.items():
        assert style in TRADE_STYLE_PARAMS, f"({regime},{mode}) → unknown style '{style}'"


def test_unknown_regime_defaults_to_swing():
    assert _get_trade_style("UNKNOWN_REGIME", "NORMAL") == "SWING_TRADE"
