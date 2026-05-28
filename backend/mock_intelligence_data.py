"""
PIA Mock Intelligence Data Layer
Hybrid: mock fundamentals/technicals for UI evaluation; live news/videos preserved.
Tickers: NVDA, AMD, SOFI, IREN, AVAV, GOOGL, TSLA, CRWV, NBIS
Data calibrated to mock prices as of 2026-05-28. Not financial advice.
"""
from __future__ import annotations
from typing import Any

MOCK_STOCK_DB: dict[str, dict[str, Any]] = {
    "NVDA": {
        "company": {
            "description": (
                "NVIDIA designs GPU architectures that power AI training and inference workloads. "
                "Its Hopper (H100/H200) and Blackwell platforms dominate enterprise AI data-center buildouts. "
                "Software stack (CUDA, cuDNN, NeMo, NIM) creates switching costs that reinforce hardware margin."
            ),
            "sector": "Semiconductors",
            "industry": "Fabless semiconductor / AI compute",
            "hq": "Santa Clara, CA",
            "ceo": "Jensen Huang",
            "employees": "36,000",
            "exchange": "NASDAQ",
        },
        "fundamentals": {
            "eps_estimate": "$0.88",
            "eps_actual": "$0.89",
            "eps_surprise_pct": "+1.1%",
            "next_earnings": "Aug 27, 2026 (est.)",
            "revenue": "$130.5B TTM",
            "net_income": "$72.9B TTM",
            "ebitda": "$87.4B TTM",
            "free_cash_flow": "$60.8B TTM",
            "margins": "Gross 74.6% · Net 55.8% · Op 62.1%",
            "pe": "48.8×",
            "forward_pe": "31.9×",
            "peg": "1.7",
            "ev_ebitda": "42.1×",
            "roe": "118.4%",
            "debt_equity": "0.41",
            "fcf_yield": "1.7%",
        },
        "targets": {
            "consensus": "Buy — 38 Buy / 6 Hold / 0 Sell",
            "bull": "$220 · Blackwell cycle + sovereign AI buildout",
            "base": "$175 · Steady data-center demand, margin intact",
            "bear": "$100 · Export controls tighten, hyperscaler capex pauses",
            "upside_downside": "+21.9% to mean target from current",
        },
        "technical": {
            "support_1": 130.00,
            "support_2": 121.50,
            "support_3": 112.00,
            "resistance_1": 152.50,
            "resistance_2": 162.00,
            "resistance_3": 175.00,
        },
        "overview": {
            "why_moving": "Blackwell GB200 ramp confirmation and broad AI data-center capex cycle driving institutional re-rating.",
            "ai_view": "Strong momentum, elevated multiple. Pullbacks toward $130–135 offer better risk-adjusted entry. Define invalidation below $124 before adding.",
        },
    },

    "AMD": {
        "company": {
            "description": (
                "Advanced Micro Devices competes across CPUs (EPYC server) and GPUs (Instinct MI300/MI350 AI accelerators). "
                "EPYC holds ~35% x86 server market share. MI300X targets NVIDIA's data-center GPU dominance with competitive HBM bandwidth. "
                "Embedded and gaming divisions provide cyclical hedges but are currently in inventory correction."
            ),
            "sector": "Semiconductors",
            "industry": "Fabless semiconductor / CPU + GPU",
            "hq": "Santa Clara, CA",
            "ceo": "Lisa Su",
            "employees": "26,000",
            "exchange": "NASDAQ",
        },
        "fundamentals": {
            "eps_estimate": "$0.94",
            "eps_actual": "$0.96",
            "eps_surprise_pct": "+2.1%",
            "next_earnings": "Jul 29, 2026 (est.)",
            "revenue": "$25.8B TTM",
            "net_income": "$1.6B TTM",
            "ebitda": "$6.4B TTM",
            "free_cash_flow": "$2.8B TTM",
            "margins": "Gross 52.1% · Net 6.1% · Op 14.2%",
            "pe": "108.4×",
            "forward_pe": "32.8×",
            "peg": "1.3",
            "ev_ebitda": "48.2×",
            "roe": "4.2%",
            "debt_equity": "0.18",
            "fcf_yield": "0.9%",
        },
        "targets": {
            "consensus": "Buy — 32 Buy / 8 Hold / 1 Sell",
            "bull": "$285 · MI350 cycle + EPYC server share gains accelerate",
            "base": "$230 · AI GPU ramp continues at measured pace vs NVDA",
            "bear": "$90 · MI300 adoption disappoints; embedded downturn extends",
            "upside_downside": "+18.5% to mean target from current",
        },
        "technical": {
            "support_1": 178.00,
            "support_2": 165.50,
            "support_3": 152.00,
            "resistance_1": 204.00,
            "resistance_2": 215.50,
            "resistance_3": 228.00,
        },
        "overview": {
            "why_moving": "MI300X data-center AI GPU ramp + EPYC server share gain narrative; AMD lagging NVDA but gaining ecosystem traction.",
            "ai_view": "Constructive long setup. Already in position at $138.20 avg cost — trim on extensions above $204 and reload on pullbacks to the $178–182 zone.",
        },
    },

    "SOFI": {
        "company": {
            "description": (
                "SoFi Technologies is a digital-first financial services platform targeting student loan refinancing, "
                "personal loans, mortgages, investing, and banking. Its Galileo B2B payments platform serves 160+ clients. "
                "The national bank charter (obtained 2022) enables deposit-funded lending at structurally lower cost of capital."
            ),
            "sector": "Fintech / Challenger Bank",
            "industry": "Consumer finance / digital banking",
            "hq": "San Francisco, CA",
            "ceo": "Anthony Noto",
            "employees": "4,800",
            "exchange": "NASDAQ",
        },
        "fundamentals": {
            "eps_estimate": "$0.06",
            "eps_actual": "$0.07",
            "eps_surprise_pct": "+16.7%",
            "next_earnings": "Jul 29, 2026 (est.)",
            "revenue": "$3.2B TTM",
            "net_income": "−$26M TTM",
            "ebitda": "$624M adjusted EBITDA",
            "free_cash_flow": "$182M TTM",
            "margins": "Gross 67.4% · Net −0.8% · EBITDA margin 19.5%",
            "pe": "N/A (near GAAP breakeven)",
            "forward_pe": "38.4×",
            "peg": "N/A",
            "ev_ebitda": "40.8× adjusted",
            "roe": "−0.6%",
            "debt_equity": "0.82",
            "fcf_yield": "0.7%",
        },
        "targets": {
            "consensus": "Mixed — 12 Buy / 9 Hold / 3 Sell",
            "bull": "$35 · GAAP profitability + student loan volume recovery",
            "base": "$28 · Steady member growth, EBITDA positive trajectory holds",
            "bear": "$13 · Rate cycle extends, credit deterioration, GAAP loss widens",
            "upside_downside": "+9.3% to mean target from current",
        },
        "technical": {
            "support_1": 23.50,
            "support_2": 21.00,
            "support_3": 18.80,
            "resistance_1": 27.50,
            "resistance_2": 31.00,
            "resistance_3": 35.00,
        },
        "overview": {
            "why_moving": "Rates sensitivity trade — SOFI re-rates positively on rate cut expectations and member growth beats.",
            "ai_view": "Breakout above $22–23 key resistance. Already at +39% unrealized gain. Do not add on extension; trim into $27–28 and re-enter near $23.50 base.",
        },
    },

    "IREN": {
        "company": {
            "description": (
                "Iris Energy (IREN) operates AI compute infrastructure and Bitcoin mining data centers powered by renewable energy. "
                "Its GPU cloud (IREN Cloud) targets inference and model training workloads, competing with CoreWeave. "
                "Low power costs and owned infrastructure provide margin upside as AI compute demand accelerates."
            ),
            "sector": "AI Compute / Digital Infrastructure",
            "industry": "GPU cloud / Bitcoin mining",
            "hq": "Sydney, Australia (US listed)",
            "ceo": "Daniel Roberts",
            "employees": "220",
            "exchange": "NASDAQ",
        },
        "fundamentals": {
            "eps_estimate": "−$0.14",
            "eps_actual": "−$0.11",
            "eps_surprise_pct": "+21.4% beat (smaller loss)",
            "next_earnings": "Aug 13, 2026 (est.)",
            "revenue": "$285M TTM",
            "net_income": "−$68M TTM",
            "ebitda": "$42M adj. EBITDA (GPU cloud segment positive)",
            "free_cash_flow": "−$224M (capex-heavy expansion phase)",
            "margins": "Gross 44.2% · Net −24.1% · FCF negative (capacity buildout)",
            "pe": "N/A (negative GAAP)",
            "forward_pe": "28.5× (consensus estimate basis)",
            "peg": "N/A",
            "ev_ebitda": "N/A (negative)",
            "roe": "−18.4%",
            "debt_equity": "0.65",
            "fcf_yield": "Negative (expansion phase)",
        },
        "targets": {
            "consensus": "Buy — 6 Buy / 2 Hold / 0 Sell",
            "bull": "$30 · GPU cloud capacity fills ahead of schedule; BTC tailwind",
            "base": "$21 · Steady GPU cloud ramp; BTC neutralizes mining dilution",
            "bear": "$10 · AI compute pricing compresses; BTC declines extend",
            "upside_downside": "+41.7% to mean target from current",
        },
        "technical": {
            "support_1": 12.50,
            "support_2": 10.80,
            "support_3": 9.20,
            "resistance_1": 17.00,
            "resistance_2": 21.50,
            "resistance_3": 26.00,
        },
        "overview": {
            "why_moving": "AI compute infrastructure narrative driving high-beta re-rating; GPU cloud bookings growth accelerating.",
            "ai_view": "High risk / high reward. Position at $10.50 avg cost — +41% unrealized. Trim into resistance at $17. Keep position size small; GPU cloud execution risk is real.",
        },
    },

    "AVAV": {
        "company": {
            "description": (
                "AeroVironment designs and manufactures unmanned aircraft systems (UAS) and tactical missile systems for US and allied defense forces. "
                "Switchblade loitering munitions, JUMP 20 VTOL, and Puma systems are deployed in active theaters. "
                "Rising defense budgets, post-Ukraine doctrine shifts, and allied procurement create a multi-year demand cycle."
            ),
            "sector": "Aerospace & Defense",
            "industry": "UAS / tactical missile systems",
            "hq": "Arlington, VA",
            "ceo": "Wahid Nawabi",
            "employees": "3,600",
            "exchange": "NASDAQ",
        },
        "fundamentals": {
            "eps_estimate": "$1.18",
            "eps_actual": "$1.24",
            "eps_surprise_pct": "+5.1%",
            "next_earnings": "Jun 24, 2026 (est.)",
            "revenue": "$812M TTM",
            "net_income": "$104M TTM",
            "ebitda": "$148M TTM",
            "free_cash_flow": "$88M TTM",
            "margins": "Gross 38.4% · Net 12.8% · Op 15.6%",
            "pe": "58.2×",
            "forward_pe": "42.3×",
            "peg": "2.1",
            "ev_ebitda": "46.4×",
            "roe": "14.2%",
            "debt_equity": "0.08",
            "fcf_yield": "1.3%",
        },
        "targets": {
            "consensus": "Buy — 8 Buy / 3 Hold / 0 Sell",
            "bull": "$400 · Allied UAS procurement cycle + Switchblade volume ramp",
            "base": "$335 · Steady contract flow; margins expand as scale grows",
            "bear": "$195 · Defense budget sequester risk; competition from Joby/Anduril",
            "upside_downside": "+23.0% to mean target from current",
        },
        "technical": {
            "support_1": 252.00,
            "support_2": 238.00,
            "support_3": 222.00,
            "resistance_1": 285.00,
            "resistance_2": 308.00,
            "resistance_3": 332.00,
        },
        "overview": {
            "why_moving": "Defense outperformance cycle; Switchblade demand elevated post-Ukraine; NATO allied procurement pipeline visible through FY28.",
            "ai_view": "Defense quality compounder. Entry quality improves on pullbacks to $252–260. Premium multiple justified by contract backlog visibility and margin expansion trajectory.",
        },
    },

    "GOOGL": {
        "company": {
            "description": (
                "Alphabet operates the world's largest search engine (Google), YouTube, Google Cloud, Android, and Waymo. "
                "Search + YouTube generate 77% of revenue. Google Cloud (GCP) is growing 28% YoY and approaching profitability. "
                "Gemini AI integration across Search, Workspace, and Cloud is the primary re-rating catalyst through 2027."
            ),
            "sector": "Mega-cap Technology",
            "industry": "Digital advertising / Cloud / AI search",
            "hq": "Mountain View, CA",
            "ceo": "Sundar Pichai",
            "employees": "181,000",
            "exchange": "NASDAQ",
        },
        "fundamentals": {
            "eps_estimate": "$2.01",
            "eps_actual": "$2.12",
            "eps_surprise_pct": "+5.5%",
            "next_earnings": "Jul 29, 2026 (est.)",
            "revenue": "$350.0B TTM",
            "net_income": "$97.6B TTM",
            "ebitda": "$128.4B TTM",
            "free_cash_flow": "$71.8B TTM",
            "margins": "Gross 57.4% · Net 27.9% · Op 32.1%",
            "pe": "22.8×",
            "forward_pe": "18.4×",
            "peg": "1.2",
            "ev_ebitda": "16.4×",
            "roe": "33.8%",
            "debt_equity": "0.08",
            "fcf_yield": "2.9%",
        },
        "targets": {
            "consensus": "Buy — 45 Buy / 9 Hold / 1 Sell",
            "bull": "$240 · AI search maintains monetization; GCP accelerates to $100B run rate",
            "base": "$210 · Steady search + Cloud growth; Gemini erodes search risk concerns",
            "bear": "$155 · AI disruption compresses search RPM; cloud capex remains high",
            "upside_downside": "+18.8% to mean target from current",
        },
        "technical": {
            "support_1": 168.00,
            "support_2": 158.50,
            "support_3": 148.00,
            "resistance_1": 185.00,
            "resistance_2": 196.00,
            "resistance_3": 210.00,
        },
        "overview": {
            "why_moving": "AI search resilience + Google Cloud re-rating; multiple still reasonable at 18× forward vs peers. Regulatory risk clouds ceiling.",
            "ai_view": "Quality compounder with defensive moat. Entry at $168–175 offers acceptable risk. Watchlist position — initiating on any macro-driven pullback.",
        },
    },

    "TSLA": {
        "company": {
            "description": (
                "Tesla manufactures BEVs (Model 3/Y/S/X/Cybertruck), energy storage (Megapack), and solar. "
                "Its FSD (Full Self-Driving) software and Robotaxi ambition are the primary long-term valuation arguments. "
                "Dojo supercomputer and Optimus humanoid robot add optionality. "
                "Core auto margins remain under pressure from price cuts and competition from BYD and legacy OEMs."
            ),
            "sector": "Automotive / Energy / AI",
            "industry": "Electric vehicles / energy storage / autonomous",
            "hq": "Austin, TX",
            "ceo": "Elon Musk",
            "employees": "125,000",
            "exchange": "NASDAQ",
        },
        "fundamentals": {
            "eps_estimate": "$0.74",
            "eps_actual": "$0.68",
            "eps_surprise_pct": "−8.1% miss",
            "next_earnings": "Jul 23, 2026 (est.)",
            "revenue": "$97.7B TTM",
            "net_income": "$7.2B TTM",
            "ebitda": "$12.8B TTM",
            "free_cash_flow": "$3.4B TTM",
            "margins": "Gross 18.2% · Net 7.3% · Auto gross 15.9%",
            "pe": "126.4×",
            "forward_pe": "84.2×",
            "peg": "N/A (controversial growth story)",
            "ev_ebitda": "87.2×",
            "roe": "11.8%",
            "debt_equity": "0.14",
            "fcf_yield": "0.3%",
        },
        "targets": {
            "consensus": "Mixed — 18 Buy / 14 Hold / 8 Sell",
            "bull": "$550 · FSD/Robotaxi achieves commercial scale; Optimus ships",
            "base": "$310 · Auto volumes recover; energy storage ramps; FSD progress visible",
            "bear": "$115 · Margin compression continues; EV market share declines; FSD delayed",
            "upside_downside": "−11.1% to mean target (mean below current price)",
        },
        "technical": {
            "support_1": 315.00,
            "support_2": 285.00,
            "support_3": 258.00,
            "resistance_1": 370.00,
            "resistance_2": 395.00,
            "resistance_3": 425.00,
        },
        "overview": {
            "why_moving": "Event-driven volatility; Robotaxi timeline news and Elon distraction discount alternate with FSD optimism premium.",
            "ai_view": "High-conviction trades require defined entry + tight invalidation. Wide analyst range signals elevated uncertainty. Wait for $315–325 pullback before initiating.",
        },
    },

    "CRWV": {
        "company": {
            "description": (
                "CoreWeave is a specialized AI cloud provider offering GPU compute infrastructure built on NVIDIA hardware. "
                "Its customer base includes OpenAI, Microsoft, and Cohere. "
                "IPO'd March 2024. Differentiated by NVIDIA GPU density, networking (InfiniBand), and purpose-built AI infra. "
                "High debt load reflects aggressive capacity buildout ahead of demand."
            ),
            "sector": "AI Cloud / Infrastructure",
            "industry": "Hyperscaler GPU cloud / inference infrastructure",
            "hq": "Roseland, NJ",
            "ceo": "Michael Intrator",
            "employees": "1,100",
            "exchange": "NASDAQ",
        },
        "fundamentals": {
            "eps_estimate": "−$1.14 (revenue beat expected)",
            "eps_actual": "−$0.98 (revenue +12% vs est.)",
            "eps_surprise_pct": "+14.3% revenue beat",
            "next_earnings": "Aug 12, 2026 (est.)",
            "revenue": "$2.1B TTM",
            "net_income": "−$815M TTM",
            "ebitda": "−$224M adj. (EBITDA positive at GPU segment level)",
            "free_cash_flow": "−$4.2B (equipment financing + capex heavy)",
            "margins": "Gross 58.2% · Net −38.8% · Levered by equipment debt",
            "pe": "N/A (negative GAAP)",
            "forward_pe": "48.8×",
            "peg": "N/A",
            "ev_ebitda": "N/A",
            "roe": "N/A",
            "debt_equity": "2.14",
            "fcf_yield": "Negative (capacity investment phase)",
        },
        "targets": {
            "consensus": "Buy — 14 Buy / 4 Hold / 1 Sell",
            "bull": "$185 · Hyperscaler contract wins; margin inflection as debt stabilizes",
            "base": "$145 · Revenue ramp continues; path to EBITDA breakeven by FY28",
            "bear": "$55 · Customer concentration risk; NVDA supply tightens; debt burden",
            "upside_downside": "+25.5% to mean target from current",
        },
        "technical": {
            "support_1": 98.00,
            "support_2": 85.50,
            "support_3": 74.00,
            "resistance_1": 128.00,
            "resistance_2": 148.00,
            "resistance_3": 168.00,
        },
        "overview": {
            "why_moving": "AI infrastructure spending cycle; NVIDIA partnership / GPU allocation advantage; post-IPO re-rating still underway.",
            "ai_view": "High risk / high beta AI play. Watch-only until structure builds above $105–108. Do not chase into resistance. Invalidation at $84.",
        },
    },

    "NBIS": {
        "company": {
            "description": (
                "Nebius Group is a European AI cloud and infrastructure company built on the technology assets spun out of Yandex. "
                "Operations span GPU cloud, data labeling (Toloka), and autonomous driving simulation (Avride). "
                "Listed on NASDAQ. Aggressive GPU cluster buildout in Europe, Kazakhstan, and US targeting sovereign AI demand."
            ),
            "sector": "AI Infrastructure / Cloud",
            "industry": "GPU cloud / data labeling / autonomous AI infra",
            "hq": "Amsterdam, Netherlands (NASDAQ listed)",
            "ceo": "Artem Sayapin",
            "employees": "3,200",
            "exchange": "NASDAQ",
        },
        "fundamentals": {
            "eps_estimate": "−$0.38",
            "eps_actual": "−$0.31 (revenue +18% vs est.)",
            "eps_surprise_pct": "+18.4% revenue beat; loss narrower than expected",
            "next_earnings": "Aug 20, 2026 (est.)",
            "revenue": "$384M TTM",
            "net_income": "−$185M TTM",
            "ebitda": "−$82M (cash burn accelerating with GPU buildout)",
            "free_cash_flow": "−$1.1B (heavy capex cycle)",
            "margins": "Gross 48.4% · Net −48.2% · Pre-profitability expansion phase",
            "pe": "N/A (negative GAAP)",
            "forward_pe": "38.4×",
            "peg": "N/A",
            "ev_ebitda": "N/A",
            "roe": "N/A",
            "debt_equity": "0.22",
            "fcf_yield": "Negative",
        },
        "targets": {
            "consensus": "Buy — 5 Buy / 1 Hold / 0 Sell",
            "bull": "$350 · European sovereign AI + Toloka data moat; GPU cluster fills ahead of schedule",
            "base": "$295 · Revenue ramp tracks GPU deployment; cash burn manageable",
            "bear": "$180 · Slower GPU fill rates; geopolitical / regulatory headwinds in Europe",
            "upside_downside": "+15.1% to mean target from current",
        },
        "technical": {
            "support_1": 232.00,
            "support_2": 214.00,
            "support_3": 197.00,
            "resistance_1": 275.00,
            "resistance_2": 298.00,
            "resistance_3": 322.00,
        },
        "overview": {
            "why_moving": "AI infrastructure buildout narrative; European sovereign AI demand; Toloka data-labeling flywheel accelerating.",
            "ai_view": "Highest concentration risk in portfolio at 37.7% weight. Already at +30% unrealized from $197 avg. Protect gains above $232 support. Do not add — trim first spike into $275+.",
        },
    },
}


def get_mock_intelligence(ticker: str) -> dict[str, Any]:
    """
    Returns company, fundamentals, targets, technical, and overview enrichment
    for the given ticker. Returns empty dict if ticker not in mock DB.
    Live news and videos are NOT mocked here — those use live connectors.
    """
    data = MOCK_STOCK_DB.get(ticker.upper().split()[0])
    if not data:
        return {}
    return {
        "company": data.get("company", {}),
        "fundamentals": data.get("fundamentals", {}),
        "targets": data.get("targets", {}),
        "technical_levels": data.get("technical", {}),
        "overview_hints": data.get("overview", {}),
    }


def enrich_technical(technical: dict[str, Any], ticker: str) -> dict[str, Any]:
    """Merges mock support/resistance levels into the intelligence technical block."""
    data = MOCK_STOCK_DB.get(ticker.upper().split()[0], {})
    levels = data.get("technical", {})
    return {**technical, **levels}


def get_mock_overview_hints(ticker: str) -> dict[str, str]:
    data = MOCK_STOCK_DB.get(ticker.upper().split()[0], {})
    return data.get("overview", {})
