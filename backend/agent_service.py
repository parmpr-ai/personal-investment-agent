#!/usr/bin/env python3
"""
Autonomous Agent Service - Independent FastAPI Application

This service runs separately from the main PIA application and handles:
- Model training (asynchronous, non-blocking)
- Backtesting and validation
- Training status monitoring
- Model persistence and versioning

To run:
    python backend/agent_service.py

Or with uvicorn:
    uvicorn backend.agent_service:app --port 8001 --reload

Environment:
    AGENT_SERVICE_PORT=8001 (default)
    AGENT_SERVICE_HOST=0.0.0.0 (default)
    LOG_LEVEL=info (default)
"""

import asyncio
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from services.agent_training_service import training_service

load_dotenv()

# Configuration
AGENT_PORT = int(os.getenv("AGENT_SERVICE_PORT", "8001"))
AGENT_HOST = os.getenv("AGENT_SERVICE_HOST", "0.0.0.0")
LOG_LEVEL = os.getenv("LOG_LEVEL", "info")


# ─── Request/Response Models ──────────────────────────────────────────────────


class TrainingRequest(BaseModel):
    """Request to start a new training job."""

    tickers: list[str] = None
    use_cache: bool = True
    refresh: bool = False
    parallel: bool = True
    incremental: bool = False
    feature_selection: bool = False

    class Config:
        json_schema_extra = {
            "example": {
                "tickers": ["NVDA", "MSFT", "AAPL", "TSLA", "AMD"],
                "use_cache": True,
                "refresh": False,
                "parallel": True,
                "incremental": False,
                "feature_selection": True,
            }
        }


class TrainingResponse(BaseModel):
    """Response from training endpoint."""

    job_id: str
    status: str
    progress_pct: int
    current_step: str
    created_at: str


class JobStatusResponse(BaseModel):
    """Response with job status details."""

    job_id: str
    status: str
    progress_pct: int
    current_step: str
    created_at: str
    started_at: str = None
    completed_at: str = None
    error: str = None
    result: dict = None


# ─── FastAPI App Setup ────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan: startup and shutdown."""
    print(f"🤖 Agent Service starting on {AGENT_HOST}:{AGENT_PORT}...")
    yield
    print("🤖 Agent Service shutting down...")


app = FastAPI(
    title="Autonomous Agent Service",
    description="Independent training service for autonomous trading agent",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Health Check ────────────────────────────────────────────────────────────


@app.get("/health")
def health():
    """Health check endpoint."""
    return {
        "ok": True,
        "service": "Autonomous Agent Service",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ─── Training Endpoints ───────────────────────────────────────────────────────


@app.post("/train", response_model=TrainingResponse)
async def start_training(request: TrainingRequest):
    """
    Start a new training job (non-blocking).

    Returns immediately with a job_id that can be used to check status.

    **Query Parameters:**
    - `tickers`: List of stock tickers (default: UNIVERSE from config)
    - `use_cache`: Load from cache if available (default: true)
    - `refresh`: Force fetch from Yahoo, ignore cache (default: false)
    - `parallel`: Train strategies in parallel (default: true)
    - `incremental`: Use warm-start from previous models (default: false)
    - `feature_selection`: Keep only top 20 features (default: false)

    **Example:**
    ```bash
    curl -X POST http://localhost:8001/train \
      -H "Content-Type: application/json" \
      -d '{
        "tickers": ["NVDA", "MSFT"],
        "use_cache": true,
        "parallel": true,
        "feature_selection": true
      }'
    ```

    **Response:**
    ```json
    {
      "job_id": "train-2024-01-15-abc123",
      "status": "running",
      "progress_pct": 10,
      "current_step": "Training on 5 tickers...",
      "created_at": "2024-01-15T10:30:00Z"
    }
    ```
    """
    job_id = f"train-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"

    result = await training_service.start_training(
        job_id=job_id,
        tickers=request.tickers,
        use_cache=request.use_cache,
        refresh=request.refresh,
        parallel=request.parallel,
        incremental=request.incremental,
        feature_selection=request.feature_selection,
    )

    return TrainingResponse(
        job_id=result["job_id"],
        status=result["status"],
        progress_pct=result["progress_pct"],
        current_step=result["current_step"],
        created_at=result["created_at"],
    )


@app.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """
    Get the status of a specific training job.

    **Example:**
    ```bash
    curl http://localhost:8001/jobs/train-20240115-100000-abc123
    ```

    **Response:**
    ```json
    {
      "job_id": "train-20240115-100000-abc123",
      "status": "running",
      "progress_pct": 45,
      "current_step": "Training strategy 3/6...",
      "created_at": "2024-01-15T10:00:00Z",
      "started_at": "2024-01-15T10:00:05Z",
      "completed_at": null,
      "error": null,
      "result": null
    }
    ```
    """
    status = training_service.get_job_status(job_id)

    if not status:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    return JobStatusResponse(**status)


@app.get("/jobs", response_model=dict)
async def list_jobs(limit: int = 10):
    """
    List recent training jobs.

    **Example:**
    ```bash
    curl "http://localhost:8001/jobs?limit=5"
    ```

    **Response:**
    ```json
    {
      "jobs": [
        {
          "job_id": "train-20240115-100000-abc123",
          "status": "completed",
          "progress_pct": 100,
          "current_step": "Training complete ✅",
          "created_at": "2024-01-15T10:00:00Z",
          "started_at": "2024-01-15T10:00:05Z",
          "completed_at": "2024-01-15T10:15:30Z",
          "error": null
        }
      ]
    }
    ```
    """
    jobs = training_service.list_recent_jobs(limit=limit)
    return {"jobs": jobs, "count": len(jobs)}


@app.get("/status")
async def get_latest_status():
    """
    Get status of the most recent training job.

    **Example:**
    ```bash
    curl http://localhost:8001/status
    ```

    **Response:**
    ```json
    {
      "job_id": "train-20240115-100000-abc123",
      "status": "completed",
      "progress_pct": 100,
      "current_step": "Training complete ✅",
      "created_at": "2024-01-15T10:00:00Z",
      "started_at": "2024-01-15T10:00:05Z",
      "completed_at": "2024-01-15T10:15:30Z",
      "error": null
    }
    ```
    """
    status = training_service.get_latest_training_status()

    if not status:
        return {
            "status": "idle",
            "message": "No training jobs yet",
            "current_step": "Ready for training",
            "progress_pct": 0,
        }

    return status


# ─── Main Entry Point ─────────────────────────────────────────────────────────


if __name__ == "__main__":
    import uvicorn

    print(f"Starting Autonomous Agent Service on {AGENT_HOST}:{AGENT_PORT}")
    print(f"📍 API docs available at: http://{AGENT_HOST}:{AGENT_PORT}/docs")
    print(f"📍 Health check: http://{AGENT_HOST}:{AGENT_PORT}/health")

    uvicorn.run(
        app,
        host=AGENT_HOST,
        port=AGENT_PORT,
        log_level=LOG_LEVEL,
    )
