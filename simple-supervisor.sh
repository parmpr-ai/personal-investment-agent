#!/bin/bash
# Simple AI Agent Supervisor with Auto-Restart

AGENT_DIR="/home/user/personal-investment-agent/backend"
LOG_DIR="/home/user/personal-investment-agent/logs"
PORT=8001
HEALTH_CHECK_INTERVAL=30
MAX_RESTARTS=100
RESTART_DELAY=5

mkdir -p "$LOG_DIR"

log_msg() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_DIR/supervisor.log"
}

start_agent() {
    log_msg "🚀 Starting AI Agent on port $PORT..."

    # Kill existing processes
    lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
    sleep 2

    cd "$AGENT_DIR"
    python -m uvicorn agent_main:app --host 0.0.0.0 --port $PORT >> "$LOG_DIR/agent.log" 2>&1 &

    echo $! > "$LOG_DIR/agent.pid"
    sleep 5

    if curl -s http://localhost:$PORT/health &>/dev/null; then
        log_msg "✅ Agent started successfully"
        return 0
    else
        log_msg "❌ Agent health check failed"
        return 1
    fi
}

monitor_agent() {
    while true; do
        sleep $HEALTH_CHECK_INTERVAL

        if ! curl -s http://localhost:$PORT/health &>/dev/null; then
            log_msg "❌ Health check failed, restarting..."
            return 1
        fi
    done
}

# Main loop
restart_count=0

trap "log_msg '🛑 Supervisor stopped'; exit 0" SIGTERM SIGINT

log_msg "═════════════════════════════════════════════════════════════"
log_msg "🤖 AI AGENT SUPERVISOR STARTED"
log_msg "═════════════════════════════════════════════════════════════"

while [ $restart_count -lt $MAX_RESTARTS ]; do
    restart_count=$((restart_count + 1))

    if start_agent; then
        log_msg "Monitoring agent (attempt $restart_count/$MAX_RESTARTS)..."
        monitor_agent || {
            log_msg "⚠️ Agent crash detected, will restart in ${RESTART_DELAY}s..."
            sleep $RESTART_DELAY
            continue
        }
    else
        log_msg "⚠️ Failed to start agent, retrying in ${RESTART_DELAY}s..."
        sleep $RESTART_DELAY
    fi
done

log_msg "🔴 Max restarts exceeded, stopping supervisor"
exit 1
