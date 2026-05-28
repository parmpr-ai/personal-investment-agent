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


def append_row(xml: str, values: list[str]) -> str:
    rows = [int(match) for match in re.findall(r'<row r="(\d+)"', xml)]
    next_row = max(rows) + 1
    xml = xml.replace("</sheetData>", row_xml(next_row, values) + "</sheetData>")
    max_col = col_name(len(values))
    xml = re.sub(r'<dimension ref="[^"]+"', f'<dimension ref="A1:{max_col}{next_row}"', xml, count=1)
    return xml


updates = {
    "xl/worksheets/sheet2.xml": [
        "DESIGN-GOV-MOCK-FIRST",
        "Platform",
        "Design Governance",
        "Mock-first design governance system",
        "Created locked design-system docs and mock storage hierarchy. UI implementation now requires approved mock, design-system rule, mobile-first principle, and changelog reference.",
        "P0",
        "DONE",
        "ATHENA + HERMES",
        "Sprint 2C",
        "2026-05-28",
        "2026-05-28",
        "v0.3.5",
        "Portfolio Snapshot redesign is blocked until approved mobile mock.",
    ],
    "xl/worksheets/sheet3.xml": [
        "Sprint 2C",
        "Design Governance",
        "Lock mock-first workflow before further UI implementation",
        "Design-system docs; mock folders; mandatory PO review gate; Portfolio Snapshot mobile mock gate",
        "ATHENA + HERMES",
        "DONE",
        "Mock-first gate required before UI changes",
    ],
    "xl/worksheets/sheet4.xml": [
        "DEC-MOCK-FIRST",
        "Design Governance",
        "Mock-first development is mandatory before UI implementation",
        "LOCKED",
        "No widget, screen, workspace, navigation change, or major refactor may be implemented before mock creation, PO review, corrections, APPROVED status, and storage in docs/design-system/mocks/.",
    ],
    "xl/worksheets/sheet6.xml": [
        "MOCK-GOV-001",
        "Mock-first governance",
        "Approved mocks are mandatory implementation references and must live under docs/design-system/mocks/.",
        "LOCKED",
        "Portfolio Snapshot requires approved mobile mock before redesign.",
    ],
    "xl/worksheets/sheet7.xml": [
        "TASK-DESIGN-GOV-MOCK-FIRST",
        "ATHENA + HERMES",
        "feat/pia-v3-foundation-integration",
        "Design governance + mock-first workflow",
        "Create design-system docs, mock directories, mandatory mock-first rules, Portfolio Snapshot gate, and governance updates.",
        "IMPLEMENTED",
        "Docs diff/check clean",
        "Use approved mocks before further UI implementation.",
    ],
    "xl/worksheets/sheet8.xml": [
        "Design Governance",
        "LOCKED 2026-05-28: Mock-first development is mandatory; approved mocks must be stored under docs/design-system/mocks/ before UI implementation.",
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
