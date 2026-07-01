"""
Distributed Training — Train multiple strategies across workers simultaneously.
Non-blocking, parallel strategy training without waiting for sequential completion.
"""
import asyncio
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import numpy as np
from pathlib import Path


class DistributedTrainer:
    """Coordinate training across multiple CPU workers."""

    def __init__(self, max_workers: int = 4):
        self.max_workers = max_workers
        self.executor = ProcessPoolExecutor(max_workers=max_workers)
        self.thread_executor = ThreadPoolExecutor(max_workers=max_workers)
        self.training_jobs: Dict[str, Dict[str, Any]] = {}
        self.completed_jobs: List[Dict[str, Any]] = []

    async def train_strategies_distributed(
        self, strategies: List[str], training_func
    ) -> Dict[str, Any]:
        """
        Train multiple strategies in parallel using process pool.

        Non-blocking: returns immediately while training continues.
        """
        loop = asyncio.get_event_loop()
        jobs = {}

        # Submit all training jobs to executor
        for strategy in strategies:
            job_id = f"{strategy}_{datetime.now(timezone.utc).timestamp()}"

            self.training_jobs[job_id] = {
                "strategy": strategy,
                "status": "SUBMITTED",
                "submitted_at": datetime.now(timezone.utc).isoformat(),
                "completed_at": None,
                "result": None,
                "error": None,
            }

            # Submit to process pool (non-blocking)
            future = loop.run_in_executor(
                self.executor,
                training_func,
                strategy,
            )
            jobs[job_id] = future

        # Collect results as they complete (gather all in parallel)
        results = {}
        for job_id, future in jobs.items():
            try:
                result = await future
                strategy = self.training_jobs[job_id]["strategy"]
                self.training_jobs[job_id]["status"] = "COMPLETED"
                self.training_jobs[job_id]["completed_at"] = (
                    datetime.now(timezone.utc).isoformat()
                )
                self.training_jobs[job_id]["result"] = result
                results[strategy] = result
            except Exception as e:
                strategy = self.training_jobs[job_id]["strategy"]
                self.training_jobs[job_id]["status"] = "FAILED"
                self.training_jobs[job_id]["error"] = str(e)
                results[strategy] = {"error": str(e)}

        # Move completed jobs to history
        self.completed_jobs.extend([
            self.training_jobs.pop(jid) for jid in list(self.training_jobs.keys())
            if self.training_jobs[jid]["status"] in ["COMPLETED", "FAILED"]
        ])

        return {
            "distributed": True,
            "max_workers": self.max_workers,
            "strategies_trained": len(strategies),
            "completed": results,
        }

    def get_job_status(self, strategy: str) -> Optional[Dict[str, Any]]:
        """Get status of a specific training job."""
        for job_id, job in self.training_jobs.items():
            if job["strategy"] == strategy:
                return job

        # Check completed jobs
        for job in self.completed_jobs:
            if job["strategy"] == strategy:
                return job

        return None

    def get_all_jobs(self) -> Dict[str, Any]:
        """Get status of all training jobs."""
        return {
            "active_jobs": len(self.training_jobs),
            "completed_jobs": len(self.completed_jobs),
            "max_workers": self.max_workers,
            "active": list(self.training_jobs.values()),
            "completed": self.completed_jobs[-10:],  # Last 10 completed
        }

    def get_distributed_stats(self) -> Dict[str, Any]:
        """Get distributed training statistics."""
        total = len(self.training_jobs) + len(self.completed_jobs)
        successful = sum(
            1 for j in self.completed_jobs if j["status"] == "COMPLETED"
        )
        failed = sum(1 for j in self.completed_jobs if j["status"] == "FAILED")

        # Calculate average training time
        avg_time_sec = 0
        if self.completed_jobs:
            times = []
            for job in self.completed_jobs[-20:]:
                if job["submitted_at"] and job["completed_at"]:
                    from datetime import datetime
                    submitted = datetime.fromisoformat(job["submitted_at"])
                    completed = datetime.fromisoformat(job["completed_at"])
                    times.append((completed - submitted).total_seconds())

            if times:
                avg_time_sec = np.mean(times)

        return {
            "max_workers": self.max_workers,
            "active_jobs": len(self.training_jobs),
            "completed_jobs": len(self.completed_jobs),
            "successful": successful,
            "failed": failed,
            "total_trained": total,
            "avg_training_time_sec": round(avg_time_sec, 2),
            "parallelization_available": self.max_workers > 1,
        }

    async def train_with_timeout(
        self, strategy: str, training_func, timeout_sec: int = 300
    ) -> Dict[str, Any]:
        """Train single strategy with timeout."""
        try:
            loop = asyncio.get_event_loop()
            result = await asyncio.wait_for(
                loop.run_in_executor(self.executor, training_func, strategy),
                timeout=timeout_sec,
            )
            return {"success": True, "strategy": strategy, "result": result}
        except asyncio.TimeoutError:
            return {
                "success": False,
                "strategy": strategy,
                "error": f"Training timeout after {timeout_sec}s",
            }
        except Exception as e:
            return {"success": False, "strategy": strategy, "error": str(e)}

    def shutdown(self):
        """Gracefully shutdown executors."""
        self.executor.shutdown(wait=True)
        self.thread_executor.shutdown(wait=True)


# Global distributed trainer
distributed_trainer = DistributedTrainer(max_workers=4)
