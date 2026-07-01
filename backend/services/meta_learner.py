"""
Meta-Learning — Automatically optimize hyperparameters per regime/strategy.
Learn best learning_rate, n_estimators, max_depth, etc. for current conditions.
"""
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
import numpy as np
import json
from pathlib import Path


class MetaLearner:
    """Learn optimal hyperparameters per regime and strategy."""

    def __init__(self):
        self.regime_configs: Dict[str, Dict[str, Dict[str, Any]]] = {}
        self.hyperparameter_history: List[Dict[str, Any]] = []
        self.optimal_params: Dict[str, Dict[str, Any]] = {}
        self.optimization_runs = 0

        # Default hyperparameter ranges for optimization
        self.param_ranges = {
            "learning_rate": [0.01, 0.02, 0.05, 0.1, 0.15],
            "n_estimators": [50, 100, 150, 200, 300],
            "max_depth": [2, 3, 4, 5, 6, 7, 8],
            "min_samples_leaf": [2, 5, 10, 15, 20],
            "max_leaf_nodes": [15, 31, 63, 127],
        }

    def get_optimal_params(
        self, strategy: str, regime: str
    ) -> Dict[str, Any]:
        """Get optimal hyperparameters for strategy in given regime."""
        key = f"{strategy}_{regime}"

        if key in self.optimal_params:
            return self.optimal_params[key]

        # Return regime-specific defaults if not optimized yet
        regime_defaults = {
            "BULL": {
                "learning_rate": 0.05,
                "n_estimators": 100,
                "max_depth": 3,
                "min_samples_leaf": 5,
            },
            "BEAR": {
                "learning_rate": 0.03,
                "n_estimators": 150,
                "max_depth": 4,
                "min_samples_leaf": 10,
            },
            "VOLATILE": {
                "learning_rate": 0.02,
                "n_estimators": 200,
                "max_depth": 3,
                "min_samples_leaf": 15,
            },
            "MEAN_REVERSION": {
                "learning_rate": 0.05,
                "n_estimators": 100,
                "max_depth": 4,
                "min_samples_leaf": 5,
            },
            "TREND": {
                "learning_rate": 0.05,
                "n_estimators": 120,
                "max_depth": 4,
                "min_samples_leaf": 8,
            },
        }

        return regime_defaults.get(regime, regime_defaults["TREND"])

    def suggest_params_simple(
        self, strategy: str, regime: str, trial_number: int = 0
    ) -> Dict[str, Any]:
        """
        Simple hyperparameter suggestion (without Optuna dependency).
        Uses trial_number to explore param space sequentially.
        """
        key = f"{strategy}_{regime}"

        # Get base params for this regime
        base_params = self.get_optimal_params(strategy, regime)

        # Modify based on trial number (simple exploration)
        variations = [
            {},  # Trial 0: use base
            {"learning_rate": base_params["learning_rate"] * 0.7},
            {"learning_rate": base_params["learning_rate"] * 1.4},
            {"n_estimators": int(base_params["n_estimators"] * 0.8)},
            {"n_estimators": int(base_params["n_estimators"] * 1.2)},
            {"max_depth": max(2, base_params["max_depth"] - 1)},
            {"max_depth": min(8, base_params["max_depth"] + 1)},
            {"min_samples_leaf": int(base_params["min_samples_leaf"] * 0.7)},
            {"min_samples_leaf": int(base_params["min_samples_leaf"] * 1.3)},
        ]

        # Select variation based on trial number
        variation = variations[trial_number % len(variations)]

        # Apply variation
        suggested = base_params.copy()
        suggested.update(variation)

        return suggested

    def report_trial_result(
        self,
        strategy: str,
        regime: str,
        trial_number: int,
        params: Dict[str, Any],
        score: float,  # Balanced accuracy or Sharpe ratio
    ):
        """Record hyperparameter trial result for learning."""
        key = f"{strategy}_{regime}"

        result = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "strategy": strategy,
            "regime": regime,
            "trial": trial_number,
            "params": params,
            "score": score,
        }

        self.hyperparameter_history.append(result)
        self.optimization_runs += 1

        # Update optimal params if this trial is best
        if key not in self.optimal_params or score > self.optimal_params[key].get(
            "best_score", 0
        ):
            self.optimal_params[key] = {**params, "best_score": score, "trial": trial_number}

    def get_meta_learning_stats(self) -> Dict[str, Any]:
        """Get meta-learning optimization statistics."""
        if not self.hyperparameter_history:
            return {
                "total_trials": 0,
                "strategies_optimized": 0,
                "regimes_optimized": 0,
                "optimization_runs": self.optimization_runs,
            }

        # Group by strategy/regime
        by_key = {}
        for record in self.hyperparameter_history:
            key = f"{record['strategy']}_{record['regime']}"
            if key not in by_key:
                by_key[key] = []
            by_key[key].append(record)

        # Calculate statistics
        strategies = set(r["strategy"] for r in self.hyperparameter_history)
        regimes = set(r["regime"] for r in self.hyperparameter_history)

        best_trials = []
        for key, trials in by_key.items():
            best = max(trials, key=lambda t: t["score"])
            best_trials.append({
                "key": key,
                "best_score": best["score"],
                "best_trial": best["trial"],
                "trials_run": len(trials),
            })

        return {
            "total_trials": len(self.hyperparameter_history),
            "strategies_optimized": len(strategies),
            "regimes_optimized": len(regimes),
            "optimization_runs": self.optimization_runs,
            "combinations_explored": len(by_key),
            "best_trials": best_trials[-5:],  # Last 5 best
            "avg_improvement": self._calc_avg_improvement(),
        }

    def _calc_avg_improvement(self) -> float:
        """Calculate average score improvement over trials."""
        if len(self.hyperparameter_history) < 2:
            return 0.0

        by_key = {}
        for record in self.hyperparameter_history:
            key = f"{record['strategy']}_{record['regime']}"
            if key not in by_key:
                by_key[key] = []
            by_key[key].append(record["score"])

        improvements = []
        for key, scores in by_key.items():
            if len(scores) > 1:
                improvement = (scores[-1] - scores[0]) / max(abs(scores[0]), 0.001)
                improvements.append(improvement)

        return float(np.mean(improvements)) if improvements else 0.0

    def get_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get recent hyperparameter trials."""
        return self.hyperparameter_history[-limit:]

    def get_recommended_config(
        self, strategy: str, regime: str, confidence_threshold: float = 0.80
    ) -> Dict[str, Any]:
        """
        Get recommended training config for strategy in regime.
        Includes both regime base config and optimized hyperparams.
        """
        # Get optimized hyperparams
        key = f"{strategy}_{regime}"
        opt_params = self.optimal_params.get(key, {})

        # Get base params for this regime
        base_params = self.get_optimal_params(strategy, regime)

        # Blend optimized + base
        recommended = base_params.copy()
        if opt_params:
            recommended.update({
                k: v for k, v in opt_params.items()
                if k != "best_score" and k != "trial"
            })

        return {
            "strategy": strategy,
            "regime": regime,
            "hyperparameters": recommended,
            "source": "optimized" if opt_params else "regime_default",
            "confidence": confidence_threshold,
        }

    def save_learned_config(self, save_path: Optional[Path] = None):
        """Save learned optimal configs to disk."""
        if save_path is None:
            save_path = (
                Path(__file__).resolve().parents[1]
                / "ml_models"
                / "meta_learned_config.json"
            )

        save_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "optimal_params": self.optimal_params,
            "optimization_runs": self.optimization_runs,
            "total_trials": len(self.hyperparameter_history),
        }

        try:
            with open(save_path, "w") as f:
                json.dump(save_data, f, indent=2)
            return {"success": True, "path": str(save_path)}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def load_learned_config(self, load_path: Optional[Path] = None):
        """Load previously learned optimal configs."""
        if load_path is None:
            load_path = (
                Path(__file__).resolve().parents[1]
                / "ml_models"
                / "meta_learned_config.json"
            )

        try:
            with open(load_path, "r") as f:
                data = json.load(f)
            self.optimal_params = data.get("optimal_params", {})
            self.optimization_runs = data.get("optimization_runs", 0)
            return {"success": True, "configs_loaded": len(self.optimal_params)}
        except Exception as e:
            return {"success": False, "error": str(e)}


# Global meta-learner instance
meta_learner = MetaLearner()
