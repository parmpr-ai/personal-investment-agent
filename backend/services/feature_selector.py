"""
Feature Selector — Track feature importance and auto-select best features.
Reduces dimensionality, speeds up training, improves interpretability.
"""
import numpy as np
from typing import Dict, Any, List, Optional, Set
from datetime import datetime, timezone
from collections import defaultdict


class FeatureSelector:
    """Track and optimize feature selection based on importance."""

    def __init__(self, feature_names: Optional[List[str]] = None):
        # Default 37 features from CLAUDE.md
        self.feature_names = (
            feature_names
            or [
                # Core 18
                "rsi",
                "rvol",
                "change_pct",
                "trend_5d",
                "above_sma20",
                "golden_cross",
                "above_sma50",
                "macd_line",
                "macd_signal",
                "macd_hist",
                "bb_upper",
                "bb_lower",
                "bb_position",
                "zscore",
                "atr_pct",
                "week52_high",
                "week52_low",
                "week52_pct",
                # Extended 19
                "rsi7",
                "roc_3d",
                "roc_10d",
                "roc_20d",
                "bb_width_pct",
                "sma20_slope",
                "rsi_delta",
                "macd_hist_norm",
                "macd_line_pct",
                "price_accel",
                "streak",
                "rvol_trend",
                "atr_expand",
                "vol_confirm",
                "rsi_extreme",
                "sma_gap",
                "win_rate_10d",
                "ret_mean_5d",
            ]
        )

        self.importance_scores: Dict[str, List[float]] = defaultdict(
            list
        )  # Track over time
        self.selection_history: List[Dict[str, Any]] = []
        self.selected_features: Set[str] = set(self.feature_names)
        self.current_threshold = 0.01  # Features below 1% importance dropped

    def record_importance(self, importances: Dict[str, float]):
        """Record feature importance from a model training run."""
        for feature, importance in importances.items():
            if feature in self.feature_names:
                self.importance_scores[feature].append(importance)

    def get_average_importance(self) -> Dict[str, float]:
        """Calculate average importance for each feature."""
        avg_importance = {}

        for feature in self.feature_names:
            scores = self.importance_scores[feature]
            if scores:
                avg_importance[feature] = float(np.mean(scores))
            else:
                avg_importance[feature] = 0.0

        return avg_importance

    def select_features(self, threshold: Optional[float] = None) -> List[str]:
        """
        Select features above importance threshold.

        threshold: Minimum importance score [0, 1]. Default: adaptive
        """
        if threshold is None:
            threshold = self.current_threshold

        avg_imp = self.get_average_importance()
        selected = [
            feature
            for feature, importance in avg_imp.items()
            if importance >= threshold
        ]

        # Always keep at least 10 features (don't over-prune)
        if len(selected) < 10:
            # Keep top 10
            sorted_features = sorted(avg_imp.items(), key=lambda x: x[1], reverse=True)
            selected = [f for f, _ in sorted_features[:10]]

        self.selected_features = set(selected)

        self.selection_history.append(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "threshold": threshold,
                "selected_count": len(selected),
                "total_features": len(self.feature_names),
                "reduction_pct": round((1 - len(selected) / len(self.feature_names)) * 100, 1),
                "selected_features": selected,
                "top_5": sorted(
                    avg_imp.items(), key=lambda x: x[1], reverse=True
                )[:5],
            }
        )

        return selected

    def get_feature_stats(self) -> Dict[str, Any]:
        """Get feature selection statistics."""
        avg_imp = self.get_average_importance()

        # Sort by importance
        sorted_features = sorted(avg_imp.items(), key=lambda x: x[1], reverse=True)

        top_features = sorted_features[:10]
        bottom_features = sorted_features[-10:]

        return {
            "total_features": len(self.feature_names),
            "selected_features": len(self.selected_features),
            "reduction_pct": round(
                (1 - len(self.selected_features) / len(self.feature_names)) * 100, 1
            ),
            "current_threshold": self.current_threshold,
            "top_10_features": [
                {"name": f, "avg_importance": round(imp, 4), "trend": self._get_trend(f)}
                for f, imp in top_features
            ],
            "bottom_10_features": [
                {"name": f, "avg_importance": round(imp, 4), "trend": self._get_trend(f)}
                for f, imp in bottom_features
            ],
            "adaptive_threshold_range": [round(self.current_threshold * 0.5, 4),
                                         round(self.current_threshold * 2.0, 4)],
        }

    def optimize_threshold(self) -> float:
        """
        Automatically optimize importance threshold based on distribution.

        Goal: Keep top 60% of features, drop bottom 40%.
        """
        avg_imp = self.get_average_importance()
        importances = sorted(
            [v for v in avg_imp.values() if v > 0], reverse=True
        )

        if not importances:
            return self.current_threshold

        # Get value at 60th percentile
        idx = int(len(importances) * 0.6)
        new_threshold = importances[idx] if idx < len(importances) else importances[-1]

        # Smooth transition
        self.current_threshold = 0.8 * self.current_threshold + 0.2 * new_threshold

        return round(self.current_threshold, 4)

    def _get_trend(self, feature: str) -> str:
        """Get trend of feature importance over time."""
        scores = self.importance_scores[feature]

        if len(scores) < 2:
            return "NEW"

        recent = scores[-5:]
        if not recent:
            return "UNKNOWN"

        recent_avg = np.mean(recent)
        old_avg = np.mean(scores[:-5]) if len(scores) > 5 else recent_avg

        if recent_avg > old_avg * 1.1:
            return "RISING"
        elif recent_avg < old_avg * 0.9:
            return "FALLING"
        else:
            return "STABLE"

    def get_selection_history(self, limit: int = 5) -> List[Dict[str, Any]]:
        """Get recent feature selection history."""
        return self.selection_history[-limit:]


# Global feature selector (37 features by default)
feature_selector = FeatureSelector()
