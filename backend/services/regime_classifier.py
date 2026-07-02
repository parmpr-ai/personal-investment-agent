"""
Regime Classifier — Detect market state and adapt training strategy accordingly.
Volatility regime, trend regime, mean-reversion regime.
"""
import numpy as np
from typing import Dict, Any, Optional, Tuple
from datetime import datetime, timezone
from collections import deque


class RegimeClassifier:
    """Classify market regime and adjust training parameters."""

    def __init__(self):
        self.current_regime: Optional[str] = None
        self.regime_history: deque = deque(maxlen=50)
        self.win_rate_history: deque = deque(maxlen=20)
        self.volatility_history: deque = deque(maxlen=20)

    def classify_regime(
        self,
        recent_returns: np.ndarray,
        recent_volatility: float,
        recent_win_rate: float,
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Classify market regime based on multiple signals.

        Regimes:
        - BULL: High returns, low volatility, high win rate
        - BEAR: Negative returns, high volatility, low win rate
        - VOLATILE: High volatility, erratic returns
        - MEAN_REVERSION: Oscillating around mean, mean-reversion signals
        - TREND: Strong directional bias
        """
        # Volatility-based classification
        volatility_regime = self._classify_volatility(recent_volatility)

        # Return-based classification
        return_mean = np.mean(recent_returns)
        return_regime = "BULL" if return_mean > 0.01 else "BEAR"

        # Win rate signal
        performance_regime = "STRONG" if recent_win_rate > 70 else "WEAK"

        # Trend detection (using momentum)
        trend = "UPTREND" if return_mean > 0.005 else "DOWNTREND"

        # Synthesize regimes
        if volatility_regime == "HIGH" and performance_regime == "WEAK":
            regime = "VOLATILE"
        elif volatility_regime == "LOW" and performance_regime == "STRONG":
            regime = "BULL"
        elif volatility_regime == "HIGH" and return_mean < -0.005:
            regime = "BEAR"
        elif self._is_mean_reverting(recent_returns):
            regime = "MEAN_REVERSION"
        else:
            regime = "TREND"

        self.current_regime = regime
        self.regime_history.append(
            {"timestamp": datetime.now(timezone.utc).isoformat(), "regime": regime}
        )

        return regime, {
            "volatility_regime": volatility_regime,
            "performance_regime": performance_regime,
            "trend": trend,
            "return_mean": round(return_mean, 4),
            "volatility": round(recent_volatility, 4),
            "win_rate": round(recent_win_rate, 2),
        }

    def get_training_config_for_regime(self, regime: str) -> Dict[str, Any]:
        """
        Return training config optimized for current regime.

        Each regime benefits from different training parameters.
        """
        configs = {
            "BULL": {
                "min_trades_to_retrain": 10,  # Aggressive: retrain often
                "momentum_weight": 0.8,  # Boost momentum strategies
                "mean_reversion_weight": 0.3,
                "learning_rate": 0.05,
                "epochs": 20,
            },
            "BEAR": {
                "min_trades_to_retrain": 15,
                "momentum_weight": 0.4,
                "mean_reversion_weight": 0.7,  # Boost mean-reversion
                "learning_rate": 0.03,  # Conservative
                "epochs": 15,
            },
            "VOLATILE": {
                "min_trades_to_retrain": 20,  # Be cautious
                "momentum_weight": 0.5,
                "mean_reversion_weight": 0.8,  # MR works in chop
                "learning_rate": 0.02,
                "epochs": 25,  # More training needed
            },
            "MEAN_REVERSION": {
                "min_trades_to_retrain": 8,
                "momentum_weight": 0.2,
                "mean_reversion_weight": 0.95,  # Lean hard into MR
                "learning_rate": 0.05,
                "epochs": 20,
            },
            "TREND": {
                "min_trades_to_retrain": 12,
                "momentum_weight": 0.9,  # Strong momentum
                "mean_reversion_weight": 0.1,
                "learning_rate": 0.05,
                "epochs": 18,
            },
        }

        return configs.get(regime, configs["TREND"])  # Default to TREND

    def _classify_volatility(self, volatility: float) -> str:
        """Classify volatility level."""
        if volatility < 0.01:
            return "LOW"
        elif volatility < 0.03:
            return "NORMAL"
        else:
            return "HIGH"

    def _is_mean_reverting(self, returns: np.ndarray) -> bool:
        """Detect if price action is oscillating (mean-reverting)."""
        if len(returns) < 3:
            return False

        # Count sign changes (oscillations)
        sign_changes = np.sum(np.diff(np.sign(returns)) != 0)
        oscillation_ratio = sign_changes / len(returns)

        # If >40% of moves change direction, it's oscillating
        return oscillation_ratio > 0.4

    def get_regime_stats(self) -> Dict[str, Any]:
        """Get regime classification statistics."""
        if not self.regime_history:
            return {"current_regime": "UNKNOWN", "regime_changes": 0}

        regimes = [h["regime"] for h in self.regime_history]
        regime_counts = {}
        for r in regimes:
            regime_counts[r] = regime_counts.get(r, 0) + 1

        # Count transitions
        transitions = sum(
            1 for i in range(1, len(regimes)) if regimes[i] != regimes[i - 1]
        )

        return {
            "current_regime": self.current_regime or "UNKNOWN",
            "regime_history_length": len(self.regime_history),
            "regime_distribution": regime_counts,
            "regime_transitions": transitions,
            "most_recent_regimes": [
                h["regime"] for h in list(self.regime_history)[-5:]
            ],
        }


# Global regime classifier
regime_classifier = RegimeClassifier()
