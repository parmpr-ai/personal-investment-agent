"""
Adaptive ML Trainer — Automatic retraining triggered by trade volume.
Runs in background while executor trades, incrementally improves predictions.
"""
import asyncio
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parents[1]
DB_PATH = BASE_DIR / "autonomous_trades.sqlite3"


class AdaptiveTrainer:
    """Intelligently trigger retraining based on trade performance."""

    def __init__(
        self,
        min_trades_between_retrains: int = 20,
        max_time_between_retrains_minutes: int = 120,
        enable_background_training: bool = True,
    ):
        self.min_trades = min_trades_between_retrains
        self.max_time_minutes = max_time_between_retrains_minutes
        self.enable_bg_training = enable_background_training

        self.last_train_time = datetime.now(timezone.utc)
        self.trades_since_train = 0
        self.training_in_progress = False
        self.training_history: list[Dict[str, Any]] = []

    def should_retrain(self) -> tuple[bool, str]:
        """Determine if retraining is needed."""
        now = datetime.now(timezone.utc)
        trades_closed = self._count_closed_trades_since_last_train()

        # Trigger 1: Enough new trades
        if trades_closed >= self.min_trades:
            return True, f"{trades_closed} new closed trades (threshold: {self.min_trades})"

        # Trigger 2: Max time elapsed
        elapsed_minutes = (now - self.last_train_time).total_seconds() / 60
        if elapsed_minutes >= self.max_time_minutes:
            return True, f"{elapsed_minutes:.0f}m elapsed (max: {self.max_time_minutes}m)"

        # Trigger 3: Declining win rate
        win_rate = self._get_recent_win_rate(window_trades=10)
        if win_rate is not None and win_rate < 70:  # Drop below 70% = retrain
            return True, f"Win rate dropped to {win_rate:.1f}% (threshold: 70%)"

        return False, "No retrain trigger"

    def can_train_now(self) -> bool:
        """Check if training is not already in progress."""
        return not self.training_in_progress

    async def retrain_async(self) -> Dict[str, Any]:
        """Async retraining (placeholder for actual ML training)."""
        if self.training_in_progress:
            return {"ok": False, "error": "Training already in progress"}

        self.training_in_progress = True
        start_time = datetime.now(timezone.utc)

        try:
            # Simulate async training
            logger.info("[AdaptiveTrainer] Starting retraining...")

            # In production: call ml_scorer.train_all_models() here
            await asyncio.sleep(0.5)  # Simulate training latency

            elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
            result = {
                "ok": True,
                "trained_at": start_time.isoformat(),
                "elapsed_seconds": round(elapsed, 2),
                "closed_trades_since_last": self._count_closed_trades_since_last_train(),
                "recent_win_rate": self._get_recent_win_rate(),
            }

            self.last_train_time = start_time
            self.training_history.append(result)

            logger.info(f"[AdaptiveTrainer] Retraining complete: {elapsed:.2f}s")
            return result

        except Exception as e:
            logger.error(f"[AdaptiveTrainer] Training failed: {e}")
            return {"ok": False, "error": str(e)}
        finally:
            self.training_in_progress = False

    def _count_closed_trades_since_last_train(self) -> int:
        """Count closed trades since last training."""
        try:
            conn = sqlite3.connect(DB_PATH, timeout=10)
            cursor = conn.cursor()
            query = """
                SELECT COUNT(*) FROM autonomous_trades
                WHERE exit_ts IS NOT NULL AND exit_ts > ?
            """
            cursor.execute(query, (self.last_train_time.isoformat(),))
            count = cursor.fetchone()[0]
            conn.close()
            return count
        except Exception:
            return 0

    def _get_recent_win_rate(self, window_trades: int = 20) -> Optional[float]:
        """Get win rate on recent trades."""
        try:
            conn = sqlite3.connect(DB_PATH, timeout=10)
            cursor = conn.cursor()
            query = """
                SELECT was_correct FROM autonomous_trades
                WHERE exit_ts IS NOT NULL
                ORDER BY exit_ts DESC
                LIMIT ?
            """
            cursor.execute(query, (window_trades,))
            results = cursor.fetchall()
            conn.close()

            if not results:
                return None

            wins = sum(1 for (correct,) in results if correct)
            return (wins / len(results)) * 100
        except Exception:
            return None

    def get_status(self) -> Dict[str, Any]:
        """Get trainer status."""
        return {
            "training_in_progress": self.training_in_progress,
            "last_train_time": self.last_train_time.isoformat(),
            "closed_trades_since": self._count_closed_trades_since_last_train(),
            "min_trades_threshold": self.min_trades,
            "max_time_minutes": self.max_time_minutes,
            "recent_win_rate_pct": self._get_recent_win_rate(),
            "training_history_count": len(self.training_history),
        }

    def get_training_history(self, limit: int = 10) -> list[Dict[str, Any]]:
        """Get past training events."""
        return self.training_history[-limit:]


# Global trainer instance
adaptive_trainer = AdaptiveTrainer(
    min_trades_between_retrains=20,
    max_time_between_retrains_minutes=120,
    enable_background_training=True,
)
