"""
Paper Trading Manager - Manage trade entry/exit and outcome logging.

Allows manual paper trading with automated tracking:
- Entry: Execute based on prediction signal
- Hold: Track for forward_days
- Exit: Close at specified date and log outcome
- Outcome: Calculate P&L and accuracy

Database: agent_training.sqlite3 (paper_trades table)
"""

import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, Optional, List

BASE_DIR = Path(__file__).resolve().parents[1]
AGENT_DB = BASE_DIR / "agent_training.sqlite3"


def init_paper_trading_db():
    """Initialize paper trading tables."""
    conn = sqlite3.connect(AGENT_DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS paper_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_id TEXT UNIQUE NOT NULL,
            strategy TEXT NOT NULL,
            ticker TEXT NOT NULL,
            side TEXT NOT NULL,
            entry_date TEXT NOT NULL,
            entry_price REAL NOT NULL,
            quantity INTEGER NOT NULL,
            exit_date TEXT,
            exit_price REAL,
            predicted_direction TEXT NOT NULL,
            actual_direction TEXT,
            forward_days INTEGER NOT NULL,
            predicted_return_pct REAL,
            actual_return_pct REAL,
            pnl REAL,
            pnl_pct REAL,
            status TEXT DEFAULT 'open',
            notes TEXT
        )
    """)
    conn.commit()
    conn.close()


# Forward days per strategy
FORWARD_DAYS = {
    "momentum": 5,
    "mean_reversion": 3,
    "breakout": 2,
    "trend_follow": 10,
    "short_momentum": 5,
    "short_breakdown": 2,
}


class PaperTrade:
    """Represents a single paper trade."""

    def __init__(
        self,
        strategy: str,
        ticker: str,
        entry_price: float,
        predicted_direction: str,
        quantity: int = 100,
        side: str = "long",
    ):
        self.trade_id = f"{strategy}-{ticker}-{datetime.now(timezone.utc).isoformat()[:19]}"
        self.strategy = strategy
        self.ticker = ticker
        self.entry_price = entry_price
        self.entry_date = datetime.now(timezone.utc).isoformat()
        self.quantity = quantity
        self.side = side
        self.predicted_direction = predicted_direction
        self.forward_days = FORWARD_DAYS.get(strategy, 5)

        self.exit_price: Optional[float] = None
        self.exit_date: Optional[str] = None
        self.actual_direction: Optional[str] = None
        self.pnl: Optional[float] = None
        self.pnl_pct: Optional[float] = None
        self.status = "open"

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "trade_id": self.trade_id,
            "strategy": self.strategy,
            "ticker": self.ticker,
            "side": self.side,
            "entry_date": self.entry_date,
            "entry_price": self.entry_price,
            "quantity": self.quantity,
            "exit_date": self.exit_date,
            "exit_price": self.exit_price,
            "predicted_direction": self.predicted_direction,
            "actual_direction": self.actual_direction,
            "forward_days": self.forward_days,
            "pnl": self.pnl,
            "pnl_pct": self.pnl_pct,
            "status": self.status,
        }

    def save_to_db(self):
        """Save trade to database."""
        conn = sqlite3.connect(AGENT_DB)
        conn.execute(
            """
            INSERT OR REPLACE INTO paper_trades
            (trade_id, strategy, ticker, side, entry_date, entry_price, quantity,
             exit_date, exit_price, predicted_direction, actual_direction,
             forward_days, pnl, pnl_pct, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                self.trade_id,
                self.strategy,
                self.ticker,
                self.side,
                self.entry_date,
                self.entry_price,
                self.quantity,
                self.exit_date,
                self.exit_price,
                self.predicted_direction,
                self.actual_direction,
                self.forward_days,
                self.pnl,
                self.pnl_pct,
                self.status,
            ),
        )
        conn.commit()
        conn.close()


class PaperTradingManager:
    """Manages paper trades."""

    def __init__(self):
        init_paper_trading_db()

    def entry_trade(
        self,
        strategy: str,
        ticker: str,
        entry_price: float,
        predicted_direction: str,
        quantity: int = 100,
        side: str = "long",
    ) -> Dict[str, Any]:
        """Enter a paper trade."""
        trade = PaperTrade(
            strategy=strategy,
            ticker=ticker,
            entry_price=entry_price,
            predicted_direction=predicted_direction,
            quantity=quantity,
            side=side,
        )
        trade.save_to_db()

        return {
            "status": "trade_entered",
            "trade_id": trade.trade_id,
            "strategy": strategy,
            "ticker": ticker,
            "side": side,
            "entry_price": entry_price,
            "quantity": quantity,
            "predicted_direction": predicted_direction,
            "exit_date": (datetime.now(timezone.utc) + timedelta(days=trade.forward_days))
            .date()
            .isoformat(),
            "forward_days": trade.forward_days,
        }

    def exit_trade(
        self, trade_id: str, exit_price: float, actual_direction: str
    ) -> Dict[str, Any]:
        """Exit a paper trade and calculate P&L."""
        conn = sqlite3.connect(AGENT_DB)
        cursor = conn.execute(
            "SELECT * FROM paper_trades WHERE trade_id = ? AND status = 'open'",
            (trade_id,),
        )
        row = cursor.fetchone()
        conn.close()

        if not row:
            return {"error": f"Trade {trade_id} not found or already closed"}

        # Extract columns
        (
            db_id,
            db_trade_id,
            strategy,
            ticker,
            side,
            entry_date,
            entry_price,
            quantity,
            _,
            _,
            predicted_direction,
            _,
            forward_days,
            _,
            _,
            _,
            _,
            status,
            _,
        ) = row

        # Calculate P&L
        if side == "long":
            pnl = (exit_price - entry_price) * quantity
            pnl_pct = ((exit_price - entry_price) / entry_price) * 100
        else:  # short
            pnl = (entry_price - exit_price) * quantity
            pnl_pct = ((entry_price - exit_price) / entry_price) * 100

        # Determine if correct
        was_correct = (
            (predicted_direction == "up" and actual_direction == "up")
            or (predicted_direction == "down" and actual_direction == "down")
        )

        # Update database
        conn = sqlite3.connect(AGENT_DB)
        conn.execute(
            """
            UPDATE paper_trades
            SET exit_price = ?, exit_date = ?, actual_direction = ?,
                pnl = ?, pnl_pct = ?, status = 'closed'
            WHERE trade_id = ?
        """,
            (exit_price, datetime.now(timezone.utc).isoformat(), actual_direction, pnl, pnl_pct, trade_id),
        )
        conn.commit()
        conn.close()

        return {
            "status": "trade_closed",
            "trade_id": trade_id,
            "strategy": strategy,
            "ticker": ticker,
            "side": side,
            "entry_price": entry_price,
            "exit_price": exit_price,
            "quantity": quantity,
            "predicted_direction": predicted_direction,
            "actual_direction": actual_direction,
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl_pct, 2),
            "was_correct": was_correct,
        }

    def get_trade_status(self, trade_id: str) -> Optional[Dict[str, Any]]:
        """Get status of a specific trade."""
        conn = sqlite3.connect(AGENT_DB)
        cursor = conn.execute(
            "SELECT * FROM paper_trades WHERE trade_id = ?", (trade_id,)
        )
        row = cursor.fetchone()
        conn.close()

        if not row:
            return None

        return {
            "trade_id": row[1],
            "strategy": row[2],
            "ticker": row[3],
            "side": row[4],
            "entry_date": row[5],
            "entry_price": row[6],
            "quantity": row[7],
            "exit_date": row[8],
            "exit_price": row[9],
            "predicted_direction": row[10],
            "actual_direction": row[11],
            "forward_days": row[12],
            "pnl": row[13],
            "pnl_pct": row[14],
            "status": row[15],
        }

    def get_open_trades(self) -> List[Dict[str, Any]]:
        """Get all open trades."""
        conn = sqlite3.connect(AGENT_DB)
        cursor = conn.execute(
            """
            SELECT trade_id, strategy, ticker, side, entry_date, entry_price,
                   quantity, predicted_direction, forward_days, status
            FROM paper_trades
            WHERE status = 'open'
            ORDER BY entry_date DESC
        """
        )
        rows = cursor.fetchall()
        conn.close()

        trades = []
        for row in rows:
            entry_date = datetime.fromisoformat(row[4])
            forward_days = row[8]
            exit_date = entry_date + timedelta(days=forward_days)
            days_remaining = (exit_date - datetime.now(timezone.utc)).days

            trades.append(
                {
                    "trade_id": row[0],
                    "strategy": row[1],
                    "ticker": row[2],
                    "side": row[3],
                    "entry_date": row[4],
                    "entry_price": row[5],
                    "quantity": row[6],
                    "predicted_direction": row[7],
                    "exit_date": exit_date.date().isoformat(),
                    "days_remaining": days_remaining,
                    "status": row[9],
                }
            )
        return trades

    def get_closed_trades(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get closed trades."""
        conn = sqlite3.connect(AGENT_DB)
        cursor = conn.execute(
            """
            SELECT trade_id, strategy, ticker, side, entry_price, exit_price,
                   quantity, predicted_direction, actual_direction, pnl, pnl_pct, status
            FROM paper_trades
            WHERE status = 'closed'
            ORDER BY exit_date DESC
            LIMIT ?
        """,
            (limit,),
        )
        rows = cursor.fetchall()
        conn.close()

        return [
            {
                "trade_id": row[0],
                "strategy": row[1],
                "ticker": row[2],
                "side": row[3],
                "entry_price": row[4],
                "exit_price": row[5],
                "quantity": row[6],
                "predicted_direction": row[7],
                "actual_direction": row[8],
                "pnl": row[9],
                "pnl_pct": row[10],
                "status": row[11],
            }
            for row in rows
        ]

    def get_performance_stats(self) -> Dict[str, Any]:
        """Get overall performance stats."""
        conn = sqlite3.connect(AGENT_DB)

        # Closed trades
        cursor = conn.execute(
            """
            SELECT COUNT(*), SUM(pnl), AVG(pnl_pct)
            FROM paper_trades
            WHERE status = 'closed'
        """
        )
        closed = cursor.fetchone()

        # Win rate
        cursor = conn.execute(
            """
            SELECT COUNT(*)
            FROM paper_trades
            WHERE status = 'closed' AND pnl > 0
        """
        )
        winners = cursor.fetchone()[0]

        conn.close()

        total_trades = closed[0] or 0
        total_pnl = closed[1] or 0
        avg_pnl_pct = closed[2] or 0
        win_rate = (winners / total_trades * 100) if total_trades > 0 else 0

        return {
            "total_closed_trades": total_trades,
            "total_pnl": round(total_pnl, 2),
            "avg_pnl_pct": round(avg_pnl_pct, 2),
            "win_rate": round(win_rate, 1),
            "winners": winners,
            "losers": total_trades - winners,
        }


# Global instance
paper_trading_manager = PaperTradingManager()
