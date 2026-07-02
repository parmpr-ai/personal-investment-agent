#!/bin/bash
################################################################################
# AI Agent Supervisor — Continuous Monitoring & Auto-Restart
#
# Monitors the AI agent on port 8001 and auto-restarts if it crashes
# Logs all events with timestamps for debugging
################################################################################

set -e

# Configuration
AGENT_DIR="/home/user/personal-investment-agent/backend"
LOG_DIR="/home/user/personal-investment-agent/logs"
AGENT_LOG="${LOG_DIR}/agent.log"
SUPERVISOR_LOG="${LOG_DIR}/supervisor.log"
PID_FILE="/tmp/agent_supervisor.pid"
HEALTH_CHECK_INTERVAL=30  # seconds
HEALTH_CHECK_RETRIES=3
PORT=8001
MAX_RESTART_ATTEMPTS=100
RESTART_DELAY=5

# Create log directory
mkdir -p "$LOG_DIR"

################################################################################
# Logging Function
################################################################################
log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] ${message}" | tee -a "$SUPERVISOR_LOG"
}

################################################################################
# Health Check Function
################################################################################
health_check() {
    local retries=0
    while [ $retries -lt $HEALTH_CHECK_RETRIES ]; do
        if curl -s http://localhost:${PORT}/health > /dev/null 2>&1; then
            return 0
        fi
        retries=$((retries + 1))
        sleep 2
    done
    return 1
}

################################################################################
# Start Agent Function
################################################################################
start_agent() {
    log "INFO" "🚀 Starting AI Agent Server on port ${PORT}..."

    cd "$AGENT_DIR"

    # Kill any existing processes on the port
    if lsof -ti:${PORT} &>/dev/null; then
        log "WARN" "Found existing process on port ${PORT}, killing..."
        lsof -ti:${PORT} | xargs kill -9 2>/dev/null || true
        sleep 2
    fi

    # Start the agent with output to log file
    nohup python -m uvicorn agent_main:app \
        --host 0.0.0.0 \
        --port ${PORT} \
        >> "$AGENT_LOG" 2>&1 &

    local agent_pid=$!
    log "INFO" "Agent started with PID: ${agent_pid}"

    # Wait for startup and health check
    local startup_attempts=0
    while [ $startup_attempts -lt 10 ]; do
        sleep 2
        if health_check; then
            log "INFO" "✅ Agent health check passed!"
            echo $agent_pid > "$PID_FILE"
            return 0
        fi
        startup_attempts=$((startup_attempts + 1))
        log "WARN" "Health check attempt $startup_attempts/10 failed..."
    done

    log "ERROR" "❌ Agent failed to start after 10 health check attempts"
    kill $agent_pid 2>/dev/null || true
    return 1
}

################################################################################
# Start Executor Function
################################################################################
start_executor() {
    log "INFO" "🎯 Starting Autonomous Executor..."

    # Give server time to stabilize
    sleep 3

    # Check if executor is already running
    local executor_status=$(curl -s http://localhost:${PORT}/health 2>/dev/null | grep -o '"agent_running":[^,}]*' || echo "false")

    if echo "$executor_status" | grep -q "true"; then
        log "INFO" "✅ Executor already running"
        return 0
    fi

    log "WARN" "Executor not running, attempting to start via lifespan..."
    # The executor starts automatically via lifespan context manager
    # Just verify it's running
    sleep 5

    if curl -s http://localhost:${PORT}/health 2>/dev/null | grep -q '"agent_running":true'; then
        log "INFO" "✅ Executor started successfully"
        return 0
    else
        log "WARN" "⚠️ Executor auto-start not detected, may start on first request"
        return 0
    fi
}

################################################################################
# Monitoring Loop
################################################################################
monitor_loop() {
    local restart_count=0

    while [ $restart_count -lt $MAX_RESTART_ATTEMPTS ]; do
        log "INFO" "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        log "INFO" "Starting agent (attempt $((restart_count + 1))/${MAX_RESTART_ATTEMPTS})"

        if start_agent; then
            log "INFO" "✅ Agent online and healthy"

            if start_executor; then
                log "INFO" "✅ Executor initialized"
            fi

            # Health monitoring loop
            local check_count=0
            while true; do
                sleep $HEALTH_CHECK_INTERVAL
                check_count=$((check_count + 1))

                if ! health_check; then
                    log "ERROR" "❌ Health check failed (attempt $check_count)"
                    log "ERROR" "Agent appears to have crashed, restarting..."
                    break
                fi

                # Show status every 5 checks (every ~2.5 minutes)
                if [ $((check_count % 5)) -eq 0 ]; then
                    local executor_monitor=$(curl -s http://localhost:${PORT}/executor/monitor 2>/dev/null | \
                        jq -r '.performance.total_trades // 0, .performance.total_pnl // 0, .positions.total_open // 0' 2>/dev/null | \
                        tr '\n' ' ')

                    if [ -n "$executor_monitor" ]; then
                        log "STATUS" "Trades: $(echo $executor_monitor | cut -d' ' -f1) | P&L: $(echo $executor_monitor | cut -d' ' -f2) | Open: $(echo $executor_monitor | cut -d' ' -f3)"
                    else
                        log "STATUS" "Agent online, awaiting executor data..."
                    fi
                fi
            done
        else
            log "ERROR" "Failed to start agent, will retry in ${RESTART_DELAY}s..."
        fi

        restart_count=$((restart_count + 1))

        if [ $restart_count -lt $MAX_RESTART_ATTEMPTS ]; then
            log "INFO" "Waiting ${RESTART_DELAY}s before restart..."
            sleep $RESTART_DELAY
        fi
    done

    log "CRITICAL" "🔴 Max restart attempts (${MAX_RESTART_ATTEMPTS}) exceeded, giving up"
    exit 1
}

################################################################################
# Signal Handlers
################################################################################
cleanup() {
    log "INFO" "🛑 Shutting down supervisor..."

    if [ -f "$PID_FILE" ]; then
        local agent_pid=$(cat "$PID_FILE")
        if ps -p $agent_pid > /dev/null 2>&1; then
            log "INFO" "Killing agent process $agent_pid..."
            kill -15 $agent_pid 2>/dev/null || true
            sleep 2
            kill -9 $agent_pid 2>/dev/null || true
        fi
        rm -f "$PID_FILE"
    fi

    # Kill all agent processes on the port
    lsof -ti:${PORT} | xargs kill -9 2>/dev/null || true

    log "INFO" "✅ Supervisor shutdown complete"
    exit 0
}

trap cleanup SIGTERM SIGINT

################################################################################
# Main
################################################################################
log "INFO" "═══════════════════════════════════════════════════════════════"
log "INFO" "🤖 AI AGENT SUPERVISOR STARTING"
log "INFO" "═══════════════════════════════════════════════════════════════"
log "INFO" "Agent directory: $AGENT_DIR"
log "INFO" "Port: $PORT"
log "INFO" "Log file: $AGENT_LOG"
log "INFO" "Health check interval: ${HEALTH_CHECK_INTERVAL}s"
log "INFO" "Max restart attempts: $MAX_RESTART_ATTEMPTS"
log "INFO" ""

# Save supervisor PID
echo $$ > "$PID_FILE"

# Start monitoring loop
monitor_loop
