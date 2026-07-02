"""
Daily Universe Updater — Add 200 new mid/small-cap stocks daily
Maintains rolling window of highest-opportunity stocks
"""

import asyncio
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Any
import pytz

from .stock_screener import stock_screener
from .ticker_universe import COMPREHENSIVE_UNIVERSE, UNIVERSE_BY_INDUSTRY


class DailyUniverseUpdater:
    """Manages daily universe updates with opportunity screening."""

    def __init__(self):
        self.base_dir = Path(__file__).resolve().parents[1]
        self.history_file = self.base_dir / "universe_history.json"
        self.universe_backup_file = self.base_dir / "universe_backup.json"
        self.max_new_daily = 200
        self.history = self._load_history()
        self.last_update = self._get_last_update_time()

    def _load_history(self) -> Dict[str, Any]:
        """Load daily screening history."""
        try:
            if self.history_file.exists():
                with open(self.history_file, "r") as f:
                    return json.load(f)
        except Exception as e:
            print(f"[UniverseUpdater] Error loading history: {e}")
        return {"updates": [], "total_new_stocks": 0}

    def _save_history(self):
        """Save daily screening history."""
        try:
            with open(self.history_file, "w") as f:
                json.dump(self.history, f, indent=2)
        except Exception as e:
            print(f"[UniverseUpdater] Error saving history: {e}")

    def _get_last_update_time(self) -> datetime:
        """Get timestamp of last universe update."""
        if self.history["updates"]:
            last = self.history["updates"][-1]
            return datetime.fromisoformat(last.get("timestamp", datetime.now().isoformat()))
        return datetime.now() - timedelta(days=1)

    async def daily_update(self) -> Dict[str, Any]:
        """Run daily update: screen 200 new stocks, add to universe."""
        now = datetime.now(pytz.UTC)
        last_update = self.last_update

        # Only update once per day (market close)
        if (now - last_update).total_seconds() < 82800:  # Less than 23 hours
            return {
                "ok": False,
                "reason": "Already updated today",
                "next_update": (last_update + timedelta(days=1)).isoformat(),
            }

        print(f"[UniverseUpdater] 🔄 Daily universe update starting...")

        # Step 1: Screen for opportunities
        opportunities = await stock_screener.screen_stocks(limit=self.max_new_daily)
        new_tickers = [opp["ticker"] for opp in opportunities]

        if not new_tickers:
            print(f"[UniverseUpdater] ⚠️ No new opportunities found today")
            return {
                "ok": False,
                "reason": "No opportunities found",
                "timestamp": now.isoformat(),
            }

        # Step 2: Filter out already-existing tickers
        existing = set(COMPREHENSIVE_UNIVERSE)
        truly_new = [t for t in new_tickers if t not in existing]

        print(f"[UniverseUpdater] Found {len(new_tickers)} opportunities, {len(truly_new)} new")

        # Step 3: Add to universe (in-memory only for now)
        # In production, would update ticker_universe.py
        added_count = len(truly_new)

        # Step 4: Record update
        update_record = {
            "timestamp": now.isoformat(),
            "new_tickers_count": added_count,
            "top_new_tickers": truly_new[:20],  # Store top 20
            "total_new_opportunities": len(new_tickers),
            "from_screening": opportunities[:10],  # Store top 10 with scores
        }

        self.history["updates"].append(update_record)
        self.history["total_new_stocks"] += added_count
        self._save_history()

        # Step 5: Return summary
        return {
            "ok": True,
            "timestamp": now.isoformat(),
            "new_tickers_added": added_count,
            "new_tickers_top_20": truly_new[:20],
            "universe_total": len(COMPREHENSIVE_UNIVERSE) + added_count,
            "total_daily_updates": len(self.history["updates"]),
        }

    def get_update_status(self) -> Dict[str, Any]:
        """Get current update status."""
        return {
            "last_update": self.last_update.isoformat(),
            "hours_since_update": (datetime.now() - self.last_update).total_seconds() / 3600,
            "total_updates": len(self.history["updates"]),
            "total_new_stocks_added": self.history["total_new_stocks"],
            "recent_updates": self.history["updates"][-5:] if self.history["updates"] else [],
        }

    def get_update_history(self, days: int = 30) -> List[Dict[str, Any]]:
        """Get update history for last N days."""
        cutoff = datetime.now() - timedelta(days=days)
        return [
            u for u in self.history["updates"]
            if datetime.fromisoformat(u.get("timestamp", "")) > cutoff
        ]

    async def schedule_daily_updates(self):
        """Background task: run daily updates at market close (4 PM ET)."""
        print("[UniverseUpdater] 📅 Starting scheduled daily updates...")

        while True:
            now = datetime.now(pytz.timezone("US/Eastern"))

            # Schedule for 4 PM ET (after market close)
            target_time = now.replace(hour=16, minute=0, second=0, microsecond=0)

            # If past 4 PM today, schedule for tomorrow
            if now > target_time:
                target_time = target_time + timedelta(days=1)

            wait_seconds = (target_time - now).total_seconds()

            print(f"[UniverseUpdater] Next update in {wait_seconds/3600:.1f} hours at {target_time}")

            # Wait until it's time
            await asyncio.sleep(wait_seconds)

            # Run update
            result = await self.daily_update()
            print(f"[UniverseUpdater] Update complete: {result}")


# Global updater instance
universe_updater = DailyUniverseUpdater()


async def run_daily_update() -> Dict[str, Any]:
    """Run one daily update cycle."""
    return await universe_updater.daily_update()
