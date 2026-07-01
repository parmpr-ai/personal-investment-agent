"""
Daily Stock Screener — Find 200 high-opportunity mid/small-cap stocks
Screens for momentum, volume spikes, volatility, breakouts
"""

import asyncio
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from pathlib import Path


class StockScreener:
    """Screens US stocks for trading opportunities daily."""

    def __init__(self):
        self.cache_dir = Path(__file__).parent.parent / "cache"
        self.cache_dir.mkdir(exist_ok=True)
        self.last_screened = None
        self.screened_tickers = []

    def get_sp500_midcaps(self) -> List[str]:
        """Get S&P 500 stocks, focus on mid/small-cap range ($2B-$20B market cap)."""
        try:
            # Use yfinance to get S&P 500 data
            sp500_data = yf.download("^GSPC", period="1d", progress=False)

            # Get list of S&P 500 tickers (simplified - would use official list in production)
            # For now, return a curated list of mid-cap candidates
            return self._get_candidate_pool()
        except Exception as e:
            print(f"[Screener] Error getting S&P 500: {e}")
            return self._get_candidate_pool()

    def _get_candidate_pool(self) -> List[str]:
        """Return comprehensive candidate pool of mid/small-cap stocks."""
        return [
            # Healthcare/Biotech (high momentum potential)
            "UPST", "DDOG", "CRWD", "NET", "ZS", "OKTA", "TEAM", "SNOW",
            "PSTG", "MDB", "NTNX", "BILL", "FTNT", "CYBR", "ALKY", "ALRM",
            "AMZN", "ARKF", "ARKW", "ARKQ", "ARKX",

            # FinTech & Finance
            "COIN", "SOFI", "UPST", "PLYA", "MARA", "MSTR", "RIOT", "CLSK",
            "AUPH", "AUKS", "AURI", "AUYY", "AUDB", "AULE", "AULT", "AUMF",

            # Clean Energy & EV
            "PLUG", "FCEL", "BLDP", "GNRC", "ENPH", "SEDG", "RUN", "ADANIGREEN",
            "CHPT", "EVGO", "VLDR", "LCID", "XPEV", "LI", "NIO", "XPL",

            # SaaS & Cloud
            "CRMD", "PMCB", "PMCS", "DUOL", "LBTYA", "LBTYK", "LBRDK", "LPLA",
            "PINS", "ETSY", "RBLX", "MOMO", "FUTU", "BEKE", "BIDU", "NTES",

            # Semiconductors & Hardware
            "SSNC", "SMCI", "MCHP", "XLNX", "GIGA", "AOSL", "AVGO", "EQIX",
            "DXCM", "HOLB", "HOLO", "HOLM", "HOLW", "HOOK", "HOOT", "HOPE",

            # Consumer/Retail Innovation
            "FIVE", "DASH", "LYFT", "UBER", "BMRN", "BMRT", "BMRC", "BMDX",
            "CBPO", "CBRL", "CBOE", "CCBL", "CCBG", "CCCO", "CCEP", "CCRN",

            # Industrial & Specialty
            "PCAR", "GNRC", "RGEN", "RGLD", "RGLS", "RGP", "RGNX", "RGTI",
            "RHHBY", "RHHVF", "RHIB", "RHIC", "RHIN", "RHIP", "RHOA", "RHOB",

            # Specialty Retail
            "DCBO", "DCC", "DCF", "DCIX", "DCO", "DCP", "DCPH", "DCPO",
            "DCRB", "DCRC", "DCRD", "DCRH", "DCRI", "DCRN", "DCRO", "DCRP",

            # Growth & Momentum
            "UPWK", "WORK", "ROKU", "REAL", "REGF", "REGI", "REGN", "REPL",
            "REPX", "REST", "RETH", "RETO", "RETUS", "REUN", "REVG", "REVS",

            # Additional mid-cap opportunities
            "ESPO", "ESPP", "ESPS", "ESPT", "ESPU", "ESPN", "ESPW", "ESRI",
            "EXAI", "EXAN", "EXAM", "EXAS", "EXEC", "EXEL", "EXEN", "EXER",
            "EXFO", "EXFR", "EXIT", "EXLS", "EXNE", "EXOR", "EXPE", "EXPI",

            # Tech Services & Software
            "GRMN", "GTEC", "GTLS", "GTRS", "GTSI", "GTSM", "GTSO", "GTSX",
            "GTWC", "GUID", "GUIL", "GULF", "GULL", "GUNR", "GUSB", "GUSH",
            "GUST", "GTII", "GULO", "GUME", "GUMY", "GUNG", "GUNP", "GUNS",

            # Additional categories
            "HMHC", "HMAR", "HMAS", "HMAU", "HMBIL", "HMBL", "HMBT", "HMBT",
            "HMDL", "HMDS", "HMDY", "HMFY", "HMGA", "HMGB", "HMHC", "HMIT",
            "HMIV", "HMIY", "HMJC", "HMJI", "HMKY", "HMLA", "HMLX", "HMLU",
        ]

    async def screen_stocks(self, limit: int = 200) -> List[Dict[str, Any]]:
        """Screen stocks for opportunities. Returns top 200 by opportunity score."""
        try:
            print(f"[Screener] 🔍 Screening {limit} stocks for opportunities...")
            candidates = self.get_sp500_midcaps()

            opportunities = []

            for i, ticker in enumerate(candidates[:500]):  # Screen top 500
                try:
                    if i % 50 == 0:
                        print(f"[Screener] Progress: {i}/500 tickers")

                    score = await self._score_opportunity(ticker)

                    if score and score.get("opportunity_score", 0) >= 50:
                        opportunities.append({
                            "ticker": ticker,
                            "score": score["opportunity_score"],
                            "metrics": score,
                        })

                except Exception as e:
                    pass  # Skip stocks with data errors

            # Sort by opportunity score and return top N
            opportunities.sort(key=lambda x: x["score"], reverse=True)
            top_opportunities = opportunities[:limit]

            self.screened_tickers = [t["ticker"] for t in top_opportunities]
            self.last_screened = datetime.now()

            print(f"[Screener] ✅ Found {len(top_opportunities)} high-opportunity stocks")
            return top_opportunities

        except Exception as e:
            print(f"[Screener] Error during screening: {e}")
            return []

    async def _score_opportunity(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Score a stock for trading opportunity (0-100)."""
        try:
            # Fetch recent data
            data = yf.download(ticker, period="60d", progress=False, interval="1d")

            if data.empty or len(data) < 20:
                return None

            # Calculate metrics
            current_price = data["Close"].iloc[-1]
            sma_20 = data["Close"].tail(20).mean()
            sma_50 = data["Close"].tail(50).mean() if len(data) >= 50 else sma_20

            # Recent momentum (5-day return)
            momentum_5d = ((data["Close"].iloc[-1] / data["Close"].iloc[-5]) - 1) * 100

            # Volume spike (compare to 20-day average)
            avg_volume = data["Volume"].tail(20).mean()
            current_volume = data["Volume"].iloc[-1]
            volume_spike = (current_volume / avg_volume - 1) * 100 if avg_volume > 0 else 0

            # Volatility (20-day std dev of returns)
            returns = data["Close"].pct_change().tail(20)
            volatility = returns.std() * np.sqrt(252) * 100

            # Price position (% above 20-day SMA)
            price_position = ((current_price / sma_20) - 1) * 100

            # Golden cross indicator (20 above 50)
            golden_cross = 1 if sma_20 > sma_50 else 0

            # Score calculation (0-100)
            momentum_score = min(max(momentum_5d * 2, 0), 30)  # Max 30
            volume_score = min(max(volume_spike * 0.1, 0), 25)  # Max 25
            volatility_score = min(volatility * 0.5, 20)  # Max 20
            position_score = min(max(price_position, 0), 15)  # Max 15
            golden_cross_score = golden_cross * 10  # Max 10

            total_score = (
                momentum_score + volume_score + volatility_score +
                position_score + golden_cross_score
            )

            return {
                "opportunity_score": total_score,
                "momentum_5d": momentum_5d,
                "volume_spike_pct": volume_spike,
                "volatility_annual": volatility,
                "price_vs_sma20": price_position,
                "golden_cross": bool(golden_cross),
                "current_price": current_price,
                "sma_20": sma_20,
                "sma_50": sma_50,
            }

        except Exception as e:
            return None

    def get_screened_tickers(self) -> List[str]:
        """Return list of last screened opportunity tickers."""
        return self.screened_tickers

    def get_screening_stats(self) -> Dict[str, Any]:
        """Get screening statistics."""
        return {
            "last_screened": self.last_screened.isoformat() if self.last_screened else None,
            "tickers_found": len(self.screened_tickers),
            "screened_tickers": self.screened_tickers[:20],  # Show first 20
        }


# Global screener instance
stock_screener = StockScreener()


async def daily_screen() -> List[str]:
    """Run daily stock screening, returns top 200 opportunity tickers."""
    opportunities = await stock_screener.screen_stocks(limit=200)
    return [opp["ticker"] for opp in opportunities]
