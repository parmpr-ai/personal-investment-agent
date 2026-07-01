"""
Ensemble Rebalancer — Dynamically adjust weights of base learners.
Some learners work better in different market conditions.
"""
import numpy as np
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from collections import deque


class EnsembleRebalancer:
    """Dynamically weight base learners based on recent performance."""

    def __init__(self):
        self.learner_names = ["hgbc", "rf", "etc", "lgb", "cb"]
        self.current_weights: Dict[str, float] = {
            name: 0.2 for name in self.learner_names  # Equal weights initially
        }
        self.performance_history: Dict[str, deque] = {
            name: deque(maxlen=30) for name in self.learner_names
        }
        self.rebalance_history: List[Dict[str, Any]] = []

    def record_prediction_accuracy(
        self, learner_name: str, was_correct: bool, confidence: float
    ):
        """Record individual learner prediction accuracy."""
        if learner_name in self.performance_history:
            self.performance_history[learner_name].append(
                {"correct": was_correct, "confidence": abs(confidence)}
            )

    def calculate_optimal_weights(self) -> Dict[str, float]:
        """
        Calculate optimal weights for each learner based on recent performance.

        Uses Sharpe-like metric: accuracy * confidence on recent trades.
        """
        new_weights = {}
        scores = {}

        for learner_name in self.learner_names:
            history = list(self.performance_history[learner_name])

            if not history:
                scores[learner_name] = 0.5  # Default for untested learners
                continue

            # Score = (accuracy * avg_confidence)
            accuracy = np.mean([h["correct"] for h in history])
            avg_confidence = np.mean([h["confidence"] for h in history])

            # Weight by confidence: high confidence + high accuracy = strong signal
            score = accuracy * (1 + avg_confidence / 100)
            scores[learner_name] = score

        # Normalize scores to weights (softmax)
        total_score = sum(scores.values())
        if total_score == 0:
            # All learners untested - equal weights
            new_weights = {name: 0.2 for name in self.learner_names}
        else:
            new_weights = {
                name: score / total_score for name, score in scores.items()
            }

        # Smooth transition: don't swing weights too drastically
        smoothed_weights = {}
        for name in self.learner_names:
            old_w = self.current_weights[name]
            new_w = new_weights[name]
            # 70% old weight, 30% new weight = smooth transition
            smoothed_weights[name] = 0.7 * old_w + 0.3 * new_w

        self.current_weights = smoothed_weights

        # Log rebalancing event
        self.rebalance_history.append(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "scores": scores,
                "weights": {k: round(v, 4) for k, v in smoothed_weights.items()},
                "max_weight": round(max(smoothed_weights.values()), 4),
                "min_weight": round(min(smoothed_weights.values()), 4),
            }
        )

        return smoothed_weights

    def get_weighted_prediction(self, predictions: Dict[str, Any]) -> tuple[float, str]:
        """
        Combine individual learner predictions using current weights.

        predictions: Dict with keys matching learner_names, values are probabilities [0, 1]
        """
        weighted_prob = 0.0

        for learner_name in self.learner_names:
            if learner_name in predictions:
                prob = predictions[learner_name]
                weight = self.current_weights[learner_name]
                weighted_prob += prob * weight

        # Direction is just sign of weighted_prob - 0.5
        direction = "up" if weighted_prob > 0.5 else "down"

        return float(weighted_prob), direction

    def get_rebalancer_stats(self) -> Dict[str, Any]:
        """Get current ensemble state."""
        recent_history = (
            self.rebalance_history[-5:] if self.rebalance_history else []
        )

        return {
            "current_weights": {k: round(v, 4) for k, v in self.current_weights.items()},
            "dominant_learner": max(self.current_weights, key=self.current_weights.get),
            "dominant_learner_weight": round(
                max(self.current_weights.values()), 4
            ),
            "weight_entropy": round(self._calculate_entropy(), 4),
            "total_rebalances": len(self.rebalance_history),
            "recent_rebalances": recent_history,
        }

    def _calculate_entropy(self) -> float:
        """Calculate Shannon entropy of weight distribution."""
        weights = np.array(list(self.current_weights.values()))
        # Clip to avoid log(0)
        weights = np.clip(weights, 1e-10, 1)
        return float(-np.sum(weights * np.log(weights)))

    def get_performance_by_learner(
        self, learner_name: str, window: int = 10
    ) -> Optional[Dict[str, Any]]:
        """Get recent performance of specific learner."""
        if learner_name not in self.performance_history:
            return None

        history = list(self.performance_history[learner_name])[-window:]

        if not history:
            return None

        accuracy = np.mean([h["correct"] for h in history])
        avg_conf = np.mean([h["confidence"] for h in history])

        return {
            "learner": learner_name,
            "recent_accuracy_pct": round(accuracy * 100, 1),
            "avg_confidence": round(avg_conf, 2),
            "current_weight": round(self.current_weights[learner_name], 4),
            "samples": len(history),
        }


# Global ensemble rebalancer
ensemble_rebalancer = EnsembleRebalancer()
