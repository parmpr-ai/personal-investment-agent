#!/usr/bin/env python3
"""
Terminal Trading Dashboard - Monitor & control paper trading from CLI
"""

import asyncio
import sys
from datetime import datetime
from typing import Optional

import httpx

# Colors for terminal
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    END = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'


AGENT_URL = "http://localhost:8001"
STRATEGIES = ['momentum', 'mean_reversion', 'breakout', 'trend_follow', 'short_momentum', 'short_breakdown']


async def fetch_data():
    """Fetch all data from agent service."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            predictions = await client.get(f"{AGENT_URL}/decisions/stats")
            open_trades = await client.get(f"{AGENT_URL}/trades/open")
            performance = await client.get(f"{AGENT_URL}/trades/performance")

            return {
                'predictions': predictions.json() if predictions.status_code == 200 else {},
                'open_trades': open_trades.json() if open_trades.status_code == 200 else {},
                'performance': performance.json() if performance.status_code == 200 else {},
            }
    except Exception as e:
        print(f"{Colors.RED}Error fetching data: {e}{Colors.END}")
        return None


async def show_dashboard():
    """Display live dashboard."""
    while True:
        # Clear screen
        print("\033[2J\033[H", end='')

        data = await fetch_data()
        if not data:
            print(f"{Colors.RED}Cannot connect to Agent Service{Colors.END}")
            await asyncio.sleep(5)
            continue

        # Header
        print(f"{Colors.BOLD}{Colors.CYAN}{'='*80}")
        print(f"🤖 PAPER TRADING DASHBOARD - {datetime.now().strftime('%H:%M:%S')}")
        print(f"{'='*80}{Colors.END}\n")

        # Performance Summary
        perf = data.get('performance', {})
        print(f"{Colors.BOLD}💰 PERFORMANCE{Colors.END}")
        print(f"  Win Rate:       {Colors.GREEN}{perf.get('win_rate', 0):.1f}%{Colors.END} ({perf.get('winners', 0)}W/{perf.get('losers', 0)}L)")
        print(f"  Total P&L:      {Colors.GREEN if perf.get('total_pnl', 0) >= 0 else Colors.RED}${perf.get('total_pnl', 0):.2f}{Colors.END}")
        print(f"  Avg Return:     {perf.get('avg_pnl_pct', 0):.2f}%")
        print(f"  Closed Trades:  {perf.get('total_closed_trades', 0)}\n")

        # Open Trades
        trades = data.get('open_trades', {}).get('open_trades', [])
        print(f"{Colors.BOLD}📈 OPEN TRADES ({len(trades)}){Colors.END}")
        if trades:
            for trade in trades:
                print(f"  {trade['ticker']:6} {trade['strategy']:15} @ ${trade['entry_price']:.2f} × {trade['quantity']:4} | Exit: {trade['exit_date']} ({trade['days_remaining']} days)")
        else:
            print("  (no open trades)")
        print()

        # Prediction Stats
        preds = data.get('predictions', {})
        print(f"{Colors.BOLD}🎯 PREDICTIONS (Last 24h){Colors.END}")
        total_preds = 0
        for strategy in STRATEGIES:
            if strategy in preds:
                count = preds[strategy].get('total_decisions', 0)
                total_preds += count
                accuracy = preds[strategy].get('accuracy', 0) * 100
                print(f"  {strategy:18} {count:3} preds | Accuracy: {Colors.YELLOW}{accuracy:5.1f}%{Colors.END}")
        print(f"  {'─'*50}")
        print(f"  {'TOTAL':18} {total_preds:3} preds\n")

        # Menu
        print(f"{Colors.BOLD}{'─'*80}{Colors.END}")
        print(f"{Colors.BOLD}Commands:{Colors.END}")
        print(f"  [E] Entry Trade     [X] Exit Trade      [P] Predictions     [Q] Quit")
        print(f"{Colors.BOLD}{'─'*80}{Colors.END}\n")

        # Input
        try:
            cmd = await asyncio.wait_for(
                asyncio.to_thread(input, f"{Colors.BLUE}> {Colors.END}"),
                timeout=10
            )
        except asyncio.TimeoutError:
            continue

        if cmd.lower() == 'q':
            print(f"{Colors.GREEN}Goodbye!{Colors.END}")
            break
        elif cmd.lower() == 'e':
            await entry_trade_prompt()
        elif cmd.lower() == 'x':
            await exit_trade_prompt(trades)
        elif cmd.lower() == 'p':
            await show_predictions(preds)


async def entry_trade_prompt():
    """Interactive trade entry."""
    print(f"\n{Colors.BOLD}📝 ENTRY TRADE{Colors.END}\n")

    # Strategy
    print("Strategies:")
    for i, s in enumerate(STRATEGIES, 1):
        print(f"  {i}. {s}")
    strategy_idx = int(input("Choose strategy (1-6): ")) - 1
    if strategy_idx < 0 or strategy_idx >= len(STRATEGIES):
        print(f"{Colors.RED}Invalid strategy{Colors.END}")
        await asyncio.sleep(2)
        return
    strategy = STRATEGIES[strategy_idx]

    # Ticker
    ticker = input("Ticker (e.g., NVDA): ").upper()

    # Price
    entry_price = float(input("Entry price: "))

    # Quantity
    quantity = int(input("Quantity (default 100): ") or "100")

    # Direction
    print("Direction: [1] UP  [2] DOWN")
    direction = "up" if int(input("Choice (1-2): ")) == 1 else "down"

    # Side
    print("Side: [1] LONG  [2] SHORT")
    side = "long" if int(input("Choice (1-2): ")) == 1 else "short"

    # Confirm
    print(f"\n{Colors.YELLOW}Confirm entry:{Colors.END}")
    print(f"  Strategy: {strategy}")
    print(f"  Ticker:   {ticker}")
    print(f"  Price:    ${entry_price:.2f}")
    print(f"  Qty:      {quantity}")
    print(f"  Direction: {direction.upper()}")
    print(f"  Side:     {side.upper()}")

    if input("Proceed? (y/n): ").lower() != 'y':
        print("Cancelled")
        await asyncio.sleep(1)
        return

    # Execute
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{AGENT_URL}/trades/entry",
                json={
                    "strategy": strategy,
                    "ticker": ticker,
                    "entry_price": entry_price,
                    "predicted_direction": direction,
                    "quantity": quantity,
                    "side": side,
                }
            )

            if response.status_code == 200:
                result = response.json()
                print(f"\n{Colors.GREEN}✅ Trade entered!{Colors.END}")
                print(f"  Trade ID: {result.get('trade_id')}")
                print(f"  Exit Date: {result.get('exit_date')}")
            else:
                print(f"{Colors.RED}Error: {response.text}{Colors.END}")
    except Exception as e:
        print(f"{Colors.RED}Error: {e}{Colors.END}")

    await asyncio.sleep(3)


async def exit_trade_prompt(trades: list):
    """Interactive trade exit."""
    if not trades:
        print(f"{Colors.YELLOW}No open trades{Colors.END}")
        await asyncio.sleep(2)
        return

    print(f"\n{Colors.BOLD}📊 EXIT TRADE{Colors.END}\n")

    for i, trade in enumerate(trades, 1):
        print(f"  {i}. {trade['ticker']:6} {trade['strategy']:15} @ ${trade['entry_price']:.2f}")

    choice = int(input("Select trade (1-N): ")) - 1
    if choice < 0 or choice >= len(trades):
        print(f"{Colors.RED}Invalid choice{Colors.END}")
        await asyncio.sleep(2)
        return

    trade = trades[choice]

    # Exit price
    exit_price = float(input(f"Exit price (current entry: ${trade['entry_price']:.2f}): "))

    # Direction
    print("Actual direction: [1] UP  [2] DOWN")
    actual_direction = "up" if int(input("Choice (1-2): ")) == 1 else "down"

    # Confirm
    print(f"\n{Colors.YELLOW}Confirm exit:{Colors.END}")
    print(f"  Ticker:   {trade['ticker']}")
    print(f"  Entry:    ${trade['entry_price']:.2f}")
    print(f"  Exit:     ${exit_price:.2f}")
    print(f"  Direction: {actual_direction.upper()}")

    if input("Proceed? (y/n): ").lower() != 'y':
        print("Cancelled")
        await asyncio.sleep(1)
        return

    # Execute
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{AGENT_URL}/trades/{trade['trade_id']}/exit",
                json={
                    "exit_price": exit_price,
                    "actual_direction": actual_direction,
                }
            )

            if response.status_code == 200:
                result = response.json()
                pnl = result.get('pnl', 0)
                pnl_pct = result.get('pnl_pct', 0)
                correct = result.get('was_correct', False)

                color = Colors.GREEN if pnl >= 0 else Colors.RED
                print(f"\n{Colors.GREEN}✅ Trade closed!{Colors.END}")
                print(f"  P&L: {color}${pnl:.2f} ({pnl_pct:+.2f}%){Colors.END}")
                print(f"  Accuracy: {'✓ CORRECT' if correct else '✗ WRONG'}")
            else:
                print(f"{Colors.RED}Error: {response.text}{Colors.END}")
    except Exception as e:
        print(f"{Colors.RED}Error: {e}{Colors.END}")

    await asyncio.sleep(3)


async def show_predictions(preds: dict):
    """Show detailed predictions."""
    print(f"\n{Colors.BOLD}{'='*80}")
    print(f"🎯 PREDICTION STATS (24h)")
    print(f"{'='*80}{Colors.END}\n")

    for strategy in STRATEGIES:
        if strategy in preds:
            data = preds[strategy]
            total = data.get('total_decisions', 0)
            correct = data.get('correct', 0)
            accuracy = data.get('accuracy', 0) * 100

            bar_len = 40
            filled = int(bar_len * (accuracy / 100))
            bar = '█' * filled + '░' * (bar_len - filled)

            print(f"{strategy:18} {bar} {accuracy:5.1f}% ({correct}/{total})")

    print(f"\n{Colors.YELLOW}Press Enter to continue...{Colors.END}")
    await asyncio.to_thread(input)


async def main():
    """Main entry point."""
    print(f"{Colors.BOLD}{Colors.CYAN}")
    print("╔════════════════════════════════════════════════════════════════════════════════╗")
    print("║                  🤖 PAPER TRADING CLI DASHBOARD                                ║")
    print("║                   Monitor & Control Trades from Terminal                       ║")
    print("╚════════════════════════════════════════════════════════════════════════════════╝")
    print(f"{Colors.END}\n")

    print(f"Connecting to Agent Service at {AGENT_URL}...\n")

    # Check health
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{AGENT_URL}/health")
            if response.status_code == 200:
                print(f"{Colors.GREEN}✅ Connected!{Colors.END}\n")
                await asyncio.sleep(1)
            else:
                print(f"{Colors.RED}❌ Service unhealthy{Colors.END}")
                return
    except Exception as e:
        print(f"{Colors.RED}❌ Cannot connect: {e}{Colors.END}")
        print(f"Make sure agent service is running: python backend/agent_service.py")
        return

    # Start dashboard
    await show_dashboard()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}Interrupted{Colors.END}")
        sys.exit(0)
