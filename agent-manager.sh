#!/bin/bash
################################################################################
# AI Agent Manager — Easy Service Control
################################################################################

COMMAND=${1:-status}
LOG_DIR="/home/user/personal-investment-agent/logs"
SUPERVISOR_LOG="${LOG_DIR}/supervisor.log"
AGENT_LOG="${LOG_DIR}/agent.log"

case "$COMMAND" in
    start)
        echo "🚀 Starting AI Agent Supervisor..."
        /home/user/personal-investment-agent/agent-supervisor.sh &
        sleep 5
        echo "Status:"
        bash "$0" status
        ;;
    stop)
        echo "🛑 Stopping AI Agent Supervisor..."
        pkill -f agent-supervisor.sh || true
        sleep 2
        echo "✅ Stopped"
        ;;
    restart)
        bash "$0" stop
        sleep 2
        bash "$0" start
        ;;
    status)
        echo "═══════════════════════════════════════════════════════════════"
        echo "📊 AI AGENT STATUS"
        echo "═══════════════════════════════════════════════════════════════"

        # Check supervisor
        if ps aux | grep -q "[a]gent-supervisor.sh"; then
            echo "✅ Supervisor: RUNNING"
        else
            echo "❌ Supervisor: STOPPED"
        fi

        # Check agent server
        if curl -s http://localhost:8001/health &>/dev/null; then
            echo "✅ Agent Server: ONLINE (port 8001)"

            # Get executor status
            executor_status=$(curl -s http://localhost:8001/health | jq -r '.agent_running // false')
            if [ "$executor_status" = "true" ]; then
                echo "✅ Executor: TRADING"

                # Get trades
                trades=$(curl -s http://localhost:8001/executor/monitor | jq '.performance.total_trades // 0')
                pnl=$(curl -s http://localhost:8001/executor/monitor | jq '.performance.total_pnl // 0')
                win_rate=$(curl -s http://localhost:8001/executor/monitor | jq '.performance.win_rate_pct // 0')
                echo "   Trades: $trades | P&L: \$$pnl | Win Rate: ${win_rate}%"
            else
                echo "⚠️  Executor: IDLE (ready to start)"
            fi
        else
            echo "❌ Agent Server: OFFLINE"
        fi

        echo ""
        echo "📝 Recent Logs:"
        echo "───────────────────────────────────────────────────────────────"
        if [ -f "$SUPERVISOR_LOG" ]; then
            tail -5 "$SUPERVISOR_LOG"
        fi
        ;;
    logs)
        LINES=${2:-50}
        echo "📋 Supervisor Log (last $LINES lines):"
        echo "───────────────────────────────────────────────────────────────"
        if [ -f "$SUPERVISOR_LOG" ]; then
            tail -n $LINES "$SUPERVISOR_LOG"
        else
            echo "No supervisor log yet"
        fi
        echo ""
        echo "📋 Agent Log (last $LINES lines):"
        echo "───────────────────────────────────────────────────────────────"
        if [ -f "$AGENT_LOG" ]; then
            tail -n $LINES "$AGENT_LOG"
        else
            echo "No agent log yet"
        fi
        ;;
    tail)
        LINES=${2:-20}
        echo "🔴 Following supervisor log (Ctrl+C to exit)..."
        tail -f "$SUPERVISOR_LOG"
        ;;
    *)
        echo "AI Agent Manager"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  start              Start the supervisor and agent"
        echo "  stop               Stop the supervisor and agent"
        echo "  restart            Restart the supervisor and agent"
        echo "  status             Show current status"
        echo "  logs [LINES]       Show recent logs (default: 50 lines)"
        echo "  tail [LINES]       Follow supervisor log in real-time"
        echo ""
        exit 1
        ;;
esac
