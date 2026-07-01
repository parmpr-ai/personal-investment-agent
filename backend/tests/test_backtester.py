"""Unit tests for backtester — signal arrays and metric computation (no network)."""
import numpy as np
import pytest

from services.backtester import (
    _ema, _sma, _rsi, _atr, _zscore, _rvol,
    compute_signal_arrays, compute_metrics,
)


def make_arrays(n: int = 100, start: float = 100.0, drift: float = 0.001):
    """Deterministic price series."""
    import math
    closes = [start]
    for i in range(1, n):
        closes.append(closes[-1] * (1 + drift + 0.003 * math.sin(i * 0.4)))
    c = np.array(closes)
    h = c * 1.01
    l = c * 0.99
    v = np.full(n, 1_000_000.0)
    return c, h, l, v


class TestEMA:
    def test_output_length_matches_input(self):
        data = np.arange(50.0)
        result = _ema(data, 12)
        assert len(result) == 50

    def test_first_values_are_nan(self):
        data = np.arange(50.0)
        result = _ema(data, 12)
        assert np.isnan(result[:11]).all()

    def test_ema_greater_zero(self):
        data = np.arange(1.0, 51.0)
        result = _ema(data, 12)
        assert np.nanmin(result) > 0


class TestSMA:
    def test_correct_average(self):
        data = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        sma = _sma(data, 3)
        assert abs(sma[-1] - 4.0) < 1e-9  # mean of [3,4,5]

    def test_length_preserved(self):
        data = np.ones(50)
        assert len(_sma(data, 10)) == 50


class TestRSI:
    def test_range_0_to_100(self):
        c, _, _, _ = make_arrays(60)
        rsi = _rsi(c)
        valid = rsi[~np.isnan(rsi)]
        assert (valid >= 0).all()
        assert (valid <= 100).all()

    def test_default_output_length(self):
        c, _, _, _ = make_arrays(60)
        assert len(_rsi(c, 14)) == 60


class TestATR:
    def test_positive_values(self):
        c, h, l, _ = make_arrays(60)
        atr = _atr(h, l, c)
        assert (atr[15:] > 0).all()  # after warmup

    def test_length_matches_input(self):
        c, h, l, _ = make_arrays(60)
        assert len(_atr(h, l, c)) == 60


class TestZScore:
    def test_flat_series_returns_zero(self):
        c = np.full(50, 100.0)
        z = _zscore(c)
        assert (np.abs(z[20:]) < 1e-9).all()

    def test_trending_series_has_nonzero_zscore(self):
        c, _, _, _ = make_arrays(60, drift=0.01)
        z = _zscore(c)
        assert np.abs(z[-1]) > 0


class TestRVOL:
    def test_flat_volume_returns_one(self):
        v = np.full(50, 1_000_000.0)
        rv = _rvol(v)
        assert np.allclose(rv[10:], 1.0)

    def test_spike_returns_above_one(self):
        v = np.full(50, 1_000_000.0)
        v[-1] = 5_000_000.0
        rv = _rvol(v)
        assert rv[-1] > 1.0


class TestComputeSignalArrays:
    def setup_method(self):
        self.c, self.h, self.l, self.v = make_arrays(120)

    def test_returns_dict_with_expected_keys(self):
        sig = compute_signal_arrays(self.c, self.v, self.h, self.l)
        for key in ("sma20", "sma50", "rsi", "rvol", "atr", "zscore",
                    "macd_line", "macd_bullish", "change_pct"):
            assert key in sig, f"Missing key: {key}"

    def test_above_sma20_is_boolean_array(self):
        sig = compute_signal_arrays(self.c, self.v, self.h, self.l)
        assert sig["above_sma20"].dtype == bool

    def test_all_arrays_same_length(self):
        sig = compute_signal_arrays(self.c, self.v, self.h, self.l)
        n = len(self.c)
        for k, v in sig.items():
            if hasattr(v, "__len__"):
                assert len(v) == n, f"Length mismatch for {k}: {len(v)} != {n}"

    def test_rsi_range(self):
        sig = compute_signal_arrays(self.c, self.v, self.h, self.l)
        assert (sig["rsi"] >= 0).all()
        assert (sig["rsi"] <= 100).all()


class TestComputeMetrics:
    def _make_result(self, equity, trades=None):
        return {
            "equity_curve": equity,
            "trades": trades or [],
            "strategy": "test_strategy",
        }

    def _dates(self, n):
        return [f"2024-01-{i+1:02d}" for i in range(n)]

    def test_returns_sharpe_for_profitable_equity(self):
        import math
        # Add realistic variance so std is non-zero
        equity = [100_000 * (1.001 ** i) * (1 + 0.005 * math.sin(i * 0.7)) for i in range(252)]
        result = compute_metrics(self._make_result(equity), self._dates(252))
        assert "sharpe" in result
        assert result["sharpe"] > 0

    def test_returns_error_for_single_point(self):
        result = compute_metrics(self._make_result([100_000]), self._dates(1))
        assert "error" in result

    def test_win_rate_calculation(self):
        trades = [
            {"win": True, "pnl_pct": 5.0},
            {"win": True, "pnl_pct": 3.0},
            {"win": False, "pnl_pct": -2.0},
            {"win": False, "pnl_pct": -1.0},
        ]
        equity = [100_000 + i * 100 for i in range(252)]
        result = compute_metrics(self._make_result(equity, trades), self._dates(252))
        assert result["win_rate"] == 50.0
        assert result["total_trades"] == 4

    def test_max_dd_is_negative(self):
        # Drawdown: goes up then crashes
        equity = [100_000 + i * 200 for i in range(126)] + \
                 [100_000 + (125 - i) * 200 for i in range(126)]
        result = compute_metrics(self._make_result(equity), self._dates(252))
        assert result["max_dd_pct"] < 0

    def test_positive_return_gives_positive_total_return(self):
        equity = [100_000 * (1.001 ** i) for i in range(252)]
        result = compute_metrics(self._make_result(equity), self._dates(252))
        assert result["total_return_pct"] > 0

    def test_regime_stats_populated_from_trades(self):
        trades = [
            {"win": True, "pnl_pct": 3.0, "entry_regime": "BULL_TREND"},
            {"win": False, "pnl_pct": -2.0, "entry_regime": "BULL_TREND"},
            {"win": True, "pnl_pct": 5.0, "entry_regime": "BEAR_TREND"},
        ]
        equity = [100_000 + i * 50 for i in range(252)]
        result = compute_metrics(self._make_result(equity, trades), self._dates(252))
        assert "BULL_TREND" in result["regime_stats"]
        assert result["regime_stats"]["BULL_TREND"]["trades"] == 2
