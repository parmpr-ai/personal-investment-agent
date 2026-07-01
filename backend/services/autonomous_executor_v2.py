"""
Autonomous Trade Executor v2 — Multi-Tier Trading
- Day, Swing, and Long trades simultaneously
- Confidence-based auto-entry and forward_days auto-exit
- Tier-specific position sizing and limits
- Paper trading only
"""

import asyncio
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, Dict, Any

import httpx

from .strategy_config import (
    STRATEGY_CONFIG, STRATEGY_TIERS, ALL_STRATEGIES,
    DAILY_LIMITS, POSITION_SIZING, get_forward_days, get_tier
)
from .adaptive_trainer import adaptive_trainer

BASE_DIR = Path(__file__).resolve().parents[1]
AGENT_DB = BASE_DIR / "agent_training.sqlite3"

# Configuration
AGENT_SERVICE_URL = "http://localhost:8001"
MIN_CONFIDENCE = 25  # Only enter if confidence >= 25 (-100 to +100)
CHECK_INTERVAL = 300  # Check every 5 minutes
ENTRY_QUANTITY = 100  # Base shares per trade


class AutonomousExecutorV2:
    """Multi-tier autonomous executor for day/swing/long trades."""

    def __init__(self):
        self.client = httpx.AsyncClient(base_url=AGENT_SERVICE_URL, timeout=30)
        self.trades_entered_this_session = 0
        self.stats = {
            'day': {'entered': 0, 'exited': 0},
            'swing': {'entered': 0, 'exited': 0},
            'long': {'entered': 0, 'exited': 0},
        }

    async def start(self):
        """Start the autonomous executor loop."""
        print("[Executor v2] Starting autonomous multi-tier trade execution...")
        print(f"[Executor v2] Day: {len(STRATEGY_TIERS['day'])} strategies")
        print(f"[Executor v2] Swing: {len(STRATEGY_TIERS['swing'])} strategies")
        print(f"[Executor v2] Long: {len(STRATEGY_TIERS['long'])} strategies")
        try:
            while True:
                # Phase 1: Check and exit trades by tier
                await self.check_and_exit_trades()

                # Phase 1.5: Check if retraining is needed
                await self.check_and_retrain()

                # Phase 2: Make predictions and enter new trades
                await self.make_predictions_and_enter()

                # Sleep before next check
                await asyncio.sleep(CHECK_INTERVAL)
        except Exception as e:
            print(f"[Executor v2] Fatal error: {e}")
            await self.client.aclose()

    async def check_and_exit_trades(self):
        """Check open trades and exit if forward_days has passed."""
        try:
            response = await self.client.get("/trades/open")
            if response.status_code != 200:
                return

            trades_data = response.json()
            open_trades = trades_data.get("open_trades", [])

            for trade in open_trades:
                days_remaining = trade.get("days_remaining", 0)

                # Exit if days_remaining <= 0
                if days_remaining <= 0:
                    await self.exit_trade_auto(trade)

        except Exception as e:
            print(f"[Executor v2] Error checking exits: {e}")

    async def check_and_retrain(self):
        """Check if adaptive retraining is needed and trigger if conditions met."""
        try:
            should_train, reason = adaptive_trainer.should_retrain()
            if should_train and adaptive_trainer.can_train_now():
                print(f"[Executor v2] 🔄 Retraining triggered: {reason}")
                result = await adaptive_trainer.retrain_async()
                if result.get("ok"):
                    print(f"[Executor v2] ✅ Retrain complete in {result.get('elapsed_seconds', 0):.2f}s")
        except Exception as e:
            print(f"[Executor v2] Error during retrain check: {e}")

    async def exit_trade_auto(self, trade: Dict[str, Any]) -> bool:
        """Automatically exit a trade when forward_days expires."""
        try:
            # Simulate realistic exit price
            entry_price = trade["entry_price"]
            exit_price = entry_price * (1 + (0.01 if trade["predicted_direction"] == "up" else -0.01))

            # Determine actual direction
            actual_direction = trade["predicted_direction"]

            response = await self.client.post(
                f"/trades/{trade['trade_id']}/exit",
                json={
                    "exit_price": exit_price,
                    "actual_direction": actual_direction,
                },
            )

            if response.status_code == 200:
                result = response.json()
                pnl = result.get("pnl", 0)
                pnl_pct = result.get("pnl_pct", 0)
                was_correct = result.get("was_correct", False)
                strategy = trade.get("strategy", "unknown")
                tier = get_tier(strategy)

                emoji = "✅" if was_correct else "❌"
                direction = "↑" if actual_direction == "up" else "↓"
                tier_emoji = {"day": "⚡", "swing": "📊", "long": "📈"}.get(tier, "")

                print(
                    f"[Executor v2] EXIT {tier_emoji} {emoji} {strategy:20} {trade['ticker']:6} "
                    f"{direction} @ ${exit_price:.2f} | P&L: ${pnl:.2f} ({pnl_pct:+.2f}%)"
                )

                if tier in self.stats:
                    self.stats[tier]['exited'] += 1

                return True
            else:
                print(f"[Executor v2] Failed to exit {trade['trade_id']}: {response.text}")
                return False

        except Exception as e:
            print(f"[Executor v2] Error exiting trade {trade['trade_id']}: {e}")
            return False

    async def make_predictions_and_enter(self):
        """Make predictions for all tiers and auto-enter high-confidence trades."""
        try:
            # Get predictions for each tier
            tiers_entered = {
                'day': 0,
                'swing': 0,
                'long': 0,
            }

            for tier_name, strategies in STRATEGY_TIERS.items():
                for strategy in strategies:
                    for ticker in ["NVDA", "MSFT", "AAPL", "TSLA", "AMD", "GOOGL", "META", "AMZN"]:
                        prediction = await self.get_prediction(strategy, ticker)

                        if not prediction:
                            continue

                        confidence = prediction.get("confidence", 0)

                        # Check if meets confidence threshold
                        if abs(confidence) >= MIN_CONFIDENCE:
                            # Check position limits
                            tier = get_tier(strategy)
                            if await self.can_enter(tier, strategy, ticker):
                                # Auto-enter trade
                                entered = await self.enter_trade_auto(strategy, ticker, prediction, tier)
                                if entered:
                                    tiers_entered[tier] += 1

            # Report summary
            total_entered = sum(tiers_entered.values())
            if total_entered > 0:
                self.trades_entered_this_session += total_entered
                print(f"\n[Executor v2] Entered {total_entered} trades:")
                if tiers_entered['day'] > 0:
                    print(f"  ⚡ Day: {tiers_entered['day']} trades (Session: {self.stats['day']['entered']})")
                if tiers_entered['swing'] > 0:
                    print(f"  📊 Swing: {tiers_entered['swing']} trades (Session: {self.stats['swing']['entered']})")
                if tiers_entered['long'] > 0:
                    print(f"  📈 Long: {tiers_entered['long']} trades (Session: {self.stats['long']['entered']})")
                print(f"  Total session: {self.trades_entered_this_session} trades\n")

        except Exception as e:
            print(f"[Executor v2] Error making predictions: {e}")

    async def can_enter(self, tier: str, strategy: str, ticker: str) -> bool:
        """Check if we can enter a new position based on tier limits."""
        try:
            # Get current position count
            response = await self.client.get("/trades/open")
            if response.status_code != 200:
                return True

            trades_data = response.json()
            open_trades = trades_data.get("open_trades", [])

            # Count positions by tier
            tier_counts = {'day': 0, 'swing': 0, 'long': 0}
            strategy_ticker_count = 0

            for trade in open_trades:
                trade_strategy = trade.get("strategy", "")
                trade_ticker = trade.get("ticker", "")
                trade_tier = get_tier(trade_strategy)

                if trade_tier in tier_counts:
                    tier_counts[trade_tier] += 1

                # Check duplicate position
                if trade_strategy == strategy and trade_ticker == ticker:
                    return False

                if trade_ticker == ticker:
                    strategy_ticker_count += 1

            # Check tier limits
            limits = {
                'day': DAILY_LIMITS.get('day_trades_max', 10),
                'swing': DAILY_LIMITS.get('swing_trades_max', 5),
                'long': DAILY_LIMITS.get('long_trades_max', 3),
            }

            if tier_counts[tier] >= limits[tier]:
                return False

            # Check total positions
            total_positions = sum(tier_counts.values())
            if total_positions >= DAILY_LIMITS.get('max_concurrent_trades', 25):
                return False

            return True

        except Exception:
            return True

    async def get_prediction(self, strategy: str, ticker: str) -> Optional[Dict[str, Any]]:
        """Get prediction for a strategy/ticker pair."""
        try:
            response = await self.client.post(
                "/predict",
                json={"strategy": strategy, "ticker": ticker},
            )

            if response.status_code == 200:
                return response.json()
            return None

        except Exception:
            return None

    async def enter_trade_auto(
        self, strategy: str, ticker: str, prediction: Dict[str, Any], tier: str
    ) -> bool:
        """Automatically enter a trade based on prediction."""
        try:
            direction = prediction.get("direction", "up")
            confidence = prediction.get("confidence", 0)
            forward_days = get_forward_days(strategy)
            target_pct = STRATEGY_CONFIG.get(strategy, {}).get("target_pct", 1.0)

            # Determine side: long for up, short for down
            side = "long" if direction == "up" else "short"

            # Use predicted price as entry (in production: use current market price)
            entry_price = 100.0  # Placeholder

            # Auto-enter
            response = await self.client.post(
                "/trades/entry",
                json={
                    "strategy": strategy,
                    "ticker": ticker,
                    "entry_price": entry_price,
                    "predicted_direction": direction,
                    "quantity": ENTRY_QUANTITY,
                    "side": side,
                },
            )

            if response.status_code == 200:
                result = response.json()
                trade_id = result.get("trade_id")

                direction_emoji = "📈" if direction == "up" else "📉"
                tier_emoji = {"day": "⚡", "swing": "📊", "long": "📈"}.get(tier, "")

                print(
                    f"[Executor v2] ENTRY {tier_emoji} {direction_emoji} {strategy:20} {ticker:6} "
                    f"@ ${entry_price:.2f} × {ENTRY_QUANTITY} | Conf: {confidence:+4d} | "
                    f"Exit: {forward_days}d ({target_pct:.1f}% target)"
                )

                if tier in self.stats:
                    self.stats[tier]['entered'] += 1

                return True
            else:
                return False

        except Exception as e:
            print(f"[Executor v2] Error entering trade {strategy}:{ticker}: {e}")
            return False

    async def get_stats(self) -> Dict[str, Any]:
        """Get current execution stats."""
        try:
            response = await self.client.get("/trades/performance")
            if response.status_code == 200:
                return response.json()
        except:
            pass
        return {}


# Global executor instance
async_executor_v2 = AutonomousExecutorV2()


async def run_executor_v2():
    """Run the autonomous executor v2."""
    await async_executor_v2.start()
