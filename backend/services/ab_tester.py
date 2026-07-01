"""
A/B Testing — Compare multiple ensemble weight configurations in real trades.
Automatically promote best performer, abandon underperformer.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import numpy as np
from collections import deque


class ABTester:
    """Run A/B tests on ensemble configurations during live trading."""

    def __init__(self):
        self.test_configurations: Dict[str, Dict[str, Any]] = {}
        self.test_results: deque = deque(maxlen=1000)  # Last 1000 trades
        self.active_test: Optional[str] = None
        self.test_history: List[Dict[str, Any]] = []

    def create_test(
        self, test_name: str, config_a: Dict[str, float], config_b: Dict[str, float]
    ) -> Dict[str, Any]:
        """
        Create A/B test comparing two ensemble weight configs.

        config_a/b: Dict of learner_name → weight (must sum to 1.0)
        """
        # Validate weights
        for config in [config_a, config_b]:
            total_weight = sum(config.values())
            if not (0.99 < total_weight < 1.01):
                return {
                    "success": False,
                    "error": f"Weights sum to {total_weight}, must be 1.0",
                }

        test_id = f"{test_name}_{datetime.now(timezone.utc).timestamp()}"

        self.test_configurations[test_id] = {
            "test_name": test_name,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "config_a": config_a,
            "config_b": config_b,
            "trades_a": 0,
            "trades_b": 0,
            "pnl_a": 0.0,
            "pnl_b": 0.0,
            "win_rate_a": 0.0,
            "win_rate_b": 0.0,
            "status": "ACTIVE",
        }

        self.active_test = test_id

        return {
            "success": True,
            "test_id": test_id,
            "test_name": test_name,
            "message": f"A/B test started: comparing weights",
        }

    def record_trade_result(
        self, test_id: str, variant: str, pnl: float, was_correct: bool
    ):
        """Record trade result for A/B test variant (A or B)."""
        if test_id not in self.test_configurations:
            return False

        test = self.test_configurations[test_id]
        variant_key = f"trades_{variant}"
        pnl_key = f"pnl_{variant}"
        win_rate_key = f"win_rate_{variant}"

        test[variant_key] += 1
        test[pnl_key] += pnl

        # Calculate win rate
        if test[variant_key] > 0:
            wins = sum(
                1 for r in self.test_results
                if r["test_id"] == test_id
                and r["variant"] == variant
                and r["was_correct"]
            )
            test[win_rate_key] = wins / test[variant_key]

        # Record result
        self.test_results.append({
            "test_id": test_id,
            "variant": variant,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "pnl": pnl,
            "was_correct": was_correct,
        })

        return True

    def get_test_status(self, test_id: str) -> Optional[Dict[str, Any]]:
        """Get current status of A/B test."""
        if test_id not in self.test_configurations:
            return None

        test = self.test_configurations[test_id]

        # Calculate Sharpe-like metric (return per unit of variance)
        trades_a = test["trades_a"]
        trades_b = test["trades_b"]

        sharpe_a = 0.0
        sharpe_b = 0.0

        if trades_a > 5:
            results_a = [
                r for r in self.test_results
                if r["test_id"] == test_id and r["variant"] == "A"
            ]
            pnls_a = [r["pnl"] for r in results_a]
            if pnls_a:
                mean_a = np.mean(pnls_a)
                std_a = np.std(pnls_a) if len(pnls_a) > 1 else 1.0
                sharpe_a = mean_a / max(std_a, 0.001)

        if trades_b > 5:
            results_b = [
                r for r in self.test_results
                if r["test_id"] == test_id and r["variant"] == "B"
            ]
            pnls_b = [r["pnl"] for r in results_b]
            if pnls_b:
                mean_b = np.mean(pnls_b)
                std_b = np.std(pnls_b) if len(pnls_b) > 1 else 1.0
                sharpe_b = mean_b / max(std_b, 0.001)

        winner = None
        if sharpe_a > sharpe_b * 1.1:
            winner = "A"
        elif sharpe_b > sharpe_a * 1.1:
            winner = "B"

        return {
            "test_id": test_id,
            "test_name": test["test_name"],
            "created_at": test["created_at"],
            "status": test["status"],
            "config_a": test["config_a"],
            "config_b": test["config_b"],
            "trades_a": trades_a,
            "trades_b": trades_b,
            "pnl_a": test["pnl_a"],
            "pnl_b": test["pnl_b"],
            "win_rate_a": test["win_rate_a"],
            "win_rate_b": test["win_rate_b"],
            "sharpe_a": round(sharpe_a, 3),
            "sharpe_b": round(sharpe_b, 3),
            "winner": winner,
            "statistical_power": self._calc_statistical_power(trades_a, trades_b),
        }

    def declare_winner(self, test_id: str) -> Dict[str, Any]:
        """Declare winner of A/B test and record result."""
        status = self.get_test_status(test_id)
        if not status:
            return {"success": False, "error": "Test not found"}

        winner = status["winner"]
        if not winner:
            return {
                "success": False,
                "error": "No clear winner yet (need more trades)",
            }

        # Record to history
        result = {
            "test_id": test_id,
            "test_name": status["test_name"],
            "ended_at": datetime.now(timezone.utc).isoformat(),
            "winner": winner,
            "winner_config": status[f"config_{winner}"],
            "winner_sharpe": status[f"sharpe_{winner}"],
            "loser_sharpe": status[f"sharpe_{'B' if winner == 'A' else 'A'}"],
            "trades": status[f"trades_{winner}"],
        }

        self.test_history.append(result)

        # Update test status
        self.test_configurations[test_id]["status"] = "COMPLETED"
        self.test_configurations[test_id]["winner"] = winner

        return {"success": True, "winner": winner, "result": result}

    def get_active_tests(self) -> List[Dict[str, Any]]:
        """Get all active A/B tests."""
        active = []
        for test_id, test in self.test_configurations.items():
            if test["status"] == "ACTIVE":
                status = self.get_test_status(test_id)
                if status:
                    active.append(status)

        return active

    def get_test_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get completed A/B tests."""
        return self.test_history[-limit:]

    def get_ab_testing_stats(self) -> Dict[str, Any]:
        """Get A/B testing statistics."""
        active_count = sum(
            1 for t in self.test_configurations.values()
            if t["status"] == "ACTIVE"
        )
        completed_count = sum(
            1 for t in self.test_configurations.values()
            if t["status"] == "COMPLETED"
        )

        # Win/loss for promoted configs
        promoted_wins = 0
        promoted_losses = 0
        for result in self.test_history:
            if result["winner_sharpe"] > result["loser_sharpe"] * 1.05:
                promoted_wins += 1
            else:
                promoted_losses += 1

        return {
            "active_tests": active_count,
            "completed_tests": completed_count,
            "total_tests": len(self.test_configurations),
            "test_results": len(self.test_results),
            "promoted_wins": promoted_wins,
            "promoted_losses": promoted_losses,
            "promotion_success_rate": (
                promoted_wins / (promoted_wins + promoted_losses)
                if (promoted_wins + promoted_losses) > 0
                else 0.0
            ),
            "avg_trades_per_test": (
                np.mean([
                    max(t["trades_a"], t["trades_b"])
                    for t in self.test_configurations.values()
                ])
                if self.test_configurations
                else 0.0
            ),
        }

    def _calc_statistical_power(self, n_a: int, n_b: int) -> str:
        """Estimate statistical power of test."""
        min_trades = min(n_a, n_b)

        if min_trades < 5:
            return "LOW (< 5 trades)"
        elif min_trades < 20:
            return "MEDIUM (5-20 trades)"
        elif min_trades < 50:
            return "HIGH (20-50 trades)"
        else:
            return "VERY_HIGH (50+ trades)"

    def recommend_action(self, test_id: str) -> Dict[str, Any]:
        """Get action recommendation for A/B test."""
        status = self.get_test_status(test_id)
        if not status:
            return {"action": "CONTINUE", "reason": "Test not found"}

        power = status["statistical_power"]
        winner = status["winner"]

        if power == "LOW (< 5 trades)":
            return {
                "action": "CONTINUE",
                "reason": "Need more trades for statistical significance",
            }

        if winner:
            return {
                "action": "DECLARE_WINNER",
                "winner": winner,
                "reason": f"{winner} shows clear superiority",
            }

        return {
            "action": "CONTINUE",
            "reason": "No clear winner yet; accumulating more trades",
        }


# Global A/B tester instance
ab_tester = ABTester()
