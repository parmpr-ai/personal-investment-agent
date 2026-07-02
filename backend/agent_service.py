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

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from services.agent_training_service import training_service
from services.agent_live_trading import live_trading_engine
from services.paper_trading_manager import paper_trading_manager

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
    started_at: str | None = None
    completed_at: str | None = None
    error: str | None = None
    result: dict | None = None


class PredictionRequest(BaseModel):
    """Request for live prediction."""

    strategy: str
    ticker: str


class PredictionResponse(BaseModel):
    """Live prediction response."""

    ticker: str
    strategy: str
    direction: str  # "up" or "down"
    probability: float  # 0-1
    confidence: int  # -100 to +100
    timestamp: str
    model_version: str
    error: str | None = None


class DecisionOutcomeRequest(BaseModel):
    """Update decision with actual outcome."""

    decision_id: int
    actual_direction: str
    actual_return: float
    profit_loss: float


class IncrementalRetrainRequest(BaseModel):
    """Request incremental retrain."""

    tickers: list[str] | None = None
    days: int = 100


class TradeEntryRequest(BaseModel):
    """Enter a paper trade based on prediction."""

    strategy: str
    ticker: str
    entry_price: float
    predicted_direction: str
    quantity: int = 100
    side: str = "long"


class TradeExitRequest(BaseModel):
    """Exit a paper trade and log outcome."""

    trade_id: str
    exit_price: float
    actual_direction: str


# ─── FastAPI App Setup ────────────────────────────────────────────────────────


scheduler = BackgroundScheduler()


async def market_close_retrain():
    """Market-close full retrain (4pm daily)."""
    try:
        print("[Scheduler] Starting market-close full retrain...")
        result = await live_trading_engine.full_retrain_market_close()
        print(f"[Scheduler] Market-close retrain complete: {result['duration_seconds']}s")
    except Exception as e:
        print(f"[Scheduler] Market-close retrain failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan: startup and shutdown."""
    print(f"🤖 Agent Service starting on {AGENT_HOST}:{AGENT_PORT}...")

    # Start scheduler for market-close retraining (4pm daily)
    scheduler.add_job(
        market_close_retrain,
        "cron",
        hour=16,
        minute=0,
        id="market_close_retrain",
        name="Market Close Retrain (4pm)",
    )
    scheduler.start()
    print("📅 Scheduler started: Market-close retrain at 4pm daily")

    yield

    # Shutdown
    scheduler.shutdown()
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


# ─── Live Trading Endpoints ──────────────────────────────────────────────────


@app.post("/predict", response_model=PredictionResponse)
async def make_prediction(request: PredictionRequest):
    """
    Get next move prediction for a strategy+ticker combination.

    Returns immediately with confidence, probability, direction.

    **Example:**
    ```bash
    curl -X POST http://localhost:8001/predict \
      -H "Content-Type: application/json" \
      -d '{"strategy": "momentum", "ticker": "NVDA"}'
    ```

    **Response:**
    ```json
    {
      "ticker": "NVDA",
      "strategy": "momentum",
      "direction": "up",
      "probability": 0.78,
      "confidence": 56,
      "timestamp": "2024-01-15T10:30:00Z",
      "model_version": "2024-01-15T10:00:00Z"
    }
    ```
    """
    result = await live_trading_engine.predict_next_move(
        request.strategy, request.ticker
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return PredictionResponse(**result)


@app.post("/retrain-incremental", response_model=dict)
async def trigger_incremental_retrain(request: IncrementalRetrainRequest):
    """
    Trigger incremental retrain (warm-start with recent data only).

    Much faster than full retrain (~10-20s vs ~60s).
    Used when enough trades have accumulated (default 50).

    **Example:**
    ```bash
    curl -X POST http://localhost:8001/retrain-incremental \
      -H "Content-Type: application/json" \
      -d '{"tickers": ["NVDA", "MSFT"], "days": 100}'
    ```

    **Response:**
    ```json
    {
      "status": "incremental_retrain_complete",
      "duration_seconds": 15.3,
      "decisions_processed": 50
    }
    ```
    """
    result = await live_trading_engine.incremental_retrain(
        tickers=request.tickers, days=request.days
    )
    return result


@app.get("/decisions/stats")
async def get_decision_stats(strategy: str | None = None, hours: int = 24):
    """
    Get accuracy stats for trading decisions in the last N hours.

    **Example:**
    ```bash
    curl "http://localhost:8001/decisions/stats?strategy=momentum&hours=24"
    ```

    **Response:**
    ```json
    {
      "momentum": {
        "total_decisions": 50,
        "correct": 42,
        "accuracy": 0.84,
        "avg_pnl": 150.50,
        "total_pnl": 7525.00
      }
    }
    ```
    """
    stats = live_trading_engine.get_decision_stats(strategy=strategy, hours=hours)
    return stats


@app.post("/decisions/{decision_id}/outcome")
async def log_decision_outcome(decision_id: int, request: DecisionOutcomeRequest):
    """
    Update a decision with actual trade outcome.

    Called after trade completion with real P&L.

    **Example:**
    ```bash
    curl -X POST http://localhost:8001/decisions/123/outcome \
      -H "Content-Type: application/json" \
      -d '{
        "actual_direction": "up",
        "actual_return": 2.5,
        "profit_loss": 250.00
      }'
    ```
    """
    success = await live_trading_engine.update_decision_outcome(
        decision_id=request.decision_id,
        actual_direction=request.actual_direction,
        actual_return=request.actual_return,
        profit_loss=request.profit_loss,
    )

    if not success:
        raise HTTPException(status_code=400, detail="Failed to update decision")

    return {"success": True, "decision_id": decision_id}


# ─── Paper Trading Endpoints ─────────────────────────────────────────────────


@app.post("/trades/entry", response_model=dict)
async def entry_trade(request: TradeEntryRequest):
    """
    Enter a paper trade based on prediction signal.

    Returns trade_id for tracking and future exit.

    **Example:**
    ```bash
    curl -X POST http://localhost:8001/trades/entry \
      -H "Content-Type: application/json" \
      -d '{
        "strategy": "momentum",
        "ticker": "NVDA",
        "entry_price": 125.50,
        "predicted_direction": "up",
        "quantity": 100,
        "side": "long"
      }'
    ```

    **Response:**
    ```json
    {
      "status": "trade_entered",
      "trade_id": "momentum-NVDA-2024-01-15T10:30:00",
      "strategy": "momentum",
      "ticker": "NVDA",
      "entry_price": 125.50,
      "quantity": 100,
      "predicted_direction": "up",
      "exit_date": "2024-01-20",
      "forward_days": 5
    }
    ```
    """
    result = paper_trading_manager.entry_trade(
        strategy=request.strategy,
        ticker=request.ticker,
        entry_price=request.entry_price,
        predicted_direction=request.predicted_direction,
        quantity=request.quantity,
        side=request.side,
    )
    return result


@app.post("/trades/{trade_id}/exit", response_model=dict)
async def exit_trade(trade_id: str, request: TradeExitRequest):
    """
    Exit a paper trade and log outcome (P&L, accuracy).

    Call when trade reaches forward_days or you want to close manually.

    **Example:**
    ```bash
    curl -X POST http://localhost:8001/trades/momentum-NVDA-2024-01-15T10:30:00/exit \
      -H "Content-Type: application/json" \
      -d '{
        "exit_price": 128.75,
        "actual_direction": "up"
      }'
    ```

    **Response:**
    ```json
    {
      "status": "trade_closed",
      "trade_id": "momentum-NVDA-2024-01-15T10:30:00",
      "strategy": "momentum",
      "ticker": "NVDA",
      "entry_price": 125.50,
      "exit_price": 128.75,
      "quantity": 100,
      "pnl": 325.00,
      "pnl_pct": 2.59,
      "was_correct": true
    }
    ```
    """
    result = paper_trading_manager.exit_trade(
        trade_id=trade_id,
        exit_price=request.exit_price,
        actual_direction=request.actual_direction,
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


@app.get("/trades/open")
async def get_open_trades():
    """
    List all open trades (awaiting exit).

    Shows remaining days until auto-close date.

    **Example:**
    ```bash
    curl http://localhost:8001/trades/open
    ```

    **Response:**
    ```json
    {
      "open_trades": [
        {
          "trade_id": "momentum-NVDA-2024-01-15T10:30:00",
          "strategy": "momentum",
          "ticker": "NVDA",
          "entry_price": 125.50,
          "quantity": 100,
          "exit_date": "2024-01-20",
          "days_remaining": 5,
          "status": "open"
        }
      ],
      "count": 1
    }
    ```
    """
    trades = paper_trading_manager.get_open_trades()
    return {"open_trades": trades, "count": len(trades)}


@app.get("/trades/closed")
async def get_closed_trades(limit: int = 20):
    """
    List recent closed trades with P&L results.

    **Example:**
    ```bash
    curl "http://localhost:8001/trades/closed?limit=10"
    ```
    """
    trades = paper_trading_manager.get_closed_trades(limit=limit)
    return {"closed_trades": trades, "count": len(trades)}


@app.get("/trades/performance")
async def get_trading_performance():
    """
    Get overall paper trading performance stats.

    **Example:**
    ```bash
    curl http://localhost:8001/trades/performance
    ```

    **Response:**
    ```json
    {
      "total_closed_trades": 42,
      "total_pnl": 5250.00,
      "avg_pnl_pct": 3.2,
      "win_rate": 71.4,
      "winners": 30,
      "losers": 12
    }
    ```
    """
    stats = paper_trading_manager.get_performance_stats()
    return stats


@app.get("/trades/{trade_id}")
async def get_trade_status(trade_id: str):
    """Get detailed status of a specific trade."""
    trade = paper_trading_manager.get_trade_status(trade_id)

    if not trade:
        raise HTTPException(status_code=404, detail=f"Trade {trade_id} not found")

    return trade


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
