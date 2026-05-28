"""
Update XLSX workbook with v0.3.6 Hybrid Mock Intelligence Data Layer entries.
"""
from __future__ import annotations
import html, re, shutil, tempfile, zipfile
from pathlib import Path

WORKBOOK = Path("docs/PIA_MASTER_BACKLOG_SOURCE_OF_TRUTH.xlsx")


def col_name(index: int) -> str:
    value = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        value = chr(65 + remainder) + value
    return value


def row_xml(row_index: int, values: list[str], style: str = "12") -> str:
    cells = []
    for column, value in enumerate(values, start=1):
        reference = f"{col_name(column)}{row_index}"
        text = html.escape(value or "", quote=False)
        cells.append(f'<c r="{reference}" s="{style}" t="inlineStr"><is><t>{text}</t></is></c>')
    return f'<row r="{row_index}">{"".join(cells)}</row>'


def append_row(xml: str, values: list[str]) -> str:
    rows = [int(match) for match in re.findall(r'<row r="(\d+)"', xml)]
    next_row = max(rows) + 1
    xml = xml.replace("</sheetData>", row_xml(next_row, values) + "</sheetData>")
    max_col = col_name(len(values))
    xml = re.sub(r'<dimension ref="[^"]+"', f'<dimension ref="A1:{max_col}{next_row}"', xml, count=1)
    return xml


updates = {
    "xl/worksheets/sheet2.xml": [
        "DATA-HYBRID-MOCK-LAYER",
        "Platform",
        "Data Layer",
        "Hybrid mock intelligence data layer",
        (
            "Created backend/mock_intelligence_data.py with Bloomberg-lite mock data for NVDA, AMD, SOFI, IREN, "
            "AVAV, GOOGL, TSLA, CRWV, NBIS. Includes company profile, financials, ratios, earnings, analyst "
            "targets, and technical levels. Integrated into /stock/{ticker} intelligence response. "
            "IREN added to positions; AVAV+TSLA added to watchlist. Live news/videos preserved."
        ),
        "P0",
        "DONE",
        "HEPHAESTUS + APOLLO",
        "Sprint 2C",
        "2026-05-28",
        "2026-05-28",
        "v0.3.6",
        "Mock prices calibrated to 2026-05-28. Live IBKR or Yahoo needed for real-time prices.",
    ],
    "xl/worksheets/sheet3.xml": [
        "Sprint 2C",
        "Data Layer",
        "Deploy hybrid mock intelligence data for UI evaluation",
        "backend/mock_intelligence_data.py; state.py IREN+AVAV+TSLA; stock_intelligence.py merge",
        "HEPHAESTUS + APOLLO",
        "DONE",
        "Live news/videos preserved; mock used for fundamentals and technicals only",
    ],
    "xl/worksheets/sheet8.xml": [
        "Data Layer",
        "DONE 2026-05-28: Hybrid mock intelligence data layer v0.3.6 deployed. 9 tickers with company, "
        "fundamentals, ratios, earnings, targets, technical levels. IREN in positions, AVAV+TSLA in watchlist.",
    ],
}

with zipfile.ZipFile(WORKBOOK, "r") as source:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as handle:
        temp_path = Path(handle.name)
    with zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED) as target:
        for item in source.infolist():
            data = source.read(item.filename)
            if item.filename in updates:
                data = append_row(data.decode("utf-8"), updates[item.filename]).encode("utf-8")
            target.writestr(item, data)

shutil.move(str(temp_path), WORKBOOK)
print("XLSX updated with v0.3.6 entries.")
