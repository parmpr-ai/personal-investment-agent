"""
Telegram trade alerts — free Telegram Bot API, no library required.

Setup:
  1. @BotFather → /newbot → copy the token
  2. Open your bot in Telegram, send /start, then visit:
     https://api.telegram.org/bot<TOKEN>/getUpdates  → copy "id" from "chat" object
  3. Add to .env:
       TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
       TELEGRAM_CHAT_ID=987654321

If env vars are absent, all calls silently no-op — no exceptions raised.
"""
import asyncio
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx

_TOKEN: str = os.environ.get("TELEGRAM_BOT_TOKEN", "")
_CHAT_ID: str = os.environ.get("TELEGRAM_CHAT_ID", "")
_BASE = "https://api.telegram.org/bot"
_TIMEOUT = 6
_LAST_SEND: float = 0.0
_MIN_INTERVAL = 1.1  # Telegram: max 1 msg/sec per chat


def _enabled() -> bool:
    return bool(_TOKEN and _CHAT_ID)


async def _send(text: str) -> bool:
    """Post one message via Bot API. Returns True on success."""
    global _LAST_SEND
    if not _enabled():
        return False
    gap = _MIN_INTERVAL - (time.time() - _LAST_SEND)
    if gap > 0:
        await asyncio.sleep(gap)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.post(
                f"{_BASE}{_TOKEN}/sendMessage",
                json={"chat_id": _CHAT_ID, "text": text, "parse_mode": "HTML"},
            )
            _LAST_SEND = time.time()
            return r.status_code == 200
    except Exception:
        return False


def _now_utc() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M UTC")


_ACTION_EMOJI = {"BUY": "🟢", "SELL": "🔴", "SHORT": "🔻", "COVER": "🔼"}


# ── Public API ────────────────────────────────────────────────────────────────

async def send_trade_alert(
    action: str,
    ticker: str,
    qty: float,
    price: float,
    stop: Optional[float] = None,
    target: Optional[float] = None,
    reason: str = "",
    confidence: int = 70,
    pnl_usd: Optional[float] = None,
) -> None:
    """Alert for every executed trade."""
    em = _ACTION_EMOJI.get(action, "⚪")
    lines = [
        f"{em} <b>{action} {ticker}</b>",
        f"Price: <b>${price:,.2f}</b>  ×{qty:.1f} sh",
        f"Confidence: {confidence}%",
    ]
    if stop:
        lines.append(f"Stop-loss: ${stop:,.2f}")
    if target:
        lines.append(f"Target: ${target:,.2f}")
    if pnl_usd is not None:
        sign = "+" if pnl_usd >= 0 else ""
        lines.append(f"P&amp;L: {sign}${pnl_usd:,.2f}")
    if reason:
        lines.append(f"<i>{reason[:200]}</i>")
    lines.append(f"<code>{_now_utc()}</code>")
    await _send("\n".join(lines))


async def send_stop_alert(
    action: str,
    ticker: str,
    qty: float,
    price: float,
    reason: str,
    avg_price: Optional[float] = None,
) -> None:
    """Alert when a stop-loss or trailing stop fires."""
    lines = [
        f"🛑 <b>STOP TRIGGERED — {action} {ticker}</b>",
        f"Exit: <b>${price:,.2f}</b>  ×{qty:.1f} sh",
    ]
    if avg_price and avg_price > 0:
        pnl_pct = (price - avg_price) / avg_price * 100
        if action in ("SELL",):
            pnl_pct = (price - avg_price) / avg_price * 100
        else:  # COVER
            pnl_pct = (avg_price - price) / avg_price * 100
        sign = "+" if pnl_pct >= 0 else ""
        lines.append(f"Entry: ${avg_price:,.2f}  ({sign}{pnl_pct:.1f}%)")
    lines.append(f"<i>{reason[:200]}</i>")
    lines.append(f"<code>{_now_utc()}</code>")
    await _send("\n".join(lines))


async def send_cycle_summary(summary: Dict[str, Any]) -> None:
    """End-of-cycle digest — only sent when at least one trade executed."""
    executed = summary.get("executed", 0)
    if not executed:
        return
    pv = summary.get("portfolio_value", 0)
    ret = summary.get("total_return_pct", 0)
    regime = summary.get("macro_regime", "—")
    longs = summary.get("open_longs", 0)
    shorts = summary.get("open_shorts", 0)
    blocked = summary.get("blocked", 0)
    sign = "+" if ret >= 0 else ""
    lines = [
        f"📊 <b>PIA Cycle — {executed} trade{'s' if executed != 1 else ''}</b>",
        f"Portfolio: <b>${pv:,.0f}</b>  ({sign}{ret:.2f}%)",
        f"Positions: {longs}L / {shorts}S  |  Blocked: {blocked}",
        f"Regime: {regime}",
        f"<code>{summary.get('ts', '')[:16].replace('T', ' ')} UTC</code>",
    ]
    await _send("\n".join(lines))


async def send_risk_alert(msg: str) -> None:
    """Urgent risk / circuit-breaker alert."""
    await _send(f"⚠️ <b>RISK ALERT</b>\n{msg}\n<code>{_now_utc()}</code>")
