"""Minimal RSS/Atom feed parser using stdlib only — replaces feedparser dependency."""
import xml.etree.ElementTree as ET
from typing import Any, Dict, List
import httpx

_NS = {"atom": "http://www.w3.org/2005/Atom"}
_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; InvestAgent/6.0)"}


class _Entry(dict):
    def get(self, key, default=None):
        return super().get(key, default)


class _Feed:
    def __init__(self, entries: List[Dict], error: str = ""):
        self.entries = [_Entry(e) for e in entries]
        self.error = error

    def __getattr__(self, name: str):
        return None


def _text(el, tag: str, ns: str = "") -> str:
    full = f"{{{_NS[ns]}}}{tag}" if ns else tag
    child = el.find(full)
    return (child.text or "").strip() if child is not None else ""


def parse(url: str, timeout: float = 8) -> _Feed:
    try:
        r = httpx.get(url, timeout=timeout, headers=_HEADERS, follow_redirects=True)
        r.raise_for_status()
        root = ET.fromstring(r.text)
    except Exception as e:
        return _Feed([], str(e))
    entries: List[Dict] = []
    for item in root.findall(".//item"):
        entries.append({
            "title": _text(item, "title"),
            "link": _text(item, "link"),
            "published": _text(item, "pubDate"),
            "summary": _text(item, "description"),
        })
    for entry in root.findall(f".//{{{_NS['atom']}}}entry"):
        link_el = entry.find(f"{{{_NS['atom']}}}link")
        entries.append({
            "title": _text(entry, "title", "atom"),
            "link": link_el.get("href", "") if link_el is not None else "",
            "published": _text(entry, "published", "atom") or _text(entry, "updated", "atom"),
            "summary": _text(entry, "summary", "atom"),
        })
    return _Feed(entries)
