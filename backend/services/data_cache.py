"""
Local data cache for faster ML training.

Instead of fetching 504 days × 14 tickers from Yahoo Finance (~60s),
load from local SQLite cache (~0.5s).

Update strategy:
- First run: fetch from Yahoo, save to cache (60s)
- Subsequent runs: load from cache (0.5s) — 120x faster!
- Daily refresh: update only new data if market opened today
"""
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parents[1]
CACHE_DB = BASE_DIR / "ml_data_cache.sqlite3"


class DataCache:
    """SQLite-backed cache for historical OHLCV data."""

    def __init__(self, db_path: str = str(CACHE_DB)):
        self.db_path = db_path
        self.init_db()

    def init_db(self):
        """Create tables if they don't exist."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS ohlcv (
                    ticker TEXT NOT NULL,
                    date TEXT NOT NULL,
                    open REAL, high REAL, low REAL, close REAL, volume REAL,
                    PRIMARY KEY (ticker, date)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS cache_meta (
                    ticker TEXT PRIMARY KEY,
                    last_update TEXT,
                    last_close_date TEXT
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_ticker_date ON ohlcv(ticker, date)")
            conn.commit()

    def save_history(self, ticker: str, ohlcv_list: List[Dict]) -> int:
        """
        Save historical OHLCV data for ticker.
        Returns number of rows saved.
        """
        with sqlite3.connect(self.db_path) as conn:
            rows_saved = 0
            for row in ohlcv_list:
                conn.execute(
                    "INSERT OR REPLACE INTO ohlcv (ticker, date, open, high, low, close, volume) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (ticker, row.get('date'), row.get('open'), row.get('high'),
                     row.get('low'), row.get('close'), row.get('volume'))
                )
                rows_saved += 1

            # Update metadata
            last_date = ohlcv_list[-1].get('date') if ohlcv_list else None
            conn.execute(
                "INSERT OR REPLACE INTO cache_meta (ticker, last_update, last_close_date) "
                "VALUES (?, ?, ?)",
                (ticker, datetime.now(timezone.utc).isoformat(), last_date)
            )
            conn.commit()

        logger.info(f"[DataCache] Saved {rows_saved} rows for {ticker}")
        return rows_saved

    def load_history(self, ticker: str, days: int = 504) -> List[Dict]:
        """
        Load cached historical data for ticker (instant!).
        Returns list of OHLCV dicts, newest first.
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT date, open, high, low, close, volume FROM ohlcv "
                "WHERE ticker = ? ORDER BY date DESC LIMIT ?",
                (ticker, days)
            ).fetchall()

        # Reverse to get oldest first (chronological order)
        return [dict(r) for r in reversed(rows)]

    def get_cached_count(self, ticker: str) -> int:
        """Get number of cached rows for ticker."""
        with sqlite3.connect(self.db_path) as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM ohlcv WHERE ticker = ?", (ticker,)
            ).fetchone()[0]
        return count

    def is_stale(self, ticker: str, max_age_hours: int = 24) -> bool:
        """Check if cached data is older than max_age_hours."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT last_update FROM cache_meta WHERE ticker = ?", (ticker,)
            ).fetchone()

        if not row:
            return True  # Never cached

        try:
            last_update = datetime.fromisoformat(row['last_update'])
            age = datetime.now(timezone.utc) - last_update
            is_old = age.total_seconds() > max_age_hours * 3600

            if is_old:
                logger.info(f"[DataCache] {ticker} stale: {age.total_seconds()/3600:.1f}h old")

            return is_old
        except Exception as e:
            logger.warning(f"[DataCache] Error checking staleness for {ticker}: {e}")
            return True

    def clear_ticker(self, ticker: str):
        """Delete all cached data for a ticker (for manual refresh)."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM ohlcv WHERE ticker = ?", (ticker,))
            conn.execute("DELETE FROM cache_meta WHERE ticker = ?", (ticker,))
            conn.commit()
        logger.info(f"[DataCache] Cleared cache for {ticker}")

    def clear_all(self):
        """Delete entire cache (careful!)."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM ohlcv")
            conn.execute("DELETE FROM cache_meta")
            conn.commit()
        logger.warning("[DataCache] Cleared ALL cache")

    def get_stats(self) -> Dict:
        """Get cache statistics."""
        with sqlite3.connect(self.db_path) as conn:
            total_rows = conn.execute("SELECT COUNT(*) FROM ohlcv").fetchone()[0]
            total_tickers = conn.execute("SELECT COUNT(*) FROM cache_meta").fetchone()[0]

            # Size in MB
            size_mb = CACHE_DB.stat().st_size / (1024 * 1024) if CACHE_DB.exists() else 0

        return {
            "total_rows": total_rows,
            "total_tickers": total_tickers,
            "size_mb": round(size_mb, 2),
            "cache_file": str(CACHE_DB),
        }


# Singleton instance
_cache_instance: Optional[DataCache] = None


def get_cache() -> DataCache:
    """Get or create the cache instance."""
    global _cache_instance
    if _cache_instance is None:
        _cache_instance = DataCache()
    return _cache_instance


async def cached_fetch_history(
    ticker: str,
    days: int = 504,
    refresh: bool = False,
    fetch_fn = None,  # fetch_history function from backtester
) -> Dict:
    """
    Fetch historical data with caching.

    Flow:
    1. If cached and not stale: load from cache (instant)
    2. If missing or stale: fetch from Yahoo, save to cache
    3. Return data

    Usage:
        hist = await cached_fetch_history('NVDA', 504, fetch_fn=fetch_history)
    """
    cache = get_cache()

    # Option 1: Force refresh
    if refresh:
        logger.info(f"[CachedFetch] Force refresh: {ticker}")
        if fetch_fn is None:
            raise ValueError("fetch_fn required for refresh")
        hist = await fetch_fn(ticker, days)
        cache.save_history(ticker, hist.get('ohlcv', []))
        return hist

    # Option 2: Try cache first
    if not cache.is_stale(ticker):
        cached_data = cache.load_history(ticker, days)
        if len(cached_data) >= days * 0.9:  # At least 90% of requested days
            logger.info(f"[CachedFetch] Cache hit: {ticker} ({len(cached_data)} rows)")
            return {
                'closes': [d['close'] for d in cached_data],
                'volumes': [d['volume'] for d in cached_data],
                'highs': [d['high'] for d in cached_data],
                'lows': [d['low'] for d in cached_data],
                'dates': [d['date'] for d in cached_data],
                'source': 'cache',
            }

    # Option 3: Fetch and cache
    if fetch_fn is None:
        raise ValueError("fetch_fn required for cache miss")

    logger.info(f"[CachedFetch] Cache miss: fetching {ticker}")
    hist = await fetch_fn(ticker, days)

    # Format and save
    if hist and 'closes' in hist:
        ohlcv_list = [
            {
                'date': d,
                'open': hist['opens'][i],
                'high': hist['highs'][i],
                'low': hist['lows'][i],
                'close': hist['closes'][i],
                'volume': hist['volumes'][i],
            }
            for i, d in enumerate(hist.get('dates', []))
        ]
        cache.save_history(ticker, ohlcv_list)

    return hist
