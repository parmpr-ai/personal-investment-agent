"""Shared fixtures for all test modules."""
import sys
import os
import pytest

# Add backend root to path so imports work without install
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def make_closes(n: int = 60, start: float = 100.0, drift: float = 0.001) -> list:
    """Deterministic synthetic price series — no randomness."""
    import math
    closes = [start]
    for i in range(1, n):
        closes.append(round(closes[-1] * (1 + drift + 0.005 * math.sin(i * 0.3)), 4))
    return closes


def make_ohlcv(n: int = 60):
    closes = make_closes(n)
    highs  = [c * 1.01 for c in closes]
    lows   = [c * 0.99 for c in closes]
    return highs, lows, closes
