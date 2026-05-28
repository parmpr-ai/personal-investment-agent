"""
Idempotently append v0.3.15 Workspace Manager + Custom Workspaces rows to the PM workbook.
"""
from __future__ import annotations

import html
import re
import shutil
import tempfile
import zipfile
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


def append_rows(xml: str, rows_to_add: list[list[str]]) -> str:
    xml = re.sub(
        r'<row r="\d+">(?:(?!</row>).)*Workspace Manager \+ Custom Workspaces(?:(?!</row>).)*</row>',
        "",
        xml,
    )
    xml = re.sub(
        r'<row r="\d+">(?:(?!</row>).)*Mobile hamburger manager(?:(?!</row>).)*</row>',
        "",
        xml,
    )
    rows = [int(m) for m in re.findall(r'<row r="(\d+)"', xml)]
    next_row = max(rows) + 1
    for values in rows_to_add:
        xml = xml.replace("</sheetData>", row_xml(next_row, values) + "</sheetData>")
        next_row += 1
    max_col = col_name(max(len(values) for values in rows_to_add))
    xml = re.sub(r'<dimension ref="[^"]+"', f'<dimension ref="A1:{max_col}{next_row - 1}"', xml, count=1)
    return xml


updates = {
    "xl/worksheets/sheet1.xml": [
        [
            "v0.3.15",
            "Workspace Manager + Custom Workspaces",
            "Implemented 2026-05-28",
            "Mobile hamburger manager, direct overflow workspace open, Settings/About access, configurable pinned bottom nav, desktop sidebar parity, custom local workspaces.",
        ],
    ],
    "xl/worksheets/sheet8.xml": [
        [
            "Workspace Manager",
            "IMPLEMENTED 2026-05-28 (v0.3.15): Mobile top-left hamburger opens Workspace Manager; Settings/About are accessible; all/overflow workspaces can open directly; bottom nav uses pia.workspaces.pinnedMobile capped at five; desktop sidebar uses pia.workspaces.sidebarDesktop; custom workspaces persist in pia.workspaces.custom; shared order persists in pia.workspaces.order.",
        ],
    ],
}

with zipfile.ZipFile(WORKBOOK, "r") as source:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as handle:
        temp_path = Path(handle.name)
    with zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED) as target:
        for item in source.infolist():
            data = source.read(item.filename)
            if item.filename in updates:
                data = append_rows(data.decode("utf-8"), updates[item.filename]).encode("utf-8")
            target.writestr(item, data)

shutil.move(str(temp_path), WORKBOOK)
print("XLSX updated with v0.3.15 Workspace Manager rows.")
