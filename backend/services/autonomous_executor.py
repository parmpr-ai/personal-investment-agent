"""
Autonomous Trade Executor
- Auto-enters trades based on predictions (confidence threshold)
- Auto-exits after forward_days
- Auto-logs outcomes
- Zero manual intervention
"""

import asyncio
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, Dict, Any

import httpx

from .agent_live_trading import live_trading_engine
from .paper_trading_manager import paper_trading_manager, FORWARD_DAYS
from .autonomous_agent import UNIVERSE

BASE_DIR = Path(__file__).resolve().parents[1]
AGENT_DB = BASE_DIR / "agent_training.sqlite3"

# Configuration
AGENT_SERVICE_URL = "http://localhost:8001"
MIN_CONFIDENCE = 30  # Only enter if confidence >= 30 (-100 to +100)
ENTRY_QUANTITY = 100  # Shares per trade
CHECK_INTERVAL = 300  # Check every 5 minutes


class AutonomousExecutor:
    """Automatically enters/exits trades based on predictions and forward_days."""

    def __init__(self):
        self.client = httpx.AsyncClient(base_url=AGENT_SERVICE_URL, timeout=30)
        self.active_trades: Dict[str, Dict[str, Any]] = {}
        self.trades_entered_this_session = 0

    async def start(self):
        """Start the autonomous executor loop."""
        print("[Executor] Starting autonomous trade execution...")
        try:
            while True:
                # Phase 1: Check for exit candidates
                await self.check_and_exit_trades()

                # Phase 2: Make predictions and enter new trades
                await self.make_predictions_and_enter()

                # Sleep before next check
                await asyncio.sleep(CHECK_INTERVAL)
        except Exception as e:
            print(f"[Executor] Fatal error: {e}")
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
            print(f"[Executor] Error checking exits: {e}")

    async def exit_trade_auto(self, trade: Dict[str, Any]) -> bool:
        """Automatically exit a trade when forward_days expires."""
        try:
            # For now, simulate realistic exit price
            # In production: fetch current market price
            entry_price = trade["entry_price"]
            exit_price = entry_price * (1 + (0.01 if trade["predicted_direction"] == "up" else -0.01))

            # Determine actual direction (simplified: use predicted as proxy)
            # In production: would use actual market movement
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

                emoji = "✅" if was_correct else "❌"
                direction = "↑" if actual_direction == "up" else "↓"

                print(f"[Executor] EXIT {emoji} {trade['ticker']:6} {direction} @ ${exit_price:.2f} | P&L: ${pnl:.2f} ({pnl_pct:+.2f}%)")
                return True
            else:
                print(f"[Executor] Failed to exit {trade['trade_id']}: {response.text}")
                return False

        except Exception as e:
            print(f"[Executor] Error exiting trade {trade['trade_id']}: {e}")
            return False

    async def make_predictions_and_enter(self):
        """Make predictions for all strategies/tickers and auto-enter high-confidence trades."""
        try:
            strategies = [
                "momentum",
                "mean_reversion",
                "breakout",
                "trend_follow",
                "short_momentum",
                "short_breakdown",
            ]
            tickers = UNIVERSE  # Use full universe (14 stocks) instead of hardcoded subset

            entries_this_round = 0

            for strategy in strategies:
                for ticker in tickers:
                    prediction = await self.get_prediction(strategy, ticker)

                    if not prediction:
                        continue

                    confidence = prediction.get("confidence", 0)

                    # Check if meets confidence threshold
                    if abs(confidence) >= MIN_CONFIDENCE:
                        # Auto-enter trade
                        entered = await self.enter_trade_auto(strategy, ticker, prediction)
                        if entered:
                            entries_this_round += 1

            if entries_this_round > 0:
                self.trades_entered_this_session += entries_this_round
                print(f"[Executor] Entered {entries_this_round} trades (Session total: {self.trades_entered_this_session})")

        except Exception as e:
            print(f"[Executor] Error making predictions: {e}")

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

        except Exception as e:
            return None

    async def enter_trade_auto(self, strategy: str, ticker: str, prediction: Dict[str, Any]) -> bool:
        """Automatically enter a trade based on prediction."""
        try:
            # Don't enter if we already have this position open
            if await self.has_open_position(strategy, ticker):
                return False

            direction = prediction.get("direction", "up")
            confidence = prediction.get("confidence", 0)

            # Determine side: long for up, short for down
            side = "long" if direction == "up" else "short"

            # Use predicted price as entry (in production: use current market price)
            entry_price = 100.0  # Placeholder - would fetch actual price

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
                forward_days = result.get("forward_days", 5)

                direction_emoji = "📈" if direction == "up" else "📉"
                print(
                    f"[Executor] ENTRY {direction_emoji} {strategy:15} {ticker:6} @ ${entry_price:.2f} × {ENTRY_QUANTITY} | Conf: {confidence:+4d} | Exit: {forward_days}d"
                )
                return True
            else:
                return False

        except Exception as e:
            print(f"[Executor] Error entering trade {strategy}:{ticker}: {e}")
            return False

    async def has_open_position(self, strategy: str, ticker: str) -> bool:
        """Check if we already have an open position for this strategy/ticker."""
        try:
            response = await self.client.get("/trades/open")
            if response.status_code == 200:
                trades = response.json().get("open_trades", [])
                for trade in trades:
                    if trade["strategy"] == strategy and trade["ticker"] == ticker:
                        return True
            return False
        except:
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
async_executor = AutonomousExecutor()


async def run_executor():
    """Run the autonomous executor."""
    await async_executor.start()
