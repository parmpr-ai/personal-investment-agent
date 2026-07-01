# Local Setup Guide — Personal Investment Agent

Run the autonomous trading agent on your local machine.

---

## Prerequisites

- **Python 3.11+**
- **Git**
- **pip** (Python package manager)
- **SQLite3** (usually included)

---

## Step 1: Clone the Repository

```bash
# Clone from main branch
git clone https://github.com/parmpr-ai/personal-investment-agent.git
cd personal-investment-agent

# Or if already cloned, pull latest main
git fetch origin
git checkout main
git pull origin main
```

---

## Step 2: Create Virtual Environment

```bash
# Create virtual environment
python3 -m venv venv

# Activate it
# On macOS/Linux:
source venv/bin/activate

# On Windows:
venv\Scripts\activate
```

---

## Step 3: Install Dependencies

```bash
# Install required packages
pip install -r requirements.txt

# Core packages installed:
# - fastapi==0.104.1
# - uvicorn==0.24.0
# - pandas==2.1.3
# - numpy==1.26.2
# - scikit-learn==1.3.2
# - xgboost==2.0.2
# - lightgbm==4.0.0
# - catboost==1.2.2
# - yfinance==0.2.32
# - pytz==2023.3
# - python-dotenv==1.0.0
# - ibapi==10.0.0 (Interactive Brokers)
```

---

## Step 4: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your settings:
# GROQ_API_KEY=your_groq_key_here
# IBKR_USERNAME=your_ibkr_username
# IBKR_PASSWORD=your_ibkr_password
# IBKR_ACCOUNT=DU12345  (paper trading account)
```

---

## Step 5: Run the Agent Server

### Option A: Run Agent Only (Port 8001)

```bash
cd backend

# Start the agent server
python3 -m uvicorn agent_main:app --host 0.0.0.0 --port 8001 --reload

# Output:
# INFO:     Uvicorn running on http://127.0.0.1:8001
# INFO:     Application startup complete
```

### Option B: Run Both Backend + Frontend

```bash
# Terminal 1: Agent Server (Port 8001)
cd backend
python3 -m uvicorn agent_main:app --host 0.0.0.0 --port 8001

# Terminal 2: Main Backend (Port 8000)
cd backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000

# Terminal 3: Frontend (Port 3000)
cd frontend
npm install
npm run dev
```

---

## Step 6: Test the Agent

### Health Check

```bash
curl http://localhost:8001/health
# Response: {"ok":true,"app":"PIA Agent Server","version":"v2.0"}
```

### Get Universe Stats

```bash
curl http://localhost:8001/universe/current-size | python3 -m json.tool
# Response: Shows 1,140 stocks across 11 sectors
```

### Screen for Opportunities

```bash
curl -X POST http://localhost:8001/screener/scan
# Starts background screening task
```

### Get Trading Summary

```bash
curl http://localhost:8001/agent/summary | python3 -m json.tool
```

---

## Available Endpoints (25+)

### Trading
- `POST /agent/entry` — Evaluate entry signal
- `POST /agent/exit` — Evaluate exit signal
- `GET /agent/positions` — Current open positions (18/25 max)
- `GET /agent/summary` — Trading P&L and stats

### Screener & Universe
- `POST /screener/scan` — Start stock screening
- `GET /screener/status` — Screener status
- `GET /screener/opportunities` — Top 20 opportunities
- `POST /universe/daily-update` — Trigger daily update
- `GET /universe/current-size` — Universe breakdown by sector

### ML & Backtesting
- `POST /agent/ml/train` — Retrain ensemble models
- `GET /agent/ml/status` — Model training status
- `POST /agent/ml/walkforward` — Walk-forward validation
- `GET /agent/stats` — Full system statistics

### Trading History
- `GET /trades/open` — Open positions
- `GET /trades/closed` — Closed trade history
- `GET /trades/summary` — Trade statistics

---

## Directory Structure

```
personal-investment-agent/
├── backend/
│   ├── agent_main.py              # Agent server (port 8001)
│   ├── main.py                    # Main backend (port 8000)
│   ├── services/
│   │   ├── autonomous_agent.py    # Core trading logic
│   │   ├── stock_screener.py      # Daily opportunity screener
│   │   ├── ml_scorer.py           # ML model training & inference
│   │   ├── autonomous_executor_v2.py  # Trade execution
│   │   └── ...23+ other services
│   ├── *.sqlite3                  # Databases (trades, cache, etc.)
│   └── requirements.txt           # Python dependencies
│
├── frontend/
│   ├── src/
│   ├── package.json
│   └── ...
│
├── CLAUDE.md                      # Project architecture docs
├── LOCAL_SETUP.md                 # This file
├── NETWORK_ACCESS_REQUEST.md      # Admin approval request
└── README.md                       # Main documentation
```

---

## Databases

Located in `backend/`:

| Database | Purpose |
|----------|---------|
| `autonomous_trades.sqlite3` | All trade history (184 trades) |
| `ml_data_cache.sqlite3` | Cached OHLCV data (14 tickers × 504 days) |
| `agent_training.sqlite3` | ML model metadata |
| `agent_decisions.sqlite3` | Agent decision logs |
| `paper_trading.sqlite3` | Paper trading account state |

---

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 8001
lsof -i :8001

# Kill process
kill -9 <PID>
```

### ModuleNotFoundError

```bash
# Reinstall dependencies
pip install --upgrade -r requirements.txt
```

### yfinance Network Error

The agent works offline using cached data. To enable live trading:
- Request network access (see NETWORK_ACCESS_REQUEST.md)
- Or manually add OHLCV data to ml_data_cache.sqlite3

---

## Development Workflow

### Run Tests

```bash
# Run test suite
pytest backend/tests/ -v

# Run specific service test
pytest backend/tests/test_ml_scorer.py -v
```

### Check Code Style

```bash
# Format with black
black backend/

# Lint with flake8
flake8 backend/ --max-line-length=100
```

### View Logs

```bash
# Agent server logs (real-time)
tail -f /tmp/agent.log

# Agent decisions
sqlite3 backend/agent_decisions.sqlite3 "SELECT * FROM decisions LIMIT 10;"
```

---

## Quick Start Commands

```bash
# Complete setup in one go
git clone https://github.com/parmpr-ai/personal-investment-agent.git
cd personal-investment-agent
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
cd backend
python3 -m uvicorn agent_main:app --port 8001

# In another terminal
curl http://localhost:8001/health
```

---

## Next Steps

1. ✅ Clone repository
2. ✅ Set up virtual environment
3. ✅ Install dependencies
4. ✅ Configure .env file
5. ✅ Start agent server
6. ✅ Test endpoints
7. 📝 Modify agent settings in agent_config endpoint
8. 📊 Monitor live trading in dashboard
9. 🚀 Request network access for live market data

---

## Support

- **Issues:** GitHub Issues
- **Questions:** Email PARMPR@gmail.com
- **Docs:** See CLAUDE.md for architecture details
