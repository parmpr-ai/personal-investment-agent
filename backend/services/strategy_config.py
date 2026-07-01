"""
Strategy Configuration v2 — Day, Swing, and Long-term trading

Three separate universes for different holding periods:
- Day Trades: 1-3 days, quick exits
- Swing Trades: 5-14 days, medium holds
- Long Trades: 20-60+ days, trend following
"""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DAY TRADES (1-3 days, 0.5-1.5% target)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DAY_STRATEGIES = {
    'day_momentum': {
        'forward_days': 1,
        'target_pct': 0.75,
        'description': 'Intraday momentum reversal',
        'holding_period': '1 day',
    },
    'day_mean_reversion': {
        'forward_days': 1,
        'target_pct': 0.5,
        'description': 'Intraday mean reversion (gap fills)',
        'holding_period': '1 day',
    },
    'day_breakout': {
        'forward_days': 2,
        'target_pct': 1.0,
        'description': 'Gap breakout continuation',
        'holding_period': '2 days',
    },
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SWING TRADES (5-14 days, 1.5-5% target)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SWING_STRATEGIES = {
    'swing_momentum': {
        'forward_days': 5,
        'target_pct': 2.0,
        'description': 'Multi-day momentum trades',
        'holding_period': '5 days',
    },
    'swing_mean_reversion': {
        'forward_days': 7,
        'target_pct': 1.5,
        'description': 'Weekly mean reversion bounces',
        'holding_period': '7 days',
    },
    'swing_breakout': {
        'forward_days': 5,
        'target_pct': 2.5,
        'description': 'Weekly resistance/support breaks',
        'holding_period': '5 days',
    },
    'swing_trend_follow': {
        'forward_days': 10,
        'target_pct': 3.0,
        'description': 'Multi-week trend continuation',
        'holding_period': '10 days',
    },
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LONG TRADES (20-60+ days, 3-15% target)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LONG_STRATEGIES = {
    'long_momentum': {
        'forward_days': 30,
        'target_pct': 5.0,
        'description': 'Monthly momentum runs',
        'holding_period': '30 days',
    },
    'long_mean_reversion': {
        'forward_days': 45,
        'target_pct': 4.0,
        'description': 'Long-term pullback recovery',
        'holding_period': '45 days',
    },
    'long_breakout': {
        'forward_days': 20,
        'target_pct': 6.0,
        'description': 'Major technical breakouts',
        'holding_period': '20 days',
    },
    'long_trend_follow': {
        'forward_days': 60,
        'target_pct': 8.0,
        'description': 'Multi-month trend rides',
        'holding_period': '60 days',
    },
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# UNIFIED CONFIG
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STRATEGY_CONFIG = {
    **DAY_STRATEGIES,
    **SWING_STRATEGIES,
    **LONG_STRATEGIES,
}

STRATEGY_TIERS = {
    'day': list(DAY_STRATEGIES.keys()),
    'swing': list(SWING_STRATEGIES.keys()),
    'long': list(LONG_STRATEGIES.keys()),
}

ALL_STRATEGIES = list(STRATEGY_CONFIG.keys())

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# EXECUTION CONFIG
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DAILY_LIMITS = {
    'day_trades_max': 10,        # Max daily trades per ticker
    'swing_trades_max': 5,       # Max swing positions per ticker
    'long_trades_max': 3,        # Max long positions per ticker
    'max_concurrent_trades': 25, # Total open trades limit
    'daily_loss_limit_pct': -5,  # Stop trading if -5% daily loss
}

POSITION_SIZING = {
    'day_trades': 0.01,      # 1% per day trade
    'swing_trades': 0.02,    # 2% per swing trade
    'long_trades': 0.05,     # 5% per long position
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CYCLE CONFIG
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CYCLE_CONFIG = {
    'day_cycle': {
        'duration_minutes': 60,      # Check day trades every hour
        'prediction_interval': 5,    # Predict every 5 minutes
        'check_exits_interval': 15,  # Check exits every 15 minutes
    },
    'swing_cycle': {
        'duration_minutes': 360,     # Check swing trades every 6 hours
        'prediction_interval': 30,   # Predict every 30 minutes
        'check_exits_interval': 60,  # Check exits every hour
    },
    'long_cycle': {
        'duration_minutes': 1440,    # Check long trades daily
        'prediction_interval': 240,  # Predict every 4 hours
        'check_exits_interval': 360, # Check exits every 6 hours
    },
}


def get_tier(strategy: str) -> str:
    """Get the tier (day/swing/long) for a strategy."""
    for tier, strategies in STRATEGY_TIERS.items():
        if strategy in strategies:
            return tier
    return 'unknown'


def get_forward_days(strategy: str) -> int:
    """Get holding period in days for a strategy."""
    return STRATEGY_CONFIG.get(strategy, {}).get('forward_days', 5)


def get_target_pct(strategy: str) -> float:
    """Get target return % for a strategy."""
    return STRATEGY_CONFIG.get(strategy, {}).get('target_pct', 1.0)


def get_holding_period(strategy: str) -> str:
    """Get human-readable holding period."""
    return STRATEGY_CONFIG.get(strategy, {}).get('holding_period', 'unknown')
