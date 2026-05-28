"""
Append v0.3.15 runtime governance row (Single Next Dev Server Rule) to the
PM operational workbook. Reuses the inline-string append pattern from prior
governance scripts.
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
    rows = [int(m) for m in re.findall(r'<row r="(\d+)"', xml)]
    next_row = max(rows) + 1
    xml = xml.replace("</sheetData>", row_xml(next_row, values) + "</sheetData>")
    max_col = col_name(len(values))
    xml = re.sub(r'<dimension ref="[^"]+"', f'<dimension ref="A1:{max_col}{next_row}"', xml, count=1)
    return xml


updates = {
    "xl/worksheets/sheet8.xml": [
        "Runtime Governance",
        "LOCKED 2026-05-28 (v0.3.15): Single Next Dev Server Rule — only one Next dev server may run; check port 3000 first; kill stale node/next/npm and delete frontend/.next before restart; start LAN-bound (npm run dev -- -H 0.0.0.0); never run npm run build against a live dev server's .next; unstyled mobile = suspect stale/corrupt .next (404 CSS chunk), not UI code.",
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
print("XLSX updated with v0.3.15 runtime governance row.")
