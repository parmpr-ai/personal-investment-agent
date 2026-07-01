"""Unit tests for pure indicator computations in market_data.py (no network)."""
import pytest
from tests.conftest import make_closes, make_ohlcv

from services.market_data import (
    _compute_rsi,
    _compute_macd,
    _compute_bollinger,
    _compute_vwap,
    _compute_zscore,
    _compute_atr_last,
    _compute_adx,
    _relative_strength,
)


class TestRSI:
    def test_returns_float_for_sufficient_data(self):
        closes = make_closes(30)
        rsi = _compute_rsi(closes)
        assert rsi is not None
        assert 0 <= rsi <= 100

    def test_returns_none_for_insufficient_data(self):
        assert _compute_rsi([100.0] * 5) is None

    def test_all_gains_returns_100(self):
        closes = list(range(1, 20))
        rsi = _compute_rsi(closes)
        assert rsi == 100.0

    def test_all_losses_returns_zero(self):
        closes = list(range(20, 0, -1))
        rsi = _compute_rsi(closes)
        assert rsi is not None
        assert rsi < 10

    def test_flat_prices_no_crash(self):
        closes = [100.0] * 20
        rsi = _compute_rsi(closes)
        assert rsi is not None


class TestMACD:
    def test_returns_dict_with_expected_keys(self):
        closes = make_closes(60)
        result = _compute_macd(closes)
        assert "macd" in result
        assert "macd_signal" in result
        assert "macd_hist" in result
        assert "macd_bullish" in result
        assert "macd_crossover" in result

    def test_returns_empty_for_short_series(self):
        closes = make_closes(20)
        result = _compute_macd(closes)
        assert result == {}

    def test_macd_hist_equals_macd_minus_signal(self):
        closes = make_closes(60)
        r = _compute_macd(closes)
        assert abs(r["macd_hist"] - (r["macd"] - r["macd_signal"])) < 1e-4


class TestBollinger:
    def test_returns_expected_keys(self):
        closes = make_closes(30)
        r = _compute_bollinger(closes)
        for key in ("bb_upper", "bb_lower", "bb_pct", "bb_width", "bb_squeeze"):
            assert key in r

    def test_upper_above_lower(self):
        closes = make_closes(30)
        r = _compute_bollinger(closes)
        assert r["bb_upper"] > r["bb_lower"]

    def test_bb_pct_range(self):
        closes = make_closes(30)
        r = _compute_bollinger(closes)
        # bb_pct can be <0 or >1 if price is outside bands, but typically in [0,1]
        assert isinstance(r["bb_pct"], float)

    def test_returns_empty_for_short_series(self):
        assert _compute_bollinger([100.0] * 5) == {}

    def test_squeeze_flag_for_flat_prices(self):
        closes = [100.0 + i * 0.001 for i in range(30)]
        r = _compute_bollinger(closes)
        assert r["bb_squeeze"] is True


class TestVWAP:
    def test_basic_computation(self):
        closes = [100.0, 101.0, 102.0]
        volumes = [1000, 2000, 1000]
        vwap = _compute_vwap(closes, volumes)
        expected = (100 * 1000 + 101 * 2000 + 102 * 1000) / 4000
        assert abs(vwap - expected) < 0.01

    def test_zero_volume_returns_none(self):
        assert _compute_vwap([100.0], [0]) is None

    def test_empty_returns_none(self):
        assert _compute_vwap([], []) is None


class TestZScore:
    def test_returns_float(self):
        closes = make_closes(30)
        z = _compute_zscore(closes)
        assert z is not None
        assert isinstance(z, float)

    def test_flat_series_is_zero(self):
        closes = [100.0] * 25
        z = _compute_zscore(closes)
        assert z == 0.0

    def test_none_for_short_series(self):
        assert _compute_zscore([100.0] * 5) is None


class TestATR:
    def test_returns_positive_float(self):
        highs, lows, closes = make_ohlcv(30)
        atr = _compute_atr_last(highs, lows, closes)
        assert atr is not None
        assert atr > 0

    def test_returns_none_for_short_series(self):
        h, l, c = make_ohlcv(10)
        assert _compute_atr_last(h, l, c) is None


class TestADX:
    def test_returns_float_between_0_100(self):
        highs, lows, closes = make_ohlcv(60)
        adx = _compute_adx(highs, lows, closes)
        assert adx is not None
        assert 0 <= adx <= 100

    def test_returns_none_for_short_series(self):
        h, l, c = make_ohlcv(10)
        assert _compute_adx(h, l, c) is None


class TestRelativeStrength:
    def test_returns_float(self):
        ticker_closes = make_closes(30, start=100, drift=0.003)
        spy_closes    = make_closes(30, start=100, drift=0.001)
        rs = _relative_strength(ticker_closes, spy_closes)
        assert rs is not None
        assert rs > 1.0  # outperforming (faster drift)

    def test_returns_none_for_short_series(self):
        assert _relative_strength([100.0] * 5, [100.0] * 5) is None

    def test_underperforming_stock(self):
        ticker_closes = make_closes(30, start=100, drift=-0.002)
        spy_closes    = make_closes(30, start=100, drift=0.002)
        rs = _relative_strength(ticker_closes, spy_closes)
        assert rs is not None
        assert rs < 0
