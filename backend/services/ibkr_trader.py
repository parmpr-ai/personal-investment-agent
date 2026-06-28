"""
IBKR order execution service — supports paper and live accounts.

Paper account ports:
  IB Gateway paper: 4002
  TWS paper:        7497

Live account ports:
  IB Gateway live:  4001
  TWS live:         7496

The agent uses a separate client_id from the read-only portfolio connection
to avoid session conflicts.
"""
import os
import time
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

_PAPER_GATEWAY_PORT = 4002
_PAPER_TWS_PORT = 7497
_LIVE_GATEWAY_PORT = 4001
_LIVE_TWS_PORT = 7496

# Separate client_id from the read-only portfolio connection (which uses 31)
_AGENT_CLIENT_ID = int(os.getenv("IBKR_AGENT_CLIENT_ID", "32"))


def _get_connection_params(mode: str, settings: Dict | None = None) -> Dict[str, Any]:
    cfg = (settings or {}).get("ibkr", {})
    host = cfg.get("host") or os.getenv("IBKR_HOST", "127.0.0.1")

    if mode == "ibkr_paper":
        port = int(cfg.get("paper_port") or os.getenv("IBKR_PAPER_PORT", str(_PAPER_GATEWAY_PORT)))
    else:
        port = int(cfg.get("port") or os.getenv("IBKR_PORT", str(_LIVE_GATEWAY_PORT)))

    return {"host": host, "port": port, "client_id": _AGENT_CLIENT_ID}


class IBKRTrader:
    def __init__(self):
        self._ib = None
        self._connected_mode: Optional[str] = None

    def _connect(self, mode: str, settings: Dict | None = None):
        try:
            from ib_insync import IB, util
            try:
                util.startLoop()
            except Exception:
                pass

            params = _get_connection_params(mode, settings)
            if self._ib and self._ib.isConnected():
                return self._ib

            self._ib = IB()
            self._ib.connect(
                params["host"],
                params["port"],
                clientId=params["client_id"],
                readonly=False,
                timeout=10,
            )
            self._connected_mode = mode
            logger.info(f"IBKR trader connected: {params['host']}:{params['port']} (mode={mode})")
            return self._ib
        except Exception as e:
            self._ib = None
            raise ConnectionError(f"IBKR connection failed ({mode}): {e}")

    def _disconnect(self):
        if self._ib:
            try:
                self._ib.disconnect()
            except Exception:
                pass
            self._ib = None
            self._connected_mode = None

    def place_order(
        self,
        ticker: str,
        action: str,
        qty: float,
        price: float,
        order_type: str = "MKT",
        mode: str = "ibkr_paper",
        settings: Dict | None = None,
    ) -> Dict[str, Any]:
        """
        Place an order on IBKR paper or live account.
        action: BUY | SELL | SHORT | COVER (mapped to IBKR BUY/SELL + short sale flag)
        order_type: MKT | LMT
        Returns order status dict.
        """
        try:
            from ib_insync import Stock, MarketOrder, LimitOrder

            action_upper = action.upper()
            # IBKR uses BUY/SELL; SHORT maps to SELL (with short-sale flag handled automatically)
            # COVER maps to BUY (of a short position)
            ibkr_action = {
                "BUY": "BUY",
                "SELL": "SELL",
                "SHORT": "SELL",
                "COVER": "BUY",
            }.get(action_upper)
            if ibkr_action is None:
                return {"ok": False, "error": f"Unknown action: {action}"}
            if qty <= 0 or price <= 0:
                return {"ok": False, "error": "Invalid qty or price"}

            ib = self._connect(mode, settings)
            contract = Stock(ticker, "SMART", "USD")
            ib.qualifyContracts(contract)

            int_qty = max(1, int(qty))
            if order_type == "LMT":
                order = LimitOrder(ibkr_action, int_qty, round(price, 2))
            else:
                order = MarketOrder(ibkr_action, int_qty)

            trade = ib.placeOrder(contract, order)
            # Wait briefly for acknowledgement
            ib.sleep(2)

            order_id = trade.order.orderId
            status = trade.orderStatus.status
            filled = trade.orderStatus.filled
            avg_fill = trade.orderStatus.avgFillPrice or price

            return {
                "ok": True,
                "source": "IBKR",
                "mode": mode,
                "action": action,
                "ibkr_action": ibkr_action,
                "ticker": ticker,
                "qty_requested": int_qty,
                "qty_filled": filled,
                "price_requested": price,
                "avg_fill_price": avg_fill,
                "order_id": order_id,
                "status": status,
                "ts": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:
            return {"ok": False, "error": str(e), "ticker": ticker, "action": action}
        finally:
            self._disconnect()

    def cancel_all(self, mode: str = "ibkr_paper", settings: Dict | None = None) -> Dict[str, Any]:
        try:
            ib = self._connect(mode, settings)
            open_trades = ib.openTrades()
            for t in open_trades:
                ib.cancelOrder(t.order)
            ib.sleep(1)
            return {"ok": True, "cancelled": len(open_trades)}
        except Exception as e:
            return {"ok": False, "error": str(e)}
        finally:
            self._disconnect()

    def get_account_summary(self, mode: str = "ibkr_paper", settings: Dict | None = None) -> Dict[str, Any]:
        try:
            ib = self._connect(mode, settings)
            summary = {v.tag: v.value for v in ib.accountSummary()}
            return {
                "ok": True,
                "mode": mode,
                "net_liquidation": float(summary.get("NetLiquidation", 0)),
                "cash": float(summary.get("TotalCashValue", 0)),
                "buying_power": float(summary.get("BuyingPower", 0)),
                "unrealized_pnl": float(summary.get("UnrealizedPnL", 0)),
                "realized_pnl": float(summary.get("RealizedPnL", 0)),
                "ts": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:
            return {"ok": False, "error": str(e)}
        finally:
            self._disconnect()

    def connection_test(self, mode: str = "ibkr_paper", settings: Dict | None = None) -> Dict[str, Any]:
        try:
            params = _get_connection_params(mode, settings)
            import socket
            with socket.create_connection((params["host"], params["port"]), timeout=3):
                pass
            return {
                "ok": True,
                "reachable": True,
                "mode": mode,
                "host": params["host"],
                "port": params["port"],
                "message": f"IBKR {'paper' if 'paper' in mode else 'live'} port reachable. Start IB Gateway/TWS with paper account to enable order execution.",
            }
        except Exception as e:
            params = _get_connection_params(mode, settings)
            return {
                "ok": False,
                "reachable": False,
                "mode": mode,
                "host": params["host"],
                "port": params["port"],
                "message": str(e),
                "hint": "Open IB Gateway → select Paper Trading account → ensure API connections enabled on port " + str(params["port"]),
            }


_trader = IBKRTrader()


def place_ibkr_order(ticker: str, action: str, qty: float, price: float,
                     order_type: str = "MKT", mode: str = "ibkr_paper",
                     settings: Dict | None = None) -> Dict[str, Any]:
    return _trader.place_order(ticker, action, qty, price, order_type, mode, settings)


def test_ibkr_paper(settings: Dict | None = None) -> Dict[str, Any]:
    return _trader.connection_test("ibkr_paper", settings)


def get_ibkr_paper_account(settings: Dict | None = None) -> Dict[str, Any]:
    return _trader.get_account_summary("ibkr_paper", settings)
