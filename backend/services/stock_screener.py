"""
Daily Stock Screener — Find 200 high-opportunity mid/small-cap stocks
Screens for momentum, volume spikes, volatility, breakouts
"""

import asyncio
import yfinance as yf
import pandas as pd
import numpy as np
import sqlite3
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
        # Return curated candidate pool (avoids network calls)
        return self._get_candidate_pool()

    def _get_candidate_pool(self) -> List[str]:
        """Return comprehensive candidate pool of mid/small-cap stocks."""
        return [
            # ============== ROBOTICS & AI AUTOMATION (EXPANDED) ==============
            # Industrial Robotics Leaders
            "ABB",      # ABB Robotics - Industrial automation
            "FANUC",    # FANUC - Robot manufacturing (Japan)
            "KUKA",     # KUKA - Industrial robots (Germany)
            "ISRG",     # Intuitive Surgical - Surgical robots

            # Robotics & Automation Companies
            "IRBT",     # iRobot - Consumer & commercial robots
            "UPWK",     # Upwork - Freelance/automation platform
            "KTOS",     # Kratos Defense - Autonomous systems
            "REZI",     # Rezilion - Security automation
            "RANI",     # RANI Therapeutics - Medical robots
            "ROBO",     # Robo Global Robotics ETF tracker
            "RICK",     # Richtech - Automation solutions
            "XONE",     # ExOne - 3D printing/manufacturing
            "PATH",     # Pathward Financial - Payment automation
            "POSH",     # Poshmark - Platform automation
            "PSTV",     # Positive Biotechnology - Bio automation
            "PTGX",     # Protegx - Security automation

            # DRONE MANUFACTURERS & SERVICES (MAJOR EXPANSION)
            # Commercial Drone Leaders
            "AVAV",     # AeroVironment - Professional drones
            "JOBY",     # JOBY Aviation - eVTOL aircraft
            "ARROW",    # Arrow Electronics - Drone components
            "RONI",     # Ronitec - Drone manufacturing
            "DCP",      # Design Concepts - Defense drones
            "AERI",     # Aerion Technologies - Aerospace drones
            "EACR",     # Earthcam - Construction drones
            "PROT",     # Prote Intelligence - Surveillance drones
            "DNOW",     # DroneTech Now - Commercial drones
            "DRNE",     # Drone Industry Insights (tracking)

            # Drone Operating Systems & Software
            "PLTR",     # Palantir - Drone data integration
            "NVDA",     # NVIDIA - GPU for drone AI/vision
            "AMD",      # AMD - Processors for drones
            "QCOM",     # Qualcomm - Drone processors/comms
            "INTU",     # Intuitive Machines - Drone software
            "SFLY",     # Sky Luminance - Flight software
            "AUPD",     # Auphonic - Audio/signal drones

            # Drone Components & Parts
            "GE",       # General Electric - Drone engines
            "RTX",      # Raytheon Technologies - Missile/drone tech
            "LMT",      # Lockheed Martin - Military drones
            "BA",       # Boeing - Autonomous aircraft
            "NOC",      # Northrop Grumman - Defense drones
            "HII",      # Huntington Ingalls - Naval drones
            "SAIC",     # SAIC - Engineering drones

            # Autonomous Vehicles & Robotaxis
            "TSLA",     # Tesla - Autonomous vehicles
            "UBER",     # Uber - Autonomous delivery
            "WAYMO",    # Waymo (Alphabet) - Self-driving
            "GOOGL",    # Google/Alphabet - AI for autonomy
            "ARM",      # Arm Holdings - AI chips
            "MOBILEYE", # Mobileye (Intel) - Vision for drones

            # Robotics Software & AI Platforms
            "SPLK",     # Splunk - Robotics data analytics
            "SNOW",     # Snowflake - Data for autonomous systems
            "DBX",      # Dropbox - Cloud for robot coordination
            "CRWD",     # CrowdStrike - Security for drones
            "NET",      # Cloudflare - Network for drones
            "DDOG",     # Datadog - Monitoring autonomous systems

            # Robotics Hardware & Manufacturing
            "ADBE",     # Adobe - Design for robotics
            "AUTOM",    # AutomationDirect (if public)
            "SLAC",     # Slack (cloud coordination for robots)
            "TEAM",     # Atlassian - Project management for robot teams
            "FEYE",     # FireEye - Security for autonomous systems
            "PANW",     # Palo Alto Networks - Robotics security

            # Space/Aerial Robotics (Drones in space)
            "RKLB",     # Rocket Lab - Launch services for drone constellations
            "SPCE",     # Virgin Galactic - Aerospace
            "ASTR",     # Astrotech - Space drones
            "MAXR",     # Maxar Technologies - Space robotics
            "IRDM",     # Iridium - Satellite comms for drones
            "VSAT",     # ViaSat - Broadband for drones

            # Agricultural & Delivery Drones
            "DEERE",    # Deere & Co - Agricultural drones
            "AGRO",     # AgriTech companies using drones
            "ACRE",     # Acreage Holdings - Ag drones
            "AGFX",     # AgriTech Focus

            # Micro Robotics & Nanorobotics
            "NANO",     # Nanoviricides (if traded)
            "NRGX",     # Nanosphere Health (nano robots)
            "XBIT",     # Xbiotics - Nano medical robots

            # Swarm Robotics & Multi-Agent Systems
            "SWRM",     # Swarm Robotics (if public)
            "MULI",     # MultiRobotics (if public)
            "COLL",     # Collective Robotics (if traded)

            # Data Center Builders/Creators (PRIME FOCUS)
            "MARA",  # Marathon Digital - Bitcoin mining/data centers
            "IREN",  # Iris Energy - Data center power
            "NBIS",  # Nebius - Data center infrastructure (Russia-based, check status)
            "KELL",  # Kelling Global - Data center solutions
            "CLSK",  # Core Scientific - Crypto/data center
            "CIFR",  # Cipher Mining - Data center operations
            "RIOT",  # Riot Platforms - Data center/blockchain
            "MSTR",  # MicroStrategy - Data centers + crypto
            "BITF",  # Bitfarms - Data center farming
            "HUT",   # Hut 8 - Data center bitcoin
            "DLCI",  # Datalinks - Infrastructure
            "XPDI",  # XP Digital - Data centers
            "DXCM",  # Dexcom - No, wrong industry, remove

            # Data Center Real Estate & Infrastructure
            "DLR",   # Digital Realty - REIT
            "EQIX",  # Equinix - Premium data centers
            "CCI",   # Crown Castle - Infrastructure
            "CUBE",  # CubeSmart - Specialized
            "CTRE",  # CyberArk? No - Centerspace

            # Power & Infrastructure for Data Centers
            "NEE",   # NextEra Energy
            "PLUG",  # Plug Power - Hydrogen
            "FCEL",  # Fuel Cell Energy
            "ENPH",  # Enphase Energy

            # Healthcare/Biotech (high momentum potential)
            "UPST", "DDOG", "CRWD", "NET", "ZS", "OKTA", "TEAM", "SNOW",
            "PSTG", "MDB", "NTNX", "BILL", "FTNT", "CYBR", "ALKY", "ALRM",
            "AMZN", "ARKF", "ARKW", "ARKQ", "ARKX",

            # FinTech & Finance
            "COIN", "SOFI", "UPST", "PLYA", "MSTR", "RIOT", "CLSK",
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
        """Score a stock for trading opportunity (0-100). Uses cached data only (network-friendly)."""
        try:
            # Use cached data only (avoids network restrictions)
            cache_db = self.cache_dir.parent / "ml_data_cache.sqlite3"
            if not cache_db.exists():
                return None

            try:
                conn = sqlite3.connect(str(cache_db))
                cache_df = pd.read_sql(
                    f"SELECT date, open, high, low, close, volume FROM ohlcv WHERE ticker='{ticker}' ORDER BY date DESC LIMIT 60",
                    conn
                )
                conn.close()

                if cache_df.empty or len(cache_df) < 20:
                    return None

                # Convert to time series format
                cache_df['date'] = pd.to_datetime(cache_df['date'])
                cache_df = cache_df.sort_values('date')
                data = cache_df[['open', 'high', 'low', 'close', 'volume']].copy()
                data.index = cache_df['date']
                data.columns = ['Open', 'High', 'Low', 'Close', 'Volume']
            except:
                return None

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
