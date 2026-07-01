#!/bin/bash

# Start Autonomous Agent Service
# This script runs the agent training service independently from PIA

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🤖 Starting Autonomous Agent Service..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Load environment
if [ -f .env.agent ]; then
    echo "📝 Loading .env.agent configuration..."
    export $(cat .env.agent | grep -v '^#' | xargs)
else
    echo "⚠️  .env.agent not found, using defaults"
    echo "   Run: cp .env.agent.example .env.agent"
fi

# Get configuration
AGENT_HOST=${AGENT_SERVICE_HOST:-0.0.0.0}
AGENT_PORT=${AGENT_SERVICE_PORT:-8001}
LOG_LEVEL=${LOG_LEVEL:-info}

echo ""
echo "📍 Configuration:"
echo "   Host: $AGENT_HOST"
echo "   Port: $AGENT_PORT"
echo "   Log Level: $LOG_LEVEL"
echo ""
echo "🚀 Starting on http://$AGENT_HOST:$AGENT_PORT"
echo "📚 API Docs: http://localhost:$AGENT_PORT/docs"
echo "❤️  Health: http://localhost:$AGENT_PORT/health"
echo ""

# Run the agent service
python backend/agent_service.py
