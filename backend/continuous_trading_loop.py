#!/usr/bin/env python3
"""
Continuous Trading Loop
- 2 hours: Live predictions + decision logging
- Then: Incremental retrain with new data
- Repeat: Next 2-hour cycle

Usage:
    python continuous_trading_loop.py
"""

import asyncio
import time
from datetime import datetime, timedelta
from typing import Optional

import httpx

# Configuration
AGENT_SERVICE_URL = "http://localhost:8001"
UNIVERSE = ["NVDA", "MSFT", "AAPL", "TSLA", "AMD", "GOOGL", "META", "AMZN"]
STRATEGIES = ["momentum", "mean_reversion", "breakout", "trend_follow", "short_momentum", "short_breakdown"]

# Cycle configuration
CYCLE_DURATION_HOURS = 2
PREDICTION_INTERVAL_MINUTES = 5
INCREMENTAL_TRIGGER_TRADES = 50


class ContinuousTradingLoop:
    """Manages the 2-hour cycle: predictions → retrain → repeat."""

    def __init__(self):
        self.client = httpx.AsyncClient(base_url=AGENT_SERVICE_URL, timeout=30)
        self.predictions_this_cycle = 0
        self.cycle_start = None
        self.total_cycles = 0

    async def make_prediction(self, strategy: str, ticker: str) -> dict:
        """Make a single prediction."""
        try:
            response = await self.client.post(
                "/predict",
                json={"strategy": strategy, "ticker": ticker},
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"  ❌ Prediction failed for {strategy}:{ticker} - {e}")
            return {"error": str(e)}

    async def run_predictions_for_duration(self, duration_hours: int = 2):
        """Run live predictions for N hours."""
        self.cycle_start = datetime.now()
        end_time = self.cycle_start + timedelta(hours=duration_hours)
        self.predictions_this_cycle = 0

        print(f"\n{'='*80}")
        print(f"🕐 TRADING CYCLE #{self.total_cycles + 1}")
        print(f"{'='*80}")
        print(f"⏱️  Duration: {duration_hours} hours")
        print(f"   Start: {self.cycle_start.strftime('%H:%M:%S')}")
        print(f"   End: {end_time.strftime('%H:%M:%S')}")
        print(f"📊 Universe: {len(UNIVERSE)} tickers × {len(STRATEGIES)} strategies")
        print(f"   = {len(UNIVERSE) * len(STRATEGIES)} predictions/cycle\n")

        prediction_count = 0
        interval_minutes = PREDICTION_INTERVAL_MINUTES

        while datetime.now() < end_time:
            # Make predictions for all tickers × strategies
            for strategy in STRATEGIES:
                for ticker in UNIVERSE:
                    result = await self.make_prediction(strategy, ticker)

                    if "error" not in result:
                        direction = result.get("direction", "?")
                        prob = result.get("probability", 0)
                        confidence = result.get("confidence", 0)

                        emoji = "📈" if direction == "up" else "📉"
                        print(
                            f"  {emoji} {strategy:18} {ticker:6} → {direction:4} "
                            f"(prob={prob:.2f}, conf={confidence:+4d})"
                        )
                        self.predictions_this_cycle += 1
                        prediction_count += 1

            # Check if incremental retrain is needed
            if self.predictions_this_cycle >= INCREMENTAL_TRIGGER_TRADES:
                print(f"\n⚡ Incremental trigger: {self.predictions_this_cycle} trades accumulated")
                await self.retrain_incremental()
                self.predictions_this_cycle = 0

            # Sleep before next batch
            remaining = end_time - datetime.now()
            if remaining.total_seconds() > 0:
                sleep_time = min(
                    interval_minutes * 60,
                    remaining.total_seconds(),
                )
                print(f"\n⏳ Sleeping {int(sleep_time)}s until next batch...")
                await asyncio.sleep(sleep_time)
            else:
                break

        elapsed = (datetime.now() - self.cycle_start).total_seconds()
        print(f"\n✅ Trading cycle complete in {elapsed:.1f}s")
        print(f"   Made {prediction_count} predictions")

    async def retrain_incremental(self):
        """Run incremental retrain."""
        print(f"\n🔄 INCREMENTAL RETRAIN (warm-start)")
        print(f"   Using: {UNIVERSE}")

        try:
            response = await self.client.post(
                "/retrain-incremental",
                json={
                    "tickers": UNIVERSE,
                    "days": 100,  # Recent data only
                },
            )
            response.raise_for_status()
            result = response.json()

            duration = result.get("duration_seconds", 0)
            status = result.get("status", "unknown")

            print(f"✅ {status}")
            print(f"   Duration: {duration:.1f}s")

            # Show strategy results
            training_result = result.get("result", {})
            strategies_trained = training_result.get("strategies_trained", 0)
            if strategies_trained:
                print(f"   Strategies: {strategies_trained}")

        except Exception as e:
            print(f"❌ Incremental retrain failed: {e}")

    async def retrain_full(self):
        """Run full retrain (for market-close or end of cycle)."""
        print(f"\n🔄 FULL RETRAIN (complete)")
        print(f"   Using: {UNIVERSE} with 504 days history")

        try:
            # Start training via POST /train endpoint
            response = await self.client.post(
                "/train",
                json={
                    "tickers": UNIVERSE,
                    "use_cache": True,
                    "parallel": True,
                    "incremental": False,
                    "feature_selection": True,
                },
            )
            response.raise_for_status()
            job_data = response.json()
            job_id = job_data.get("job_id")

            print(f"✅ Training job started: {job_id}")
            print(f"   Status: {job_data.get('status')}")

            # Poll job status
            max_polls = 120  # 10 minutes max
            poll_interval = 5  # seconds
            poll_count = 0

            while poll_count < max_polls:
                try:
                    status_response = await self.client.get(f"/jobs/{job_id}")
                    status_response.raise_for_status()
                    status = status_response.json()

                    job_status = status.get("status")
                    progress = status.get("progress_pct", 0)
                    current_step = status.get("current_step", "")

                    if job_status == "completed":
                        print(f"✅ Training completed!")
                        print(f"   Progress: {progress}%")
                        return

                    elif job_status == "failed":
                        error = status.get("error", "Unknown error")
                        print(f"❌ Training failed: {error}")
                        return

                    print(f"   [{progress:3d}%] {current_step}")

                except Exception as e:
                    print(f"   Error checking status: {e}")

                await asyncio.sleep(poll_interval)
                poll_count += 1

            print(f"⚠️  Training still running after {max_polls * poll_interval}s")

        except Exception as e:
            print(f"❌ Full retrain failed: {e}")

    async def run_continuous_loop(self, num_cycles: int = 0):
        """Run the continuous loop (0 = infinite)."""
        cycle_num = 0

        try:
            while num_cycles == 0 or cycle_num < num_cycles:
                self.total_cycles += 1
                cycle_num += 1

                # Phase 1: 2-hour trading
                await self.run_predictions_for_duration(duration_hours=CYCLE_DURATION_HOURS)

                # Phase 2: Incremental retrain (+ full retrain every Nth cycle)
                if cycle_num % 3 == 0:  # Every 3 cycles, do full retrain
                    await self.retrain_full()
                else:
                    await self.retrain_incremental()

                # Report cycle stats
                print(f"\n📊 Cycle {cycle_num} Summary:")
                print(f"   Predictions: {self.predictions_this_cycle}")

                if num_cycles > 0 and cycle_num < num_cycles:
                    print(f"\n⏳ Waiting before next cycle...")
                    await asyncio.sleep(10)

        except KeyboardInterrupt:
            print(f"\n\n⛔ Continuous loop interrupted by user")
        except Exception as e:
            print(f"\n\n❌ Fatal error in continuous loop: {e}")
        finally:
            await self.client.aclose()
            print(f"\n✅ Continuous trading loop stopped")
            print(f"   Total cycles: {self.total_cycles}")


async def main():
    """Main entry point."""
    print("\n" + "=" * 80)
    print("🤖 CONTINUOUS AUTONOMOUS TRADING LOOP")
    print("=" * 80)
    print(f"\nConfiguration:")
    print(f"  Agent Service: {AGENT_SERVICE_URL}")
    print(f"  Cycle Duration: {CYCLE_DURATION_HOURS} hours")
    print(f"  Prediction Interval: {PREDICTION_INTERVAL_MINUTES} minutes")
    print(f"  Incremental Trigger: {INCREMENTAL_TRIGGER_TRADES} trades")
    print(f"  Universe: {', '.join(UNIVERSE)}")
    print(f"  Strategies: {', '.join(STRATEGIES)}")

    # Check health
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{AGENT_SERVICE_URL}/health")
            if response.status_code == 200:
                print(f"\n✅ Agent Service healthy")
            else:
                print(f"\n❌ Agent Service unhealthy (status {response.status_code})")
                return
    except Exception as e:
        print(f"\n❌ Cannot reach Agent Service at {AGENT_SERVICE_URL}: {e}")
        print(f"   Make sure it's running: python backend/agent_service.py")
        return

    # Start the loop
    loop = ContinuousTradingLoop()

    # Run with 0 cycles = infinite loop (until Ctrl+C)
    # Or run with specific number of cycles
    await loop.run_continuous_loop(num_cycles=0)


if __name__ == "__main__":
    asyncio.run(main())
