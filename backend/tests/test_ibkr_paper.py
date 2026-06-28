"""
Unit tests for IBKR paper trading integration.

All tests run without a real IBKR connection — ib_insync and socket are
fully mocked so the suite passes in CI and dev environments where TWS/IB
Gateway is not running.

Coverage:
  - _get_connection_params: paper vs live mode, env/settings overrides
  - IBKRTrader.connection_test: socket reachable / unreachable paths
  - IBKRTrader.place_order: action mapping, validation, success, failure
  - IBKRTrader.cancel_all: success, connection failure
  - IBKRTrader.get_account_summary: success, connection failure
  - Module-level convenience functions
"""
import sys
import types
import pytest
from unittest.mock import MagicMock, patch, PropertyMock


# ── Fixtures & helpers ────────────────────────────────────────────────────────

def _make_ib_insync_mock():
    """Return a minimal ib_insync module stub so import succeeds without the pkg."""
    mock_mod = types.ModuleType("ib_insync")

    class FakeOrderStatus:
        status = "Submitted"
        filled = 5
        avgFillPrice = 150.25

    class FakeOrder:
        orderId = 42

    class FakeTrade:
        order = FakeOrder()
        orderStatus = FakeOrderStatus()

    class FakeIB:
        def connect(self, host, port, clientId, readonly, timeout): pass
        def isConnected(self): return True
        def disconnect(self): pass
        def qualifyContracts(self, *args): pass
        def placeOrder(self, contract, order): return FakeTrade()
        def sleep(self, seconds): pass
        def openTrades(self): return [FakeTrade()]
        def cancelOrder(self, order): pass
        def accountSummary(self):
            values = [
                MagicMock(tag="NetLiquidation", value="125000.00"),
                MagicMock(tag="TotalCashValue", value="50000.00"),
                MagicMock(tag="BuyingPower", value="200000.00"),
                MagicMock(tag="UnrealizedPnL", value="3500.00"),
                MagicMock(tag="RealizedPnL", value="750.00"),
            ]
            return values

    class FakeStock:
        def __init__(self, ticker, exchange, currency): pass

    class FakeMarketOrder:
        def __init__(self, action, qty): pass

    class FakeLimitOrder:
        def __init__(self, action, qty, price): pass

    class FakeUtil:
        @staticmethod
        def startLoop(): pass

    mock_mod.IB = FakeIB
    mock_mod.Stock = FakeStock
    mock_mod.MarketOrder = FakeMarketOrder
    mock_mod.LimitOrder = FakeLimitOrder
    mock_mod.util = FakeUtil()
    return mock_mod


def _import_trader_with_mock():
    """
    Import ibkr_trader with ib_insync stubbed out.
    Re-imports each time so tests get a fresh module state.
    """
    stub = _make_ib_insync_mock()
    # Patch ib_insync in sys.modules so the lazy `from ib_insync import ...` inside
    # IBKRTrader methods picks up the stub.
    with patch.dict(sys.modules, {"ib_insync": stub}):
        # Force fresh import
        if "services.ibkr_trader" in sys.modules:
            del sys.modules["services.ibkr_trader"]
        import services.ibkr_trader as m
        return m, stub


# ── _get_connection_params ────────────────────────────────────────────────────

class TestGetConnectionParams:
    def test_paper_mode_uses_paper_port(self):
        from services.ibkr_trader import _get_connection_params
        params = _get_connection_params("ibkr_paper")
        assert params["port"] in (4002, 7497)

    def test_live_mode_uses_live_port(self):
        from services.ibkr_trader import _get_connection_params
        params = _get_connection_params("ibkr_live")
        assert params["port"] in (4001, 7496)

    def test_settings_override_paper_port(self):
        from services.ibkr_trader import _get_connection_params
        settings = {"ibkr": {"host": "10.0.0.1", "paper_port": 9999}}
        params = _get_connection_params("ibkr_paper", settings)
        assert params["port"] == 9999
        assert params["host"] == "10.0.0.1"

    def test_settings_override_live_port(self):
        from services.ibkr_trader import _get_connection_params
        settings = {"ibkr": {"port": 8888}}
        params = _get_connection_params("ibkr_live", settings)
        assert params["port"] == 8888

    def test_env_var_overrides_default(self):
        from services.ibkr_trader import _get_connection_params
        with patch.dict("os.environ", {"IBKR_PAPER_PORT": "5555"}):
            params = _get_connection_params("ibkr_paper")
        assert params["port"] == 5555

    def test_client_id_is_agent_id(self):
        from services.ibkr_trader import _get_connection_params, _AGENT_CLIENT_ID
        params = _get_connection_params("ibkr_paper")
        assert params["client_id"] == _AGENT_CLIENT_ID

    def test_default_host_is_localhost(self):
        from services.ibkr_trader import _get_connection_params
        params = _get_connection_params("ibkr_paper")
        assert params["host"] in ("127.0.0.1", "localhost")


# ── connection_test ───────────────────────────────────────────────────────────

class TestConnectionTest:
    def test_returns_reachable_true_when_port_open(self):
        from services.ibkr_trader import IBKRTrader
        trader = IBKRTrader()
        mock_sock = MagicMock()
        mock_sock.__enter__ = MagicMock(return_value=mock_sock)
        mock_sock.__exit__ = MagicMock(return_value=False)
        with patch("socket.create_connection", return_value=mock_sock):
            result = trader.connection_test("ibkr_paper")
        assert result["ok"] is True
        assert result["reachable"] is True
        assert result["mode"] == "ibkr_paper"
        assert "port" in result
        assert "host" in result

    def test_returns_reachable_false_when_port_closed(self):
        from services.ibkr_trader import IBKRTrader
        trader = IBKRTrader()
        with patch("socket.create_connection", side_effect=OSError("Connection refused")):
            result = trader.connection_test("ibkr_paper")
        assert result["ok"] is False
        assert result["reachable"] is False
        assert "hint" in result
        assert "message" in result

    def test_hint_includes_port_number(self):
        from services.ibkr_trader import IBKRTrader
        trader = IBKRTrader()
        with patch("socket.create_connection", side_effect=OSError("refused")):
            result = trader.connection_test("ibkr_paper")
        assert str(result["port"]) in result["hint"]

    def test_success_message_mentions_paper(self):
        from services.ibkr_trader import IBKRTrader
        trader = IBKRTrader()
        mock_sock = MagicMock()
        mock_sock.__enter__ = MagicMock(return_value=mock_sock)
        mock_sock.__exit__ = MagicMock(return_value=False)
        with patch("socket.create_connection", return_value=mock_sock):
            result = trader.connection_test("ibkr_paper")
        assert "paper" in result["message"].lower()


# ── place_order ───────────────────────────────────────────────────────────────

class TestPlaceOrder:
    def _get_trader_with_mock(self):
        mod, stub = _import_trader_with_mock()
        trader = mod.IBKRTrader()
        return trader, mod, stub

    def test_buy_maps_to_ibkr_buy(self):
        trader, mod, stub = self._get_trader_with_mock()
        with patch.dict(sys.modules, {"ib_insync": stub}):
            result = trader.place_order("AAPL", "BUY", 10, 150.0, mode="ibkr_paper")
        assert result["ok"] is True
        assert result["ibkr_action"] == "BUY"
        assert result["action"] == "BUY"

    def test_sell_maps_to_ibkr_sell(self):
        trader, mod, stub = self._get_trader_with_mock()
        with patch.dict(sys.modules, {"ib_insync": stub}):
            result = trader.place_order("AAPL", "SELL", 10, 150.0, mode="ibkr_paper")
        assert result["ok"] is True
        assert result["ibkr_action"] == "SELL"

    def test_short_maps_to_ibkr_sell(self):
        trader, mod, stub = self._get_trader_with_mock()
        with patch.dict(sys.modules, {"ib_insync": stub}):
            result = trader.place_order("TSLA", "SHORT", 5, 200.0, mode="ibkr_paper")
        assert result["ok"] is True
        assert result["ibkr_action"] == "SELL"
        assert result["action"] == "SHORT"

    def test_cover_maps_to_ibkr_buy(self):
        trader, mod, stub = self._get_trader_with_mock()
        with patch.dict(sys.modules, {"ib_insync": stub}):
            result = trader.place_order("TSLA", "COVER", 5, 200.0, mode="ibkr_paper")
        assert result["ok"] is True
        assert result["ibkr_action"] == "BUY"
        assert result["action"] == "COVER"

    def test_unknown_action_returns_error(self):
        trader, mod, stub = self._get_trader_with_mock()
        with patch.dict(sys.modules, {"ib_insync": stub}):
            result = trader.place_order("AAPL", "HODL", 10, 150.0, mode="ibkr_paper")
        assert result["ok"] is False
        assert "Unknown action" in result["error"]

    def test_zero_qty_returns_error(self):
        trader, mod, stub = self._get_trader_with_mock()
        with patch.dict(sys.modules, {"ib_insync": stub}):
            result = trader.place_order("AAPL", "BUY", 0, 150.0, mode="ibkr_paper")
        assert result["ok"] is False
        assert "Invalid" in result["error"]

    def test_negative_price_returns_error(self):
        trader, mod, stub = self._get_trader_with_mock()
        with patch.dict(sys.modules, {"ib_insync": stub}):
            result = trader.place_order("AAPL", "BUY", 10, -1.0, mode="ibkr_paper")
        assert result["ok"] is False

    def test_connection_failure_returns_ok_false(self):
        from services.ibkr_trader import IBKRTrader
        trader = IBKRTrader()
        # No ib_insync → _connect raises ConnectionError → place_order catches and returns ok=False
        result = trader.place_order("AAPL", "BUY", 10, 150.0, mode="ibkr_paper")
        assert result["ok"] is False
        assert "error" in result
        assert result["ticker"] == "AAPL"

    def test_successful_order_has_required_fields(self):
        trader, mod, stub = self._get_trader_with_mock()
        with patch.dict(sys.modules, {"ib_insync": stub}):
            result = trader.place_order("NVDA", "BUY", 3, 500.0, mode="ibkr_paper")
        assert result["ok"] is True
        for field in ("ticker", "action", "ibkr_action", "qty_requested",
                      "qty_filled", "avg_fill_price", "order_id", "status",
                      "mode", "source", "ts"):
            assert field in result, f"missing field: {field}"

    def test_source_is_ibkr(self):
        trader, mod, stub = self._get_trader_with_mock()
        with patch.dict(sys.modules, {"ib_insync": stub}):
            result = trader.place_order("MSFT", "BUY", 2, 350.0, mode="ibkr_paper")
        assert result["source"] == "IBKR"

    def test_mode_ibkr_paper_in_result(self):
        trader, mod, stub = self._get_trader_with_mock()
        with patch.dict(sys.modules, {"ib_insync": stub}):
            result = trader.place_order("MSFT", "BUY", 2, 350.0, mode="ibkr_paper")
        assert result["mode"] == "ibkr_paper"

    def test_limit_order_type_accepted(self):
        trader, mod, stub = self._get_trader_with_mock()
        with patch.dict(sys.modules, {"ib_insync": stub}):
            result = trader.place_order("AAPL", "BUY", 5, 175.0,
                                        order_type="LMT", mode="ibkr_paper")
        assert result["ok"] is True

    def test_action_case_insensitive(self):
        trader, mod, stub = self._get_trader_with_mock()
        with patch.dict(sys.modules, {"ib_insync": stub}):
            result = trader.place_order("AAPL", "buy", 5, 175.0, mode="ibkr_paper")
        assert result["ok"] is True
        assert result["ibkr_action"] == "BUY"


# ── cancel_all ────────────────────────────────────────────────────────────────

class TestCancelAll:
    def test_cancel_all_returns_count_when_connected(self):
        mod, stub = _import_trader_with_mock()
        trader = mod.IBKRTrader()
        with patch.dict(sys.modules, {"ib_insync": stub}):
            result = trader.cancel_all(mode="ibkr_paper")
        assert result["ok"] is True
        assert "cancelled" in result
        assert isinstance(result["cancelled"], int)

    def test_cancel_all_returns_ok_false_when_no_connection(self):
        from services.ibkr_trader import IBKRTrader
        trader = IBKRTrader()
        # ib_insync not importable → ConnectionError caught
        result = trader.cancel_all(mode="ibkr_paper")
        assert result["ok"] is False
        assert "error" in result


# ── get_account_summary ───────────────────────────────────────────────────────

class TestGetAccountSummary:
    def test_returns_account_fields_when_connected(self):
        mod, stub = _import_trader_with_mock()
        trader = mod.IBKRTrader()
        with patch.dict(sys.modules, {"ib_insync": stub}):
            result = trader.get_account_summary(mode="ibkr_paper")
        assert result["ok"] is True
        for field in ("net_liquidation", "cash", "buying_power",
                      "unrealized_pnl", "realized_pnl", "ts"):
            assert field in result, f"missing field: {field}"

    def test_net_liquidation_is_numeric(self):
        mod, stub = _import_trader_with_mock()
        trader = mod.IBKRTrader()
        with patch.dict(sys.modules, {"ib_insync": stub}):
            result = trader.get_account_summary(mode="ibkr_paper")
        assert isinstance(result["net_liquidation"], float)
        assert result["net_liquidation"] == 125000.0

    def test_returns_ok_false_when_no_connection(self):
        from services.ibkr_trader import IBKRTrader
        trader = IBKRTrader()
        result = trader.get_account_summary(mode="ibkr_paper")
        assert result["ok"] is False

    def test_mode_carried_through(self):
        mod, stub = _import_trader_with_mock()
        trader = mod.IBKRTrader()
        with patch.dict(sys.modules, {"ib_insync": stub}):
            result = trader.get_account_summary(mode="ibkr_paper")
        assert result["mode"] == "ibkr_paper"


# ── Module-level convenience functions ───────────────────────────────────────

class TestModuleFunctions:
    def test_test_ibkr_paper_calls_connection_test(self):
        from services.ibkr_trader import test_ibkr_paper
        # Should always return a dict (pass or fail)
        result = test_ibkr_paper()
        assert isinstance(result, dict)
        assert "ok" in result
        assert "reachable" in result

    def test_get_ibkr_paper_account_returns_dict(self):
        from services.ibkr_trader import get_ibkr_paper_account
        result = get_ibkr_paper_account()
        assert isinstance(result, dict)
        assert "ok" in result

    def test_place_ibkr_order_validates_action(self):
        from services.ibkr_trader import place_ibkr_order
        result = place_ibkr_order("AAPL", "INVALID_ACTION", 10, 150.0)
        assert result["ok"] is False

    def test_place_ibkr_order_validates_zero_qty(self):
        from services.ibkr_trader import place_ibkr_order
        result = place_ibkr_order("AAPL", "BUY", 0, 150.0)
        assert result["ok"] is False


# ── Paper-mode safety guard ───────────────────────────────────────────────────

class TestPaperModeSafety:
    """Ensure live ports are never used when mode=ibkr_paper."""

    def test_paper_mode_never_uses_live_port(self):
        from services.ibkr_trader import _get_connection_params, _LIVE_GATEWAY_PORT, _LIVE_TWS_PORT
        params = _get_connection_params("ibkr_paper")
        assert params["port"] not in (_LIVE_GATEWAY_PORT, _LIVE_TWS_PORT), (
            f"Paper mode must not connect to live port {params['port']}"
        )

    def test_default_mode_is_paper_in_place_order(self):
        """place_order default mode param must be ibkr_paper, not live."""
        import inspect
        from services.ibkr_trader import IBKRTrader
        sig = inspect.signature(IBKRTrader.place_order)
        default_mode = sig.parameters["mode"].default
        assert default_mode == "ibkr_paper", (
            f"place_order mode default should be 'ibkr_paper', got '{default_mode}'"
        )

    def test_connection_test_identifies_paper_in_message(self):
        from services.ibkr_trader import IBKRTrader
        trader = IBKRTrader()
        mock_sock = MagicMock()
        mock_sock.__enter__ = MagicMock(return_value=mock_sock)
        mock_sock.__exit__ = MagicMock(return_value=False)
        with patch("socket.create_connection", return_value=mock_sock):
            result = trader.connection_test("ibkr_paper")
        assert "paper" in result["message"].lower(), (
            "Success message should mention 'paper' to avoid confusion with live accounts"
        )
