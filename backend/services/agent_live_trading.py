"""
Live Trading Module - Continuous predictions and incremental retraining.

Workflow:
1. Live predictions (every N minutes): Use current models to predict next moves
2. Log decisions + outcomes in DB
3. Incremental retrain (every X trades): Warm-start retrain with new data
4. Market-close full retrain (4pm daily): Full retrain with all daily data
"""

import asyncio
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np

from .ml_scorer import _load_model, train_all_models, record_trade_outcome
from .backtester import fetch_history, compute_signal_arrays
from .autonomous_agent import UNIVERSE, DEFAULT_CONFIG

BASE_DIR = Path(__file__).resolve().parents[1]
AGENT_DB = BASE_DIR / "agent_training.sqlite3"


class LiveTradingEngine:
    """Orchestrates live predictions and incremental retraining."""

    def __init__(self):
        self.decisions_since_retrain = 0
        self.retrain_threshold = 50  # Retrain after 50 new decisions
        self.model_version = datetime.now(timezone.utc).isoformat()

    def log_decision(
        self,
        strategy: str,
        ticker: str,
        predicted_direction: str,
        predicted_prob: float,
        actual_direction: Optional[str] = None,
        actual_return: Optional[float] = None,
        profit_loss: Optional[float] = None,
    ) -> int:
        """Log a trading decision (prediction + optional outcome)."""
        conn = sqlite3.connect(AGENT_DB)
        ts = datetime.now(timezone.utc).isoformat()
        was_correct = None
        if actual_direction and predicted_direction:
            was_correct = 1 if actual_direction == predicted_direction else 0

        cursor = conn.execute(
            """
            INSERT INTO trading_decisions
            (ts, strategy, ticker, predicted_direction, predicted_prob,
             actual_direction, actual_return, profit_loss, was_correct, model_version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                ts,
                strategy,
                ticker,
                predicted_direction,
                predicted_prob,
                actual_direction,
                actual_return,
                profit_loss,
                was_correct,
                self.model_version,
            ),
        )
        decision_id = cursor.lastrowid
        conn.commit()
        conn.close()

        # Track for accuracy monitoring
        if was_correct is not None:
            record_trade_outcome(strategy, was_correct == 1)
            self.decisions_since_retrain += 1

        return decision_id

    def get_decision_stats(self, strategy: Optional[str] = None, hours: int = 24) -> Dict[str, Any]:
        """Get accuracy stats for the last N hours."""
        conn = sqlite3.connect(AGENT_DB)
        cutoff = (datetime.now(timezone.utc).timestamp() - hours * 3600) * 1000
        query = """
            SELECT strategy, COUNT(*) as total,
                   SUM(CASE WHEN was_correct=1 THEN 1 ELSE 0 END) as correct,
                   AVG(profit_loss) as avg_pnl,
                   SUM(profit_loss) as total_pnl
            FROM trading_decisions
            WHERE ts >= datetime('now', ? || ' hours')
        """
        params = [-hours]

        if strategy:
            query += " AND strategy = ?"
            params.append(strategy)

        query += " GROUP BY strategy"

        cursor = conn.execute(query, params)
        rows = cursor.fetchall()
        conn.close()

        stats = {}
        for row in rows:
            s = row[0]
            total = row[1]
            correct = row[2] or 0
            avg_pnl = row[3] or 0
            total_pnl = row[4] or 0

            stats[s] = {
                "total_decisions": total,
                "correct": correct,
                "accuracy": round(correct / total, 3) if total > 0 else 0,
                "avg_pnl": round(avg_pnl, 2),
                "total_pnl": round(total_pnl, 2),
            }

        return stats

    async def predict_next_move(
        self, strategy: str, ticker: str
    ) -> Dict[str, Any]:
        """
        Get next move prediction using current model.

        Returns:
            {
                "ticker": str,
                "strategy": str,
                "direction": "up" | "down",
                "probability": float (0-1),
                "confidence": int (-100 to 100),
                "timestamp": str,
                "model_version": str,
            }
        """
        # Fetch current data
        hist = await fetch_history(ticker, days=100)
        if not hist or "closes" not in hist:
            return {"error": f"No data for {ticker}"}

        # Compute signals
        sigs = compute_signal_arrays(
            hist["closes"], hist["volumes"], hist["highs"], hist["lows"]
        )

        # Build feature vector (last bar) - handle mixed types
        def to_float(val):
            """Convert various types to float for ML input."""
            if isinstance(val, (np.bool_, bool)):
                return float(int(val))
            if isinstance(val, (np.str_, str)):
                # Map common categorical strings
                if val in ('UP', 'up', 'true', 'True'):
                    return 1.0
                elif val in ('DOWN', 'down', 'false', 'False'):
                    return 0.0
                else:
                    return 0.5  # neutral
            return float(val)

        feature_names = list(sigs.keys())
        X = np.array([to_float(sigs[fname][-1]) for fname in feature_names]).reshape(1, -1)

        # Load model
        model = _load_model(strategy)
        if not model:
            return {"error": f"No model for {strategy}"}

        # Apply feature selection if model was trained with it
        if model.get("selected_indices"):
            X = X[:, model["selected_indices"]]

        # Scale features
        if model.get("scaler"):
            X = model["scaler"].transform(X)

        # Predict
        try:
            probs = model["hgbc"].predict_proba(X)[0]
            prob_up = probs[1]
            direction = "up" if prob_up >= 0.5 else "down"

            # Apply model's decision threshold if available
            threshold = model.get("decision_threshold", 0.5)
            confidence = int((prob_up - threshold) * 200)  # -100 to +100

            result = {
                "ticker": ticker,
                "strategy": strategy,
                "direction": direction,
                "probability": round(prob_up, 3),
                "confidence": confidence,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "model_version": self.model_version,
            }

            # Log prediction
            self.log_decision(
                strategy=strategy,
                ticker=ticker,
                predicted_direction=direction,
                predicted_prob=prob_up,
            )

            return result
        except Exception as e:
            return {"error": str(e)}

    async def update_decision_outcome(
        self,
        decision_id: int,
        actual_direction: str,
        actual_return: float,
        profit_loss: float,
    ) -> bool:
        """Update a logged decision with actual outcome."""
        conn = sqlite3.connect(AGENT_DB)
        conn.execute(
            """
            UPDATE trading_decisions
            SET actual_direction = ?, actual_return = ?, profit_loss = ?,
                was_correct = CASE
                    WHEN predicted_direction = ? THEN 1
                    ELSE 0
                END
            WHERE id = ?
        """,
            (actual_direction, actual_return, profit_loss, actual_direction, decision_id),
        )
        conn.commit()
        conn.close()
        return True

    async def incremental_retrain(
        self, tickers: Optional[list[str]] = None, days: int = 100
    ) -> Dict[str, Any]:
        """
        Incremental retrain: warm-start update with recent data only.
        Much faster than full retrain (10-20s vs 60s).
        """
        tickers = tickers or UNIVERSE
        start_time = datetime.now(timezone.utc).timestamp()

        result = await train_all_models(
            tickers=tickers,
            days=days,  # Only recent data
            use_cache=True,
            refresh=False,  # Use cache
            parallel=True,
            incremental=True,  # ← Warm-start from old models
            feature_selection=True,
        )

        duration = datetime.now(timezone.utc).timestamp() - start_time
        self.decisions_since_retrain = 0  # Reset counter
        self.model_version = datetime.now(timezone.utc).isoformat()

        return {
            "status": "incremental_retrain_complete",
            "duration_seconds": round(duration, 2),
            "decisions_processed": self.decisions_since_retrain,
            "result": result,
        }

    async def full_retrain_market_close(
        self, tickers: Optional[list[str]] = None
    ) -> Dict[str, Any]:
        """
        Full retrain at market close (4pm): use all daily data for maximum accuracy.
        Takes ~60s but happens only once per day.
        """
        tickers = tickers or UNIVERSE
        start_time = datetime.now(timezone.utc).timestamp()

        result = await train_all_models(
            tickers=tickers,
            days=504,  # Full 2 years for market-close retrain
            use_cache=True,
            refresh=False,
            parallel=True,
            incremental=False,  # Full retrain
            feature_selection=True,
        )

        duration = datetime.now(timezone.utc).timestamp() - start_time
        self.decisions_since_retrain = 0
        self.model_version = datetime.now(timezone.utc).isoformat()

        return {
            "status": "market_close_retrain_complete",
            "duration_seconds": round(duration, 2),
            "result": result,
        }

    def should_incremental_retrain(self) -> bool:
        """Check if we should trigger incremental retrain."""
        return self.decisions_since_retrain >= self.retrain_threshold


# Global instance
live_trading_engine = LiveTradingEngine()
