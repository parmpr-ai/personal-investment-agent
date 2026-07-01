"""
Real-time monitoring dashboard for autonomous executor v2.
Tracks performance metrics, position distribution, and trade flow.
"""
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, List
from .autonomous_trades import get_open_trades, get_closed_trades, get_performance


class ExecutorMonitor:
    """Monitor autonomous executor performance in real-time."""

    def __init__(self):
        self.start_time = datetime.now(timezone.utc)
        self.trade_log: List[Dict[str, Any]] = []
        self.cycle_count = 0
        self.last_stats = {}

    def get_summary(self) -> Dict[str, Any]:
        """Get comprehensive executor summary."""
        perf = get_performance()
        open_data = get_open_trades()
        open_trades = open_data.get("open_trades", [])

        # Categorize by tier
        day_open = [t for t in open_trades if t.get("forward_days", 0) <= 3]
        swing_open = [t for t in open_trades if 4 <= t.get("forward_days", 0) <= 14]
        long_open = [t for t in open_trades if t.get("forward_days", 0) >= 20]

        # By strategy
        by_strategy = {}
        for trade in open_trades:
            strat = trade.get("strategy", "unknown")
            if strat not in by_strategy:
                by_strategy[strat] = {"count": 0, "tickers": []}
            by_strategy[strat]["count"] += 1
            by_strategy[strat]["tickers"].append(trade.get("ticker"))

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "uptime": f"{(datetime.now(timezone.utc) - self.start_time).total_seconds():.0f}s",
            "cycles": self.cycle_count,
            "performance": {
                "total_pnl": perf.get("total_pnl", 0),
                "total_trades": perf.get("total_trades", 0),
                "winning_trades": perf.get("winning_trades", 0),
                "win_rate_pct": perf.get("win_rate_pct", 0),
            },
            "positions": {
                "total_open": len(open_trades),
                "day_trades": len(day_open),
                "swing_trades": len(swing_open),
                "long_trades": len(long_open),
            },
            "by_strategy": by_strategy,
            "tier_stats": perf.get("tier_stats", {}),
        }

    def get_dashboard_text(self) -> str:
        """Format summary as text dashboard."""
        data = self.get_summary()
        perf = data["performance"]
        pos = data["positions"]
        tiers = data["tier_stats"]

        lines = [
            "",
            "╔════════════════════════════════════════════════════════════════╗",
            "║         AUTONOMOUS EXECUTOR v2 — REAL-TIME DASHBOARD           ║",
            "╚════════════════════════════════════════════════════════════════╝",
            "",
            f"⏱️  Uptime: {data['uptime']} | 🔄 Cycles: {data['cycles']}",
            f"📊 Timestamp: {data['timestamp']}",
            "",
            "─ PERFORMANCE ─",
            f"  💰 Total P&L: ${perf['total_pnl']:,.2f}",
            f"  🎯 Win Rate: {perf['win_rate_pct']:.1f}% ({perf['winning_trades']}/{perf['total_trades']} trades)",
            "",
            "─ POSITIONS ─",
            f"  📈 Total Open: {pos['total_open']}",
            f"  ⚡ Day Trades: {pos['day_trades']}",
            f"  📊 Swing Trades: {pos['swing_trades']}",
            f"  📈 Long Trades: {pos['long_trades']}",
            "",
            "─ TIER STATS ─",
        ]

        for tier_name in ["day", "swing", "long"]:
            tier = tiers.get(tier_name, {})
            if tier.get("trades", 0) > 0:
                emoji = {"day": "⚡", "swing": "📊", "long": "📈"}.get(tier_name, "")
                lines.append(
                    f"  {emoji} {tier_name.upper():6} | "
                    f"${tier.get('pnl', 0):>8,.0f} P&L | "
                    f"{tier.get('wins', 0)}/{tier.get('trades', 0)} wins"
                )

        lines.extend(["", "─ BY STRATEGY ─"])
        for strat, data_strat in sorted(data["by_strategy"].items()):
            lines.append(f"  {strat:25} | {data_strat['count']:2d}x | {', '.join(data_strat['tickers'][:3])}")

        lines.append("")
        return "\n".join(lines)

    def print_dashboard(self):
        """Print formatted dashboard to stdout."""
        print(self.get_dashboard_text())


# Global monitor instance
executor_monitor = ExecutorMonitor()
