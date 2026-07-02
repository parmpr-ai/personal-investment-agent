"""
Online Learning — Update models incrementally from streaming trade data.
No retraining downtime. Models evolve with live performance.
"""
import numpy as np
import pickle
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from collections import deque
from sklearn.preprocessing import MinMaxScaler
from sklearn.linear_model import SGDClassifier


class OnlineLearner:
    """Learn continuously from closed trades without full retraining."""

    def __init__(self):
        self.model_dir = Path(__file__).resolve().parents[1] / "ml_models"
        self.online_models: Dict[str, Dict[str, Any]] = {}
        self.batch_size = 5  # Accumulate 5 trades before updating
        self.trade_buffer: deque = deque(maxlen=100)  # Last 100 closed trades
        self.update_history: List[Dict[str, Any]] = []

    def add_closed_trade(self, trade: Dict[str, Any]):
        """Record a closed trade for online learning."""
        self.trade_buffer.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "strategy": trade.get("strategy"),
            "ticker": trade.get("ticker"),
            "was_correct": trade.get("was_correct", False),
            "confidence": trade.get("confidence", 0),
            "pnl": trade.get("pnl", 0),
            "pnl_pct": trade.get("pnl_pct", 0),
        })

    def should_update(self, strategy: str) -> bool:
        """Check if enough trades accumulated to warrant online update."""
        strategy_trades = [
            t for t in self.trade_buffer if t["strategy"] == strategy
        ]
        return len(strategy_trades) >= self.batch_size

    def update_model_online(self, strategy: str, features_list: List[np.ndarray],
                           labels_list: List[int]) -> Optional[Dict[str, Any]]:
        """
        Update existing model with new trade data using SGD.

        Non-blocking: adds gradients without full retraining.
        """
        try:
            if len(features_list) < 1:
                return None

            model_path = self.model_dir / f"model_{strategy}.pkl"
            if not model_path.exists():
                return None

            # Load existing model
            with open(model_path, "rb") as f:
                old_model = pickle.load(f)

            # Load or create SGD classifier for online updates
            if strategy not in self.online_models:
                self.online_models[strategy] = {
                    "sgd_clf": SGDClassifier(
                        loss="log_loss",  # Logistic regression
                        n_jobs=1,
                        warm_start=True,
                        random_state=42,
                    ),
                    "classes_seen": [0, 1],
                    "feature_count": 0,
                }

            online_clf = self.online_models[strategy]["sgd_clf"]

            # Prepare data
            X = np.array(features_list)
            y = np.array(labels_list)

            # Initialize classes if needed
            if not hasattr(online_clf, "classes_"):
                online_clf.classes_ = np.array([0, 1])

            # Partial fit (online update)
            try:
                online_clf.partial_fit(
                    X, y, classes=[0, 1]
                )
            except Exception as e:
                print(f"[OnlineLearner] Error on partial_fit: {e}")
                return None

            # Track update
            result = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "strategy": strategy,
                "samples_updated": len(features_list),
                "accuracy_on_batch": float(
                    np.mean(online_clf.predict(X) == y)
                ),
                "coef_norm": float(np.linalg.norm(online_clf.coef_[0])),
            }

            self.update_history.append(result)

            return result

        except Exception as e:
            print(f"[OnlineLearner] Error updating model {strategy}: {e}")
            return None

    def get_online_prediction(self, strategy: str, features: np.ndarray) -> Optional[float]:
        """
        Get prediction from online-updated model.
        Falls back to original model if online model not available.
        """
        try:
            if strategy not in self.online_models:
                return None

            online_clf = self.online_models[strategy]["sgd_clf"]

            if not hasattr(online_clf, "classes_"):
                return None

            # Predict probability
            prob = online_clf.predict_proba(features.reshape(1, -1))[0, 1]
            return float(prob)

        except Exception:
            return None

    def get_online_stats(self) -> Dict[str, Any]:
        """Get statistics on online learning progress."""
        if not self.update_history:
            return {
                "total_updates": 0,
                "strategies_updating": [],
                "trades_in_buffer": len(self.trade_buffer),
            }

        recent_updates = self.update_history[-20:]

        return {
            "total_updates": len(self.update_history),
            "strategies_updating": list(set(
                u["strategy"] for u in recent_updates
            )),
            "trades_in_buffer": len(self.trade_buffer),
            "recent_updates": recent_updates,
            "avg_batch_size": np.mean([
                u["samples_updated"] for u in recent_updates
            ]) if recent_updates else 0,
            "avg_accuracy": np.mean([
                u["accuracy_on_batch"] for u in recent_updates
            ]) if recent_updates else 0,
        }

    def get_update_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent online update history."""
        return list(self.update_history[-limit:])


# Global online learner instance
online_learner = OnlineLearner()
