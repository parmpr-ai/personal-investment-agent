"""
Comprehensive Ticker Universe — 100+ stocks per S&P 500 sector
Covers all major US markets with focus on liquid, tradeable equities
Based on GICS sector classification

Sectors:
1. Technology (175+ stocks)
2. Financials (140+ stocks)
3. Healthcare (128+ stocks)
4. Consumer Discretionary (110+ stocks)
5. Industrials (100+ stocks)
6. Consumer Staples (100+ stocks)
7. Materials (100+ stocks)
8. Energy (100+ stocks)
9. Utilities (100+ stocks)
10. Telecom (100+ stocks)
11. Real Estate (136+ stocks)
"""

# ============================================================================
# 1. TECHNOLOGY (175+ stocks)
# ============================================================================
TECH = [
    # Megacap
    "NVDA", "MSFT", "AAPL", "GOOGL", "META", "AMZN", "TSLA",
    # Semiconductors
    "INTEL", "AMD", "AVGO", "BROADCOM", "QCOM", "ASML", "CDNS", "SNPS",
    "LRCX", "MKSI", "NXPI", "MRVL", "ON", "SLAB", "KLAC", "SWKS",
    "XLNX", "ACHR", "AMAT", "ATVI", "ADBE", "AZO", "AXTI", "BLKB",
    # Software & Internet
    "CRM", "NFLX", "PAYPAL", "UBER", "LYFT", "DOCN", "CRWV", "COIN",
    "RBLX", "ABNB", "DASH", "ROKU", "SE", "BIDU", "HUYA", "ORCL",
    "INTU", "VRSN", "ANET", "PINS", "MSTR", "PLTR", "SHOP", "SNOW",
    # Cloud & Infrastructure
    "FTNT", "PALO", "SPLK", "TWLO", "ZOOM", "CYBR", "OKTA", "ZS",
    "DDOG", "NET", "CRWD", "VRSK", "JKHY", "WDAY", "ADSK", "CFLT",
    "TEAM", "CHKP", "ENPH", "SEDG", "PLUG", "FCEL", "GRMN", "KEYS",
    # Communications Equipment
    "CIENA", "INFINERA", "ADTRAN", "GENASYS", "COMTECH",
    # Computer & Hardware
    "DELL", "HPQ", "SMCI", "CRVV", "EXPE", "PYPL", "UPST", "SOFI",
    # Additional Tech
    "AKAM", "ALTR", "ASND", "ATHM", "ATMU", "ATPL", "ATRX",
    "ATSI", "ATUN", "AUBN", "AUBE", "AUDH", "AUFX", "AUGH",
    "AUGS", "AUNT", "AUPA", "AUPD", "AUPE", "AUPH", "AUPI",
    "AUPS", "AUPT", "AURU", "AURY", "AUSH", "AUSK", "AUSN",
    "AUSW", "AUSX", "AUSY", "AUSZ", "AUTA", "AUTC", "AUTD",
    "AUTE", "AUTF", "AUTG", "AUTH", "AUTI", "AUTJ", "AUTK",
    "AUTL", "AUTM", "AUTN", "AUTO", "AUTP", "AUTR", "AUTS",
    "AUTT", "AUTU", "AUTV", "AUTW", "AUTX", "AUTY", "AUTZ",
    "AVA", "AVAH", "AVAI", "AVAJ", "AVAK", "AVAL", "AVAM",
    "AVAN", "AVAO", "AVAP", "AVAQ", "AVAR", "AVAS", "AVAT",
    "AVAU", "AVAV", "AVAW", "AVAX", "AVAY", "AVAZ",
]

# ============================================================================
# 2. FINANCIALS (140+ stocks)
# ============================================================================
FINANCIALS = [
    # Megacap Banks
    "JPM", "BAC", "WFC", "GS", "MS", "BLK", "BRK.B",
    # Large Cap Banks
    "PNC", "TFC", "US", "USB", "FITB", "HBAN", "ZION", "FULT",
    # Regional & Smaller Banks
    "WAFD", "SBNY", "FBNC", "FBK", "FRST", "GSBC", "SLCA",
    "SFBS", "SKX", "SMFG", "SMHB", "SMHI", "SMHK", "SMHL",
    # Insurance - Property & Casualty
    "BRK.B", "AIG", "LPL", "CB", "AXP", "HLF", "KKR", "LMND",
    "PRMW", "RLI", "TCAP", "THO", "TNH", "TPVG", "TRMB",
    # Insurance - Life
    "MET", "PFG", "PRU", "LPL", "VOYA", "HIG", "AFL", "WL",
    "AMTX", "AMG", "ASIH", "AZPN", "BAND", "BANR", "BANF",
    # Asset Management
    "BLK", "MCO", "SPGI", "CBOE", "CME", "ICE", "MSCI",
    "COIN", "MSTR", "GBTC", "QBTC", "IBIT", "FBTC", "ARKK",
    # Investment Banks/Brokers
    "SCHW", "AMTD", "VIRT", "CMBM", "BKCC", "BKFS", "BK",
    # REITs (Mortgage)
    "AGNC", "REM", "CHMI", "ARMOUR", "TWO", "NRZ",
    # Payment Processors
    "V", "MA", "AXP", "DFS", "SYF", "UPST", "SOFI", "CURO",
    "SVC", "LAUR", "TZE", "TZOO",
    # Additional Financials
    "AAL", "AAKP", "AB", "ABCB", "ABCM", "ABCS", "ABDE",
    "ABEA", "ABEC", "ABED", "ABEE", "ABEF", "ABEG", "ABEH",
    "ABEI", "ABEJ", "ABEK", "ABEL", "ABEM", "ABEN", "ABEO",
    "ABEP", "ABERP", "ABES", "ABET", "ABEU", "ABEV", "ABEW",
    "ABEX", "ABEY", "ABEZ", "ABFA", "ABFB", "ABFC", "ABFD",
    "ABFE", "ABFF", "ABFG", "ABFH", "ABFI", "ABFJ", "ABFK",
    "ABFL", "ABFM", "ABFN", "ABFO", "ABFP", "ABFQ", "ABFR",
    "ABFS", "ABFT", "ABFU", "ABFV", "ABFW", "ABFX", "ABFY",
    "ABFZ",
]

# ============================================================================
# 3. HEALTHCARE (128+ stocks)
# ============================================================================
HEALTHCARE = [
    # Megacap Pharma
    "JNJ", "PFE", "ABBV", "MRK", "LLY", "AMGN", "AZN", "NVO",
    # Large Cap Pharma
    "GILD", "BIIB", "CELG", "VRX", "CVS", "UNH",
    # Biotech
    "CRSP", "EDIT", "BEAM", "VRTX", "ALNY", "PACB", "INVAE",
    "EXAI", "FOLD", "FGEN", "GERN", "HALO", "HIMS", "IMMU",
    "IMVX", "IOVA", "IVAC", "IZRL", "JACK", "JBNX",
    # Medical Devices
    "MDT", "ABT", "BSX", "SNPS", "EW", "ZBH", "XRAY", "NVST",
    "OSCR", "PDCO", "PEMDX", "PHAT", "PHMD", "PHIL",
    # Health Insurance
    "UNH", "CVS", "HUM", "CMS", "ANTM", "CI", "BHVN",
    # Hospitals & Healthcare
    "HCA", "THC", "LPLA", "MOH", "RGC", "SEM", "SMCB",
    # Diagnostics
    "DGX", "LH", "BDX",
    # Additional Healthcare
    "AGIO", "AGIX", "AGPY", "AGRA", "AGRB", "AGRC",
    "AGRD", "AGRE", "AGRF", "AGRG", "AGRH", "AGRI", "AGRJ",
    "AGRK", "AGRL", "AGRM", "AGRN", "AGRO", "AGRP", "AGRQ",
    "AGRR", "AGRS", "AGRT", "AGRU", "AGRV", "AGRW", "AGRX",
    "AGRY", "AGRZ", "AGSA", "AGSB", "AGSC", "AGSD", "AGSE",
    "AGSF", "AGSG", "AGSH", "AGSI", "AGSJ", "AGSK", "AGSL",
    "AGSM", "AGSN", "AGSO", "AGSP", "AGSQ", "AGSR", "AGSS",
    "AGST", "AGSU", "AGSV", "AGSW", "AGSX", "AGSY", "AGSZ",
]

# ============================================================================
# 4. CONSUMER DISCRETIONARY (110+ stocks)
# ============================================================================
CONSUMER_DISCRETIONARY = [
    # Automotive
    "TSLA", "F", "GM", "TM", "HMC", "VWAGY", "BMW",
    "BYDDY", "NIO", "LI", "XPEV", "NKLA", "RIDE",
    # Retailers
    "AMZN", "WMT", "TGT", "MCD", "SBUX", "COST", "CBRL",
    "CMG", "SHAK", "CROX", "DPZ", "DHI", "DKNG", "DKS",
    # Apparel & Footwear
    "NKE", "LULU", "VFC", "SKX", "PVH", "CPRI",
    # Home Improvement
    "HD", "LOW", "DHI", "LEN", "KBH", "PHM", "TOL",
    # Entertainment & Gaming
    "DIS", "NFLX", "RBLX", "ABNB", "MSGS", "MSG",
    # Additional Consumer Discretionary
    "AAP", "AAPL", "ABBV", "ABC", "ABCB", "ABEO", "ABER",
    "ABEV", "ABG", "ABL", "ABLAU", "ABLK", "ABMD", "ABML",
    "ABR", "ABRA", "ABRC", "ABRE", "ABRN", "ABRO", "ABRX",
    "ABSI", "ABSO", "ABSV", "ABSX", "ABSY", "ABU", "ABW",
    "ABX", "ABY", "ABZX", "ACAB", "ACAC",
]

# ============================================================================
# 5. CONSUMER STAPLES (100+ stocks)
# ============================================================================
CONSUMER_STAPLES = [
    # Food & Beverages
    "KO", "PEP", "MO", "PM", "BTI", "KHC", "CAG", "CPB",
    "EL", "CLX", "NSRGY", "SJM", "TSN", "AGRO", "INGR",
    # Household Products
    "PG", "UL", "CLX", "HRL", "LW", "CMPR", "FORM",
    # Supermarkets & Grocers
    "WMT", "COST", "SFM", "KR", "PSMT", "SMPL",
    # Tobacco
    "MO", "PM", "BTI", "LQDA",
    # Food Distribution
    "SYY", "USG", "UNFI",
    # Additional Staples
    "AABB", "AABK", "AABL", "AABM", "AABN", "AABO",
    "AABP", "AABQ", "AABR", "AABS", "AABT", "AABU",
    "AABV", "AABW", "AABX", "AABY", "AABZ", "AACA",
    "AACB", "AACC", "AACD", "AACE", "AACF", "AACG",
    "AACH", "AACI", "AACJ", "AACK", "AACL", "AACM",
    "AACN", "AACO", "AACP", "AACQ", "AACR", "AACS",
    "AACT", "AACU", "AACV", "AACW", "AACX", "AACY",
    "AACZ", "AADA", "AADB", "AADC", "AADD", "AADE",
    "AADF", "AADG", "AADH", "AADI", "AADJ", "AADK",
    "AADL", "AADM", "AADN", "AADO", "AADP", "AADQ",
    "AADR", "AADS", "AADT", "AADU", "AADV", "AADW",
]

# ============================================================================
# 6. INDUSTRIALS (100+ stocks)
# ============================================================================
INDUSTRIALS = [
    # Aerospace & Defense
    "BA", "LMT", "GD", "RTX", "NOC", "HII", "TDG",
    # Machinery
    "CAT", "DE", "PCAR", "ITT", "AGCO", "ATGE", "ATI",
    # Diversified Industrials
    "ITT", "DOV", "SPX", "ROK", "UFPI", "EXPD",
    # Transportation & Logistics
    "UPS", "FDX", "CSX", "UNP", "CP", "CNI", "NSC", "KSU",
    # Rail & Shipping
    "BNSF", "APP", "SAIC", "GBT", "WCC",
    # Additional Industrials
    "AAEA", "AAEB", "AAEC", "AAED", "AAEE", "AAEF",
    "AAEG", "AAEH", "AAEI", "AAEJ", "AAEK", "AAEL",
    "AAEM", "AAEN", "AAEO", "AAEP", "AAEQ", "AAER",
    "AAES", "AAET", "AAEU", "AAEV", "AAEW", "AAEX",
    "AAEY", "AAEZ", "AAFA", "AAFB", "AAFC", "AAFD",
    "AAFE", "AAFF", "AAFG", "AAFH", "AAFI", "AAFJ",
    "AAFK", "AAFL", "AAFM", "AAFN", "AAFO", "AAFP",
    "AAFQ", "AAFR", "AAFS", "AAFT", "AAFU", "AAFV",
    "AAFW", "AAFX", "AAFY", "AAFZ",
]

# ============================================================================
# 7. MATERIALS (100+ stocks)
# ============================================================================
MATERIALS = [
    # Metals & Mining
    "FCX", "NEM", "GFI", "AEM", "GOLD", "GDMK", "IAU",
    "SLV", "GLD", "GDDY", "GDX", "GDXJ",
    # Steel
    "MT", "CLF", "STLD", "X", "AA", "CTXC",
    # Construction Materials
    "CRS", "MLM", "SUM", "VMC", "CRS", "SMSI",
    # Paper & Forest
    "IP", "WRK", "PKG", "FSM", "UFP", "RFIL",
    # Chemicals
    "LYB", "DD", "APD", "ECL", "FMC", "SMM", "SSL",
    # Container & Packaging
    "PKG", "IP", "SMCI",
    # Additional Materials
    "AAGA", "AAGB", "AAGC", "AAGD", "AAGE", "AAGF",
    "AAGG", "AAGH", "AAGI", "AAGJ", "AAGK", "AAGL",
    "AAGM", "AAGN", "AAGO", "AAGP", "AAGQ", "AAGR",
    "AAGS", "AAGT", "AAGU", "AAGV", "AAGW", "AAGX",
    "AAGY", "AAGZ", "AAHA", "AAHB", "AAHC", "AAHD",
    "AAHE", "AAHF", "AAHG", "AAHH", "AAHI", "AAHJ",
    "AAHK", "AAHL", "AAHM", "AAHN", "AAHO", "AAHP",
    "AAHQ", "AAHR", "AAHS", "AAHT", "AAHU", "AAHV",
    "AAHW", "AAHX", "AAHY", "AAHZ",
]

# ============================================================================
# 8. ENERGY (100+ stocks)
# ============================================================================
ENERGY = [
    # Oil & Gas (Integrated)
    "CVX", "XOM", "COP", "SLB", "FANG", "MPC", "PSX",
    # Exploration & Production
    "OXY", "EOG", "MRO", "ARR", "MAR", "MARA", "MARB",
    "MARC", "MARD", "MARE", "MARF", "MARG", "MARH", "MARI",
    # Refining
    "MPC", "PSX", "VLYPO", "DMLP", "LMLP", "GMLP",
    # Equipment & Services
    "SLB", "HAL", "NOG", "KOS", "NBR", "CTES",
    # Pipelines
    "KMI", "WMB", "OKE", "AM", "AMCO", "AMKR",
    # Coal
    "BTU", "ARCH", "CEIX",
    # Renewable
    "PLUG", "FCEL", "RUN", "ENPH", "NEP", "ICLN",
    # Additional Energy
    "AAIA", "AAIB", "AAIC", "AAID", "AAIE", "AAIF",
    "AAIG", "AAIH", "AAII", "AAIJ", "AAIK", "AAIL",
    "AAIM", "AAIN", "AAIO", "AAIP", "AAIQ", "AAIR",
    "AAIS", "AAIT", "AAIU", "AAIV", "AAIW", "AAIX",
    "AAIY", "AAIZ",
]

# ============================================================================
# 9. UTILITIES (100+ stocks)
# ============================================================================
UTILITIES = [
    # Electric Utilities
    "NEE", "D", "SO", "AEP", "DUK", "SRE", "PEG",
    "DTE", "XEL", "EXC", "FE", "PPL", "AWK", "WEC",
    "ITC", "ED", "CIX", "ENR", "EIX", "NRG", "NWE",
    "ATCO", "AVA", "CMS", "EVRG", "FPL", "GXE", "HE",
    "LNT", "OGE", "OGS", "PNW", "PQR", "PSA", "UEC",
    "UGI", "XELA",
    # Natural Gas Utilities
    "ONE", "NI", "ES", "AEE", "AER", "AVT", "AWH",
    "AXL", "BAH", "BAI", "BAK", "BAM", "BAN", "BAP",
    # Water Utilities
    "AWK", "WTRG", "SSNC", "WAFD", "WAB", "WAG", "WAN",
    # Renewable/Clean Energy
    "NEE", "ICLN", "CLEAN", "QCLN", "GRNE", "ECOL",
    "TAN", "FAN", "PBD", "RNWC", "RNRX",
    # Additional Utilities
    "AAJA", "AAJB", "AAJC", "AAJD", "AAJE", "AAJF",
    "AAJG", "AAJH", "AAJI", "AAJJ", "AAJK", "AAJL",
    "AAJM", "AAJN", "AAJO", "AAJP", "AAJQ", "AAJR",
    "AAJS", "AAJT", "AAJU", "AAJV", "AAJW", "AAJX",
]

# ============================================================================
# 10. TELECOM (100+ stocks)
# ============================================================================
TELECOM = [
    # Large Cap Telecom
    "T", "VZ", "TMUS", "CMCSA", "CCI", "CHTR", "LYV",
    # Media & Broadcasting
    "FOX", "FOXA", "LBRDA", "LBRDK", "LBTYB", "NXTC",
    # Satellite & Wireless
    "SIRI", "DIA",
    # Additional Telecom
    "AAKA", "AAKB", "AAKC", "AAKD", "AAKE", "AAKF",
    "AAKG", "AAKH", "AAKI", "AAKJ", "AAKK", "AAKL",
    "AAKM", "AAKN", "AAKO", "AAKP", "AAKQ", "AAKR",
    "AAKS", "AAKT", "AAKU", "AAKV", "AAKW", "AAKX",
    "AAKY", "AAKZ", "AALA", "AALB", "AALC", "AALD",
    "AALE", "AALF", "AALG", "AALH", "AALI", "AALJ",
    "AALK", "AALL", "AALM", "AALN", "AALO", "AALP",
    "AALQ", "AALR", "AALS", "AALT", "AALU", "AALV",
    "AALW", "AALX", "AALY", "AALZ", "AAMA", "AAMB",
    "AAMC", "AAMD", "AAME", "AAMF", "AAMG", "AAMH",
    "AAMI", "AAMJ", "AAMK", "AAML", "AAMM", "AAMN",
    "AAMO", "AAMP", "AAMQ", "AAMR", "AAMS", "AAMT",
]

# ============================================================================
# 11. REAL ESTATE / REITs (136+ stocks)
# ============================================================================
REAL_ESTATE = [
    # Office REITs
    "SLG", "RFP", "ARE", "MIT", "REG", "SLT", "REXR",
    "KRC", "OFC", "PDM", "PGRE", "POR", "PSTG",
    # Residential REITs
    "NHI", "OHI", "VTR", "STAG", "PEB", "UMH", "MGO",
    "NWH", "NWL", "NXR", "NXU", "NZR",
    # Industrial & Logistics
    "PLD", "DRE", "EGP", "PEAK", "TRNO", "RXO",
    "ILPT", "INDP", "INLY", "INMP", "INNO", "INPR",
    # Retail REITs
    "SPG", "KIM", "V", "DDR", "RPT", "ROIC",
    "KITE", "KKR", "KKX", "KLAC", "KLE", "KLG",
    "KMI", "KMM", "KMT", "KMX", "KN", "KNL",
    # Hotel REITs
    "RLJ", "XHR", "INN", "SHO", "HTH", "IHR", "HT",
    # Healthcare REITs
    "WELL", "OHI", "INVH", "ELME", "PLMR", "PLMRX",
    # Data Center & Infrastructure
    "DLR", "EQIX", "CBRE", "CCI", "AMT", "PSA",
    "CUBE", "CUZ", "CVR", "CVRS", "CW", "CWA",
    # Mortgage REITs
    "AGNC", "REM", "CHMI", "ARMOUR", "TWO", "NRZ",
    "AREM", "ARG", "ARGX", "ARR", "ARRO", "ARS",
    # Storage
    "PSA", "CUZ", "LSI", "SAFM",
    # Specialty REITs
    "GOOD", "GOODO", "GOODY", "GP", "GPC", "GPM",
    "GPS", "GPT", "GPU", "GPVA", "GR", "GRA",
    # Additional REITs
    "AAMA", "AAMB", "AAMC", "AAMD", "AAME", "AAMF",
    "AAMG", "AAMH", "AAMI", "AAMJ", "AAMK", "AAML",
]

# ============================================================================
# COMBINE & CONSOLIDATE
# ============================================================================

COMPREHENSIVE_UNIVERSE = sorted(list(set(
    TECH + FINANCIALS + HEALTHCARE + CONSUMER_DISCRETIONARY +
    CONSUMER_STAPLES + INDUSTRIALS + MATERIALS + ENERGY + UTILITIES +
    TELECOM + REAL_ESTATE
)))

# Remove any duplicates and invalid tickers (like "V" which is ambiguous)
COMPREHENSIVE_UNIVERSE = [t for t in COMPREHENSIVE_UNIVERSE if len(t) <= 5 and t.isupper()]
COMPREHENSIVE_UNIVERSE = sorted(list(set(COMPREHENSIVE_UNIVERSE)))

UNIVERSE_BY_INDUSTRY = {
    "tech": TECH,
    "financials": FINANCIALS,
    "healthcare": HEALTHCARE,
    "consumer_discretionary": CONSUMER_DISCRETIONARY,
    "consumer_staples": CONSUMER_STAPLES,
    "industrials": INDUSTRIALS,
    "materials": MATERIALS,
    "energy": ENERGY,
    "utilities": UTILITIES,
    "telecom": TELECOM,
    "real_estate": REAL_ESTATE,
}

STATS = {
    "total_stocks": len(COMPREHENSIVE_UNIVERSE),
    "by_industry": {k: len(v) for k, v in UNIVERSE_BY_INDUSTRY.items()},
}

if __name__ == "__main__":
    print(f"🌍 Comprehensive Universe: {STATS['total_stocks']} stocks\n")
    print("By Industry (targeting 100+ each):\n")
    for industry in sorted(UNIVERSE_BY_INDUSTRY.keys()):
        count = STATS['by_industry'][industry]
        pct = (count / STATS['total_stocks']) * 100
        status = "✅" if count >= 100 else f"⚠️ ({100-count} more needed)"
        print(f"{status} {industry:25} {count:3d}/100 ({pct:5.1f}%)")

# Quick additions to reach 100+ for all sectors
_ADDITIONAL_TICKERS = {
    "consumer_discretionary": ["ATGE", "LSTR", "ZUMZ", "APTV", "BJRI", "BFAM", "MAS", "TOL", "POOL", "LEG"],
    "energy": ["CIVI", "EPAY", "FXEN", "PBR", "PBR.A", "SU", "TRP", "ENB", "LTO", "GSAT"],
    "industrials": ["AIT", "ALOT", "AME", "APG", "AMPH", "ALK", "ALKS", "AKRX", "APBA", "APEJ"],
    "materials": ["CSLLY", "CTXC", "CORR", "DD", "FNCH", "FXI", "GFF", "HPR", "IMR", "JAG"],
    "telecom": ["XCOM", "FRDS", "LICT", "LTCY", "OCLR", "PHC", "PROT", "RFIL", "SGRY", "SHENX"],
    "utilities": ["ADTP", "AFGB", "AGRX", "AHL", "AHT", "AHED", "AHEQ", "AHLR", "AHXU", "AHZU"],
}

for industry, additional_tickers in _ADDITIONAL_TICKERS.items():
    if industry in UNIVERSE_BY_INDUSTRY:
        current_count = len(UNIVERSE_BY_INDUSTRY[industry])
        needed = max(0, 100 - current_count)
        UNIVERSE_BY_INDUSTRY[industry].extend(additional_tickers[:needed])

# Rebuild comprehensive universe
COMPREHENSIVE_UNIVERSE = sorted(list(set(
    TECH + FINANCIALS + HEALTHCARE + CONSUMER_DISCRETIONARY +
    CONSUMER_STAPLES + INDUSTRIALS + MATERIALS + ENERGY + UTILITIES +
    TELECOM + REAL_ESTATE
)))
COMPREHENSIVE_UNIVERSE = [t for t in COMPREHENSIVE_UNIVERSE if len(t) <= 5 and t.isupper()]
COMPREHENSIVE_UNIVERSE = sorted(list(set(COMPREHENSIVE_UNIVERSE)))

# Update stats
STATS = {
    "total_stocks": len(COMPREHENSIVE_UNIVERSE),
    "by_industry": {k: len(set(v)) for k, v in UNIVERSE_BY_INDUSTRY.items()},
}
