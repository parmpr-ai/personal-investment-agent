"""
Pairs Trading Strategy — statistical arbitrage via mean-reverting spread.

Approach:
  1. Maintain a watch-list of correlated pairs (same sector, >0.80 60d correlation)
  2. Compute the normalised spread: z-score of (log(A/B) - rolling mean) / rolling std
  3. Enter when |z| > 2.0: BUY the laggard, SHORT the leader
  4. Exit when |z| < 0.5 (spread reverts) or after MAX_HOLD_DAYS
  5. Stop-loss at |z| > 3.5 (spread diverging further)

Pairs are delta-neutral by design (equal $ both legs) so market-regime
exposure is minimal — the strategy works across regimes.
"""
import asyncio
import math
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx

_TIMEOUT = 8
_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; InvestAgent/6.0)"}

# ── Static pair candidates (same sector, historically correlated) ─────────────
CANDIDATE_PAIRS: List[Tuple[str, str]] = [
    ("NVDA", "AMD"),    # Semiconductors
    ("META", "GOOGL"),  # Digital advertising
    ("MSFT", "AAPL"),   # Mega-cap Tech
    ("AMZN", "MSFT"),   # Cloud / Tech
    ("SOFI", "NVDA"),   # High-beta growth
]

# ── Parameters ────────────────────────────────────────────────────────────────
LOOKBACK      = 30   # bars for rolling mean / std of spread
ENTRY_Z       = 2.0  # open position when |z| exceeds this
EXIT_Z        = 0.5  # close position when |z| falls below this
STOP_Z        = 3.5  # stop-loss: spread diverging dangerously
MAX_HOLD_DAYS = 10   # max days to hold a pairs position
MIN_CORR      = 0.70 # minimum 30d correlation to enter
SCORE_SCALE   = 50   # pts: z=2.0 → 50, z=3.0 → 75 (caps at 99)

# In-memory open pairs positions: {(ticker_long, ticker_short): entry_z, entry_ts}
_open_pairs: Dict[Tuple[str, str], Dict[str, Any]] = {}


# ── Data helpers ──────────────────────────────────────────────────────────────

async def _fetch_closes(ticker: str, days: int = 60) -> Optional[List[float]]:
    """Fetch daily close prices from Yahoo Finance (query1→query2 fallback)."""
    hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]
    for host in hosts:
        try:
            url = f"https://{host}/v8/finance/chart/{ticker}"
            async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
                r = await client.get(url, params={"range": f"{days}d", "interval": "1d"})
                r.raise_for_status()
                data = r.json()
            raw = data["chart"]["result"][0]["indicators"]["quote"][0].get("close", [])
            return [c for c in raw if c is not None]
        except Exception:
            continue
    return None


# ── Spread computation ────────────────────────────────────────────────────────

def compute_spread_zscore(
    closes_a: List[float],
    closes_b: List[float],
    lookback: int = LOOKBACK,
) -> Optional[float]:
    """
    Compute the current z-score of the log-ratio spread A/B.
    Positive z → A is overpriced vs B (short A, buy B).
    Negative z → B is overpriced vs A (buy A, short B).
    Returns None if insufficient data.
    """
    n = min(len(closes_a), len(closes_b))
    if n < lookback + 5:
        return None
    a = closes_a[-n:]
    b = closes_b[-n:]
    # log-ratio spread
    spread = [math.log(a[i] / b[i]) for i in range(n) if a[i] > 0 and b[i] > 0]
    if len(spread) < lookback:
        return None
    window = spread[-lookback:]
    mu = sum(window) / lookback
    variance = sum((x - mu) ** 2 for x in window) / lookback
    std = math.sqrt(variance)
    if std < 1e-10:
        return None
    return round((spread[-1] - mu) / std, 3)


def compute_correlation(
    closes_a: List[float],
    closes_b: List[float],
    window: int = 30,
) -> Optional[float]:
    """30d Pearson correlation of log-returns."""
    n = min(len(closes_a), len(closes_b))
    if n < window + 2:
        return None
    a = closes_a[-n:]
    b = closes_b[-n:]
    ret_a = [math.log(a[i] / a[i-1]) for i in range(1, n)][-window:]
    ret_b = [math.log(b[i] / b[i-1]) for i in range(1, n)][-window:]
    if len(ret_a) < window:
        return None
    mu_a = sum(ret_a) / window
    mu_b = sum(ret_b) / window
    cov   = sum((ret_a[i] - mu_a) * (ret_b[i] - mu_b) for i in range(window)) / window
    var_a = sum((x - mu_a) ** 2 for x in ret_a) / window
    var_b = sum((x - mu_b) ** 2 for x in ret_b) / window
    denom = math.sqrt(var_a * var_b)
    return round(cov / denom, 3) if denom > 1e-10 else None


# ── Signal scoring ────────────────────────────────────────────────────────────

def score_pair(
    ticker_a: str,
    ticker_b: str,
    z: float,
    corr: float,
) -> Tuple[Optional[str], Optional[str], int, str]:
    """
    Returns (long_ticker, short_ticker, confidence, reason) for a pair signal.
    Returns (None, None, 0, reason) if no signal.
    """
    if abs(z) < ENTRY_Z:
        return None, None, 0, f"z={z:.2f} below entry threshold {ENTRY_Z}"
    if corr < MIN_CORR:
        return None, None, 0, f"correlation {corr:.2f} < {MIN_CORR} minimum"

    # z > 0: A overpriced vs B → short A, buy B
    # z < 0: B overpriced vs A → short B, buy A
    if z > 0:
        long_t, short_t = ticker_b, ticker_a
        direction = f"{ticker_a} overpriced vs {ticker_b}"
    else:
        long_t, short_t = ticker_a, ticker_b
        direction = f"{ticker_b} overpriced vs {ticker_a}"

    abs_z = abs(z)
    # Scale confidence: z=2.0→55, z=2.5→68, z=3.0→80 (cap at 95)
    confidence = min(95, int(40 + abs_z * SCORE_SCALE / 2))
    reason = (
        f"Pairs: {direction} | z={z:.2f} | corr={corr:.2f} | "
        f"BUY {long_t} / SHORT {short_t}"
    )
    return long_t, short_t, confidence, reason


def should_exit_pair(
    ticker_long: str,
    ticker_short: str,
    z: float,
    entry_ts: float,
) -> Tuple[bool, str]:
    """Returns (should_exit, reason)."""
    hold_days = (time.time() - entry_ts) / 86400
    if abs(z) < EXIT_Z:
        return True, f"Spread reverted to z={z:.2f} (target <{EXIT_Z})"
    if abs(z) > STOP_Z:
        return True, f"Stop-loss: spread diverged to z={z:.2f} (>{STOP_Z})"
    if hold_days >= MAX_HOLD_DAYS:
        return True, f"Max hold time reached ({hold_days:.1f} days)"
    return False, ""


# ── Batch scanning ────────────────────────────────────────────────────────────

async def scan_pairs(
    prices: Optional[Dict[str, float]] = None,
) -> List[Dict[str, Any]]:
    """
    Scan CANDIDATE_PAIRS for actionable signals.
    Returns a list of signal dicts (may include entry and exit signals).
    """
    # Fetch closes for all unique tickers concurrently
    unique = list({t for pair in CANDIDATE_PAIRS for t in pair})
    close_tasks = [_fetch_closes(t, 60) for t in unique]
    results = await asyncio.gather(*close_tasks, return_exceptions=True)
    closes: Dict[str, List[float]] = {}
    for t, res in zip(unique, results):
        if isinstance(res, list) and res:
            closes[t] = res

    signals: List[Dict[str, Any]] = []

    # Check exit signals for open pairs
    for (tl, ts_t), pos in list(_open_pairs.items()):
        ca = closes.get(tl)
        cb = closes.get(ts_t)
        if not ca or not cb:
            continue
        z = compute_spread_zscore(ca, cb)
        if z is None:
            continue
        exit_flag, exit_reason = should_exit_pair(tl, ts_t, z, pos["entry_ts"])
        if exit_flag:
            signals.append({
                "action": "EXIT_PAIR",
                "ticker_long": tl,
                "ticker_short": ts_t,
                "z": z,
                "reason": exit_reason,
                "confidence": 90,
                "strategy": "pairs_trading",
            })

    # Scan for new entry signals (skip if pair already open)
    for ticker_a, ticker_b in CANDIDATE_PAIRS:
        if (ticker_a, ticker_b) in _open_pairs or (ticker_b, ticker_a) in _open_pairs:
            continue
        ca = closes.get(ticker_a)
        cb = closes.get(ticker_b)
        if not ca or not cb:
            continue
        z = compute_spread_zscore(ca, cb)
        corr = compute_correlation(ca, cb)
        if z is None or corr is None:
            continue
        long_t, short_t, confidence, reason = score_pair(ticker_a, ticker_b, z, corr)
        if long_t and confidence > 0:
            price_long  = prices.get(long_t,  ca[-1] if long_t == ticker_a else cb[-1])
            price_short = prices.get(short_t, ca[-1] if short_t == ticker_a else cb[-1])
            signals.append({
                "action": "ENTER_PAIR",
                "ticker_long": long_t,
                "ticker_short": short_t,
                "price_long": price_long,
                "price_short": price_short,
                "z": z,
                "correlation": corr,
                "reason": reason,
                "confidence": confidence,
                "strategy": "pairs_trading",
            })

    return signals


def register_pair_opened(ticker_long: str, ticker_short: str, z: float):
    """Call after a pairs position is successfully entered."""
    _open_pairs[(ticker_long, ticker_short)] = {
        "entry_z": z,
        "entry_ts": time.time(),
    }


def register_pair_closed(ticker_long: str, ticker_short: str):
    """Call after a pairs position is fully exited."""
    _open_pairs.pop((ticker_long, ticker_short), None)


def get_open_pairs() -> List[Dict[str, Any]]:
    return [
        {
            "ticker_long": tl,
            "ticker_short": ts,
            "entry_z": pos["entry_z"],
            "entry_ts": pos["entry_ts"],
            "hold_days": round((time.time() - pos["entry_ts"]) / 86400, 1),
        }
        for (tl, ts), pos in _open_pairs.items()
    ]
