"""
Client for communicating with the autonomous Agent Service.

Allows the main PIA app to delegate training to the independent agent service
without blocking or being affected by training duration/failures.
"""

import asyncio
import os
from typing import Any, Dict, Optional

import httpx

AGENT_SERVICE_URL = os.getenv("AGENT_SERVICE_URL", "http://localhost:8001")
AGENT_SERVICE_TIMEOUT = 30  # seconds for API calls (training itself runs async)


class AgentServiceClient:
    """HTTP client for Agent Service communication."""

    def __init__(self, base_url: str = AGENT_SERVICE_URL, timeout: int = AGENT_SERVICE_TIMEOUT):
        self.base_url = base_url
        self.timeout = timeout

    async def start_training(
        self,
        tickers: Optional[list[str]] = None,
        use_cache: bool = True,
        refresh: bool = False,
        parallel: bool = True,
        incremental: bool = False,
        feature_selection: bool = False,
    ) -> Dict[str, Any]:
        """
        Start a training job on the agent service.

        Returns immediately with job_id for status tracking.

        Args:
            tickers: List of stock tickers
            use_cache: Load from cache if available
            refresh: Force fetch from Yahoo
            parallel: Train strategies in parallel
            incremental: Use warm-start from previous models
            feature_selection: Keep only top 20 features

        Returns:
            Dict with job_id, status, progress_pct, current_step, created_at

        Raises:
            ConnectionError: If agent service is unavailable
            httpx.HTTPError: If the request fails
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/train",
                    json={
                        "tickers": tickers,
                        "use_cache": use_cache,
                        "refresh": refresh,
                        "parallel": parallel,
                        "incremental": incremental,
                        "feature_selection": feature_selection,
                    },
                )
                response.raise_for_status()
                return response.json()
        except httpx.ConnectError:
            raise ConnectionError(
                f"Could not connect to Agent Service at {self.base_url}. "
                f"Make sure it's running: python backend/agent_service.py"
            )
        except httpx.HTTPError as e:
            raise Exception(f"Agent Service error: {str(e)}")

    async def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """
        Get the status of a training job.

        Args:
            job_id: Training job ID returned from start_training()

        Returns:
            Dict with job details (status, progress, error, result, etc.)

        Raises:
            ConnectionError: If agent service is unavailable
            Exception: If job not found
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(f"{self.base_url}/jobs/{job_id}")
                if response.status_code == 404:
                    raise Exception(f"Job {job_id} not found")
                response.raise_for_status()
                return response.json()
        except httpx.ConnectError:
            raise ConnectionError(
                f"Could not connect to Agent Service at {self.base_url}. "
                f"Make sure it's running: python backend/agent_service.py"
            )

    async def list_jobs(self, limit: int = 10) -> Dict[str, Any]:
        """
        List recent training jobs.

        Args:
            limit: Maximum number of jobs to return

        Returns:
            Dict with jobs list and count
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(f"{self.base_url}/jobs", params={"limit": limit})
                response.raise_for_status()
                return response.json()
        except httpx.ConnectError:
            raise ConnectionError(
                f"Could not connect to Agent Service at {self.base_url}. "
                f"Make sure it's running: python backend/agent_service.py"
            )

    async def get_status(self) -> Dict[str, Any]:
        """
        Get status of the most recent training job.

        Returns:
            Dict with latest job status or idle message
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(f"{self.base_url}/status")
                response.raise_for_status()
                return response.json()
        except httpx.ConnectError:
            return {
                "status": "unavailable",
                "message": f"Agent Service not reachable at {self.base_url}",
                "current_step": "Waiting for service...",
                "progress_pct": 0,
            }

    async def health_check(self) -> bool:
        """
        Check if agent service is healthy.

        Returns:
            True if service is reachable and healthy, False otherwise
        """
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(f"{self.base_url}/health")
                return response.status_code == 200
        except Exception:
            return False


# Global client instance
agent_client = AgentServiceClient()
