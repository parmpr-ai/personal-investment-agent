"""
Autonomous Agent Training Service

Independent training service that runs as a separate process.
Handles model training, backtesting, and decision logging without
being affected by main PIA restarts.

Runs on: localhost:8001
"""

import asyncio
import json
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from .ml_scorer import train_all_models
from .backtester import run_backtest

BASE_DIR = Path(__file__).resolve().parents[1]
AGENT_DB = BASE_DIR / "agent_training.sqlite3"


def init_training_db():
    """Initialize training metadata database."""
    conn = sqlite3.connect(AGENT_DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS training_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            status TEXT NOT NULL,
            tickers TEXT,
            strategies TEXT,
            accuracy_avg REAL,
            duration_seconds REAL,
            models_saved INTEGER,
            error_msg TEXT,
            UNIQUE(ts)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS backtest_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            strategy TEXT NOT NULL,
            ticker TEXT NOT NULL,
            sharpe REAL,
            max_dd REAL,
            win_rate REAL,
            total_return REAL,
            results_json TEXT,
            UNIQUE(ts, strategy, ticker)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS training_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL,
            started_at TEXT,
            completed_at TEXT,
            status TEXT NOT NULL,
            progress_pct INTEGER DEFAULT 0,
            current_step TEXT,
            error TEXT,
            result_json TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS trading_decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            strategy TEXT NOT NULL,
            ticker TEXT NOT NULL,
            predicted_direction TEXT,
            predicted_prob REAL,
            actual_direction TEXT,
            actual_return REAL,
            profit_loss REAL,
            was_correct INTEGER,
            model_version TEXT
        )
    """)
    conn.commit()
    conn.close()


class AgentTrainingJob:
    """Represents a single training job with progress tracking."""

    def __init__(
        self,
        job_id: str,
        tickers: list[str],
        use_cache: bool = True,
        refresh: bool = False,
        parallel: bool = True,
        incremental: bool = False,
        feature_selection: bool = False,
    ):
        self.job_id = job_id
        self.tickers = tickers
        self.use_cache = use_cache
        self.refresh = refresh
        self.parallel = parallel
        self.incremental = incremental
        self.feature_selection = feature_selection

        self.created_at = datetime.now(timezone.utc).isoformat()
        self.started_at: Optional[str] = None
        self.completed_at: Optional[str] = None
        self.status = "pending"  # pending, running, completed, failed
        self.progress_pct = 0
        self.current_step = "Initializing..."
        self.error: Optional[str] = None
        self.result: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "job_id": self.job_id,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "status": self.status,
            "progress_pct": self.progress_pct,
            "current_step": self.current_step,
            "error": self.error,
            "result": self.result,
        }

    async def run(self) -> Dict[str, Any]:
        """Execute the training job."""
        self.status = "running"
        self.started_at = datetime.now(timezone.utc).isoformat()
        start_time = time.time()

        try:
            self.current_step = f"Training on {len(self.tickers)} tickers..."
            self.progress_pct = 10

            # Run training
            result = await train_all_models(
                tickers=self.tickers,
                days=504,
                use_cache=self.use_cache,
                refresh=self.refresh,
                parallel=self.parallel,
                incremental=self.incremental,
                feature_selection=self.feature_selection,
            )

            self.progress_pct = 80
            self.current_step = "Running backtest validation..."

            # Run backtest for validation
            backtest_result = await run_backtest(
                tickers=self.tickers, days=504
            )

            self.progress_pct = 95
            self.current_step = "Saving results..."

            self.result = {
                "training": result,
                "backtest": backtest_result,
                "duration_seconds": time.time() - start_time,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }

            self.status = "completed"
            self.completed_at = datetime.now(timezone.utc).isoformat()
            self.progress_pct = 100
            self.current_step = "Training complete ✅"

            return self.to_dict()

        except Exception as e:
            self.status = "failed"
            self.error = str(e)
            self.completed_at = datetime.now(timezone.utc).isoformat()
            self.progress_pct = 0
            self.current_step = f"Error: {str(e)}"
            return self.to_dict()

    def save_to_db(self):
        """Persist training job to database."""
        conn = sqlite3.connect(AGENT_DB)
        conn.execute(
            """
            INSERT OR REPLACE INTO training_jobs
            (job_id, created_at, started_at, completed_at, status, progress_pct, current_step, error, result_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                self.job_id,
                self.created_at,
                self.started_at,
                self.completed_at,
                self.status,
                self.progress_pct,
                self.current_step,
                self.error,
                json.dumps(self.result) if self.result else None,
            ),
        )
        conn.commit()
        conn.close()


class AgentTrainingService:
    """Orchestrates autonomous agent training and backtesting."""

    def __init__(self):
        self.active_jobs: Dict[str, AgentTrainingJob] = {}
        init_training_db()

    async def start_training(
        self,
        job_id: str,
        tickers: list[str],
        use_cache: bool = True,
        refresh: bool = False,
        parallel: bool = True,
        incremental: bool = False,
        feature_selection: bool = False,
    ) -> Dict[str, Any]:
        """Start a new training job (non-blocking)."""

        job = AgentTrainingJob(
            job_id=job_id,
            tickers=tickers,
            use_cache=use_cache,
            refresh=refresh,
            parallel=parallel,
            incremental=incremental,
            feature_selection=feature_selection,
        )

        self.active_jobs[job_id] = job
        job.save_to_db()

        # Run training in background
        asyncio.create_task(self._run_and_save(job))

        return job.to_dict()

    async def _run_and_save(self, job: AgentTrainingJob):
        """Run training and save results."""
        await job.run()
        job.save_to_db()

    def get_job_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get current status of a training job."""
        if job_id in self.active_jobs:
            return self.active_jobs[job_id].to_dict()

        # Check database for completed jobs
        conn = sqlite3.connect(AGENT_DB)
        cursor = conn.execute(
            "SELECT * FROM training_jobs WHERE job_id = ?", (job_id,)
        )
        row = cursor.fetchone()
        conn.close()

        if row:
            return {
                "job_id": row[1],
                "created_at": row[2],
                "started_at": row[3],
                "completed_at": row[4],
                "status": row[5],
                "progress_pct": row[6],
                "current_step": row[7],
                "error": row[8],
                "result": json.loads(row[9]) if row[9] else None,
            }

        return None

    def list_recent_jobs(self, limit: int = 10) -> list[Dict[str, Any]]:
        """List recent training jobs."""
        conn = sqlite3.connect(AGENT_DB)
        cursor = conn.execute(
            """
            SELECT job_id, created_at, started_at, completed_at, status, progress_pct, current_step, error
            FROM training_jobs
            ORDER BY created_at DESC
            LIMIT ?
        """,
            (limit,),
        )
        jobs = [
            {
                "job_id": row[0],
                "created_at": row[1],
                "started_at": row[2],
                "completed_at": row[3],
                "status": row[4],
                "progress_pct": row[5],
                "current_step": row[6],
                "error": row[7],
            }
            for row in cursor.fetchall()
        ]
        conn.close()
        return jobs

    def get_latest_training_status(self) -> Optional[Dict[str, Any]]:
        """Get status of the most recent training job."""
        conn = sqlite3.connect(AGENT_DB)
        cursor = conn.execute(
            """
            SELECT job_id, created_at, started_at, completed_at, status, progress_pct, current_step, error
            FROM training_jobs
            ORDER BY created_at DESC
            LIMIT 1
        """
        )
        row = cursor.fetchone()
        conn.close()

        if row:
            return {
                "job_id": row[0],
                "created_at": row[1],
                "started_at": row[2],
                "completed_at": row[3],
                "status": row[4],
                "progress_pct": row[5],
                "current_step": row[6],
                "error": row[7],
            }

        return None


# Global service instance
training_service = AgentTrainingService()
