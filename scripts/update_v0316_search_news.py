"""Append v0.3.16 row (global search + mobile news fix) to the PM workbook."""
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
        ref = f"{col_name(column)}{row_index}"
        text = html.escape(value or "", quote=False)
        cells.append(f'<c r="{ref}" s="{style}" t="inlineStr"><is><t>{text}</t></is></c>')
    return f'<row r="{row_index}">{"".join(cells)}</row>'


def append_row(xml: str, values: list[str]) -> str:
    rows = [int(m) for m in re.findall(r'<row r="(\d+)"', xml)]
    nxt = max(rows) + 1
    xml = xml.replace("</sheetData>", row_xml(nxt, values) + "</sheetData>")
    max_col = col_name(len(values))
    xml = re.sub(r'<dimension ref="[^"]+"', f'<dimension ref="A1:{max_col}{nxt}"', xml, count=1)
    return xml


updates = {
    "xl/worksheets/sheet8.xml": [
        "Mobile Regression Fix",
        "DONE 2026-05-28 (v0.3.16): Global search universe expanded (AAPL/MSFT/AMZN/META/SPY/QQQ/+ v0.3.6 set) with Enter-to-open and Analyze fallback; per-ticker mock news fallback (generate_mock_news) so every symbol shows source-badged news; used_demo only true for demo/mock, false for real Yahoo. Hamburger menu satisfied by v0.3.15 Workspace Manager.",
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
print("XLSX updated with v0.3.16 row.")
