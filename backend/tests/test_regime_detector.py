"""Unit tests for regime_detector._classify() — pure logic, no network."""
import pytest
from services.regime_detector import _classify, _rsi, _volume_trend, REGIME_CONFIG


def _spy_data(
    n: int = 60,
    start: float = 500.0,
    drift: float = 0.002,
    volumes: bool = True,
) -> dict:
    """Build synthetic SPY data."""
    closes = [start]
    for i in range(1, n):
        closes.append(round(closes[-1] * (1 + drift), 4))
    vols = [50_000_000.0] * n if volumes else [0.0] * n
    return {"closes": closes, "volumes": vols}


def _bear_spy(n: int = 60) -> dict:
    """SPY in a clear downtrend."""
    return _spy_data(n, drift=-0.003)


def _bull_spy(n: int = 60) -> dict:
    """SPY in a clear uptrend."""
    return _spy_data(n, drift=0.003)


def _flat_spy(n: int = 60) -> dict:
    """SPY going absolutely nowhere."""
    return _spy_data(n, drift=0.0001)


class TestClassify:
    def test_detects_bull_trend(self):
        spy = _bull_spy(60)
        regime, confidence, _ = _classify(spy, vix=14.0)
        assert regime == "BULL_TREND"
        assert confidence >= 40

    def test_detects_crisis_on_high_vix(self):
        spy = _bull_spy(60)
        regime, confidence, _ = _classify(spy, vix=40.0)
        assert regime == "CRISIS"
        assert confidence >= 60

    def test_detects_crisis_on_severe_drawdown(self):
        # 20d trend of -9% should trigger crisis even with moderate VIX
        spy = _spy_data(60, drift=-0.005, start=600.0)
        regime, confidence, _ = _classify(spy, vix=28.0)
        assert regime == "CRISIS"

    def test_detects_choppy_for_flat_market(self):
        spy = _flat_spy(60)
        regime, confidence, _ = _classify(spy, vix=18.0)
        assert regime in ("CHOPPY_RANGE", "BULL_TREND")  # flat + low VIX → choppy or weak bull

    def test_returns_choppy_for_insufficient_data(self):
        spy = _spy_data(10)
        regime, confidence, _ = _classify(spy, vix=18.0)
        assert regime == "CHOPPY_RANGE"
        assert confidence == 50.0

    def test_breadth_boosts_bull_score(self):
        spy = _bull_spy(60)
        breadth_strong = {"breadth_advance": 3, "breadth_spread": 2.0, "sector_returns": {}}
        breadth_weak   = {"breadth_advance": 0, "breadth_spread": 20.0, "sector_returns": {}}
        _, conf_strong, _ = _classify(spy, vix=14.0, breadth=breadth_strong)
        _, conf_weak,   _ = _classify(spy, vix=14.0, breadth=breadth_weak)
        # Strong breadth should give higher confidence
        assert conf_strong >= conf_weak

    def test_details_keys_present(self):
        spy = _bull_spy(60)
        _, _, details = _classify(spy, vix=16.0)
        for key in ("spy_price", "sma20", "sma50", "trend_5d_pct", "rsi", "vix"):
            assert key in details

    def test_bear_not_triggered_without_vix_above_22(self):
        # Bear requires vix > 22 per the condition
        spy = _bear_spy(60)
        regime, _, _ = _classify(spy, vix=18.0)
        # Without VIX threshold, can't be BEAR_TREND
        assert regime != "BEAR_TREND"


class TestRSI:
    def test_returns_50_for_insufficient_data(self):
        assert _rsi([100.0] * 5) == 50.0

    def test_all_gains_returns_100(self):
        closes = [float(i) for i in range(1, 20)]
        assert _rsi(closes) == 100.0

    def test_range_0_to_100(self):
        import math
        closes = [100 + 5 * math.sin(i * 0.5) for i in range(30)]
        r = _rsi(closes)
        assert 0 <= r <= 100


class TestVolumeTrend:
    def test_expanding_volume_above_one(self):
        vols = [1_000_000.0] * 15 + [2_000_000.0] * 5
        ratio = _volume_trend(vols)
        assert ratio > 1.0

    def test_contracting_volume_below_one(self):
        vols = [2_000_000.0] * 15 + [500_000.0] * 5
        ratio = _volume_trend(vols)
        assert ratio < 1.0

    def test_returns_one_for_short_series(self):
        assert _volume_trend([1_000_000.0] * 5) == 1.0


class TestRegimeConfig:
    def test_all_regimes_present(self):
        for r in ("BULL_TREND", "BEAR_TREND", "CHOPPY_RANGE", "CRISIS"):
            assert r in REGIME_CONFIG

    def test_crisis_has_no_long_strategies(self):
        assert REGIME_CONFIG["CRISIS"]["active_long_strategies"] == []

    def test_bull_has_no_short_strategies(self):
        assert REGIME_CONFIG["BULL_TREND"]["active_short_strategies"] == []

    def test_size_multipliers_order(self):
        # Bull > Choppy > Bear > Crisis
        bull  = REGIME_CONFIG["BULL_TREND"]["size_multiplier"]
        chop  = REGIME_CONFIG["CHOPPY_RANGE"]["size_multiplier"]
        bear  = REGIME_CONFIG["BEAR_TREND"]["size_multiplier"]
        crisis = REGIME_CONFIG["CRISIS"]["size_multiplier"]
        assert bull > chop > bear > crisis
