"""
Batch Predictor — Predict all tickers at once with parallel processing.
Replaces sequential /predict calls with vectorized batch operations.
"""
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import numpy as np


class BatchPredictor:
    """Vectorized prediction for multiple tickers/strategies simultaneously."""

    def __init__(self, batch_size: int = 8):
        self.batch_size = batch_size
        self.prediction_history: List[Dict[str, Any]] = []
        self.total_batches = 0
        self.total_predictions = 0

    async def predict_batch(
        self,
        strategy_ticker_pairs: List[tuple[str, str]],
        prediction_fn,  # async function that takes (strategy, ticker)
    ) -> Dict[str, Dict[str, Any]]:
        """
        Predict multiple strategy/ticker pairs in parallel batches.

        Args:
            strategy_ticker_pairs: List of (strategy, ticker) tuples
            prediction_fn: Async function to call for predictions

        Returns:
            Dict mapping "strategy:ticker" -> prediction result
        """
        start_time = datetime.now(timezone.utc)
        results = {}

        # Split into batches
        batches = [
            strategy_ticker_pairs[i : i + self.batch_size]
            for i in range(0, len(strategy_ticker_pairs), self.batch_size)
        ]

        # Process each batch in parallel
        for batch in batches:
            tasks = [prediction_fn(strat, ticker) for strat, ticker in batch]
            batch_results = await asyncio.gather(*tasks)

            for (strat, ticker), pred in zip(batch, batch_results):
                if pred:
                    results[f"{strat}:{ticker}"] = pred

            self.total_batches += 1

        self.total_predictions += len(results)

        elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()

        self.prediction_history.append(
            {
                "timestamp": start_time.isoformat(),
                "predictions_made": len(results),
                "batches_used": len(batches),
                "elapsed_seconds": round(elapsed, 3),
                "predictions_per_second": round(len(results) / elapsed, 1) if elapsed > 0 else 0,
            }
        )

        return results

    async def predict_all_strategies(
        self,
        tickers: List[str],
        strategies: List[str],
        prediction_fn,
    ) -> Dict[str, Dict[str, Any]]:
        """Cartesian product: all strategies × all tickers."""
        pairs = [(s, t) for s in strategies for t in tickers]
        return await self.predict_batch(pairs, prediction_fn)

    def get_batch_efficiency(self) -> Dict[str, Any]:
        """Calculate batch processing efficiency metrics."""
        if not self.prediction_history:
            return {
                "total_batch_calls": 0,
                "total_predictions": 0,
                "avg_predictions_per_second": 0,
                "speedup_vs_sequential": "N/A",
            }

        history = self.prediction_history
        avg_speed = np.mean([h["predictions_per_second"] for h in history])
        total_preds = sum(h["predictions_made"] for h in history)

        # Estimate: sequential would take 10ms per prediction
        sequential_time = total_preds * 0.01
        actual_time = sum(h["elapsed_seconds"] for h in history)
        speedup = sequential_time / actual_time if actual_time > 0 else 1

        return {
            "total_batch_calls": len(history),
            "total_predictions": total_preds,
            "avg_predictions_per_second": round(avg_speed, 1),
            "estimated_speedup_ratio": round(speedup, 1),
            "total_time_saved_seconds": round(sequential_time - actual_time, 2),
        }

    def get_recent_stats(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent batch statistics."""
        return self.prediction_history[-limit:]


# Global batch predictor
batch_predictor = BatchPredictor(batch_size=8)
