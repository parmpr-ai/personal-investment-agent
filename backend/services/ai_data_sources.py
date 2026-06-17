from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


STATUS_AVAILABLE = "available"
STATUS_PARTIAL = "partial"
STATUS_MISSING = "missing"
STATUS_DISABLED = "disabled"
STATUS_TYPES = (STATUS_AVAILABLE, STATUS_PARTIAL, STATUS_MISSING, STATUS_DISABLED)


@dataclass(frozen=True)
class DataSourceDefinition:
    id: str
    label: str
    category: str
    confidence_weight: float
    description: str = ""


@dataclass
class SourceStatus:
    definition: DataSourceDefinition
    status: str
    enabled: bool = True
    available_fields: list[str] = field(default_factory=list)
    missing_fields: list[str] = field(default_factory=list)
    notes: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.status not in STATUS_TYPES:
            raise ValueError(f"Invalid source status: {self.status}")
        if not self.enabled:
            self.status = STATUS_DISABLED

    @property
    def confidence_impact(self) -> float:
        return confidence_impact_for_status(self.status, self.definition.confidence_weight)

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.definition.id,
            "label": self.definition.label,
            "category": self.definition.category,
            "status": self.status,
            "enabled": self.enabled,
            "coverage_weight": self.definition.confidence_weight,
            "confidence_impact": self.confidence_impact,
            "available_fields": self.available_fields,
            "missing_fields": self.missing_fields,
            "notes": self.notes,
            "metadata": self.metadata,
        }


SOURCE_DEFINITIONS: tuple[DataSourceDefinition, ...] = (
    DataSourceDefinition("fundamentals", "Fundamentals", "market_data", 8, "Company and quote fundamentals."),
    DataSourceDefinition("earnings", "Earnings", "events", 6, "Earnings dates and reported/estimated results."),
    DataSourceDefinition("valuation", "Valuation", "market_data", 7, "PE, EPS, market cap, yield, and valuation ratios."),
    DataSourceDefinition("analyst_targets", "Analyst Targets", "analyst", 6, "Target prices and consensus rating."),
    DataSourceDefinition("analyst_revisions", "Analyst Revisions", "analyst", 5, "Rating trend and recommendation revision inputs."),
    DataSourceDefinition("technical_analysis", "Technical Analysis", "price_action", 8, "Price history, ranges, trend, and technical context."),
    DataSourceDefinition("momentum", "Momentum", "price_action", 7, "Momentum scores or recent price path inputs."),
    DataSourceDefinition("volume", "Volume", "price_action", 5, "Current and average volume context."),
    DataSourceDefinition("news", "News", "sentiment", 7, "Live ticker news and normalized headline digest."),
    DataSourceDefinition("macro", "Macro", "macro", 6, "Market regime, rates, volatility, and broad risk context."),
    DataSourceDefinition("geopolitical", "Geopolitical", "macro", 4, "Geopolitical risk signals."),
    DataSourceDefinition("competitors", "Competitors", "market_data", 4, "Peer and competitor context."),
    DataSourceDefinition("upcoming_events", "Upcoming Events", "events", 5, "Known catalysts and calendar events."),
    DataSourceDefinition("portfolio_positions", "Portfolio Positions", "portfolio", 8, "Current portfolio exposure for the symbol."),
    DataSourceDefinition("ibkr", "IBKR", "portfolio", 5, "Live IBKR portfolio and execution connector."),
    DataSourceDefinition("advisor_discord", "Advisor Discord", "sentiment", 4, "Advisor Discord signal connector."),
    DataSourceDefinition("x_sentiment", "X Sentiment", "sentiment", 3, "X/social sentiment connector."),
    DataSourceDefinition("seeking_alpha", "Seeking Alpha", "sentiment", 2, "Seeking Alpha RSS/authenticated connector."),
)

SOURCE_DEFINITION_MAP = {definition.id: definition for definition in SOURCE_DEFINITIONS}
SOURCE_IDS = tuple(definition.id for definition in SOURCE_DEFINITIONS)


def get_source_definition(source_id: str) -> DataSourceDefinition:
    try:
        return SOURCE_DEFINITION_MAP[source_id]
    except KeyError as exc:
        raise ValueError(f"Unknown source id: {source_id}") from exc


def has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, dict):
        return any(has_value(item) for item in value.values())
    if isinstance(value, (list, tuple, set)):
        return any(has_value(item) for item in value)
    return True


def get_path(payload: dict[str, Any] | None, path: str) -> Any:
    current: Any = payload or {}
    for part in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def present_fields(payload: dict[str, Any] | None, fields: list[str] | tuple[str, ...]) -> list[str]:
    return [field for field in fields if has_value(get_path(payload, field))]


def source_status(
    source_id: str,
    status: str,
    *,
    enabled: bool = True,
    available_fields: list[str] | tuple[str, ...] | None = None,
    missing_fields: list[str] | tuple[str, ...] | None = None,
    notes: str = "",
    metadata: dict[str, Any] | None = None,
) -> SourceStatus:
    return SourceStatus(
        definition=get_source_definition(source_id),
        status=status,
        enabled=enabled,
        available_fields=list(available_fields or []),
        missing_fields=list(missing_fields or []),
        notes=notes,
        metadata=metadata or {},
    )


def status_from_fields(
    source_id: str,
    payload: dict[str, Any] | None,
    fields: list[str] | tuple[str, ...],
    *,
    enabled: bool = True,
    notes: str = "",
    metadata: dict[str, Any] | None = None,
) -> SourceStatus:
    if not enabled:
        return source_status(source_id, STATUS_DISABLED, enabled=False, notes=notes, metadata=metadata)

    available = present_fields(payload, fields)
    missing = [field for field in fields if field not in available]
    if len(available) == len(fields) and fields:
        status = STATUS_AVAILABLE
    elif available:
        status = STATUS_PARTIAL
    else:
        status = STATUS_MISSING
    return source_status(
        source_id,
        status,
        available_fields=available,
        missing_fields=missing,
        notes=notes,
        metadata=metadata,
    )


def confidence_impact_for_status(status: str, weight: float) -> float:
    if status == STATUS_MISSING:
        return -round(weight, 2)
    if status == STATUS_PARTIAL:
        return -round(weight * 0.5, 2)
    return 0.0


def _coverage_value(status: str) -> float:
    if status == STATUS_AVAILABLE:
        return 1.0
    if status == STATUS_PARTIAL:
        return 0.5
    return 0.0


def summarize_sources(statuses: list[SourceStatus]) -> dict[str, Any]:
    enabled_statuses = [row for row in statuses if row.status != STATUS_DISABLED]
    denominator = sum(row.definition.confidence_weight for row in enabled_statuses)
    numerator = sum(row.definition.confidence_weight * _coverage_value(row.status) for row in enabled_statuses)
    all_denominator = sum(row.definition.confidence_weight for row in statuses)
    all_numerator = sum(row.definition.confidence_weight * _coverage_value(row.status) for row in statuses)
    confidence_impact = round(sum(row.confidence_impact for row in enabled_statuses), 2)

    counts = {status: 0 for status in STATUS_TYPES}
    for row in statuses:
        counts[row.status] += 1

    return {
        "coverage_percent": round((numerator / denominator) * 100, 1) if denominator else 100.0,
        "coverage_all_sources_percent": round((all_numerator / all_denominator) * 100, 1) if all_denominator else 100.0,
        "source_count": len(statuses),
        "enabled_source_count": len(enabled_statuses),
        "status_counts": counts,
        "confidence_impact": confidence_impact,
        "confidence_score_ceiling": max(0.0, round(100 + confidence_impact, 1)),
        "confidence_rule": "Missing sources never block a verdict; they only reduce confidence.",
    }


def _setting_bool(settings: dict[str, Any], flat_key: str, section: str, default: bool = False) -> bool:
    if flat_key in settings:
        return bool(settings.get(flat_key))
    cfg = settings.get(section) or {}
    if isinstance(cfg, dict) and "enabled" in cfg:
        return bool(cfg.get("enabled"))
    return default


class ConnectorBase:
    source_id = ""
    setting_key = ""
    settings_section = ""
    missing_note = "Connector is enabled but no live data adapter has provided inputs."

    def __init__(self, settings: dict[str, Any] | None = None):
        self.settings = settings or {}

    @property
    def enabled(self) -> bool:
        return _setting_bool(self.settings, self.setting_key, self.settings_section, default=False)

    def status(self, symbol: str | None = None, payload: dict[str, Any] | None = None) -> SourceStatus:
        if not self.enabled:
            return source_status(
                self.source_id,
                STATUS_DISABLED,
                enabled=False,
                notes=f"{self.setting_key} is disabled.",
                metadata={"symbol": symbol, "setting": self.setting_key},
            )
        if has_value(payload):
            return source_status(
                self.source_id,
                STATUS_AVAILABLE,
                available_fields=["payload"],
                notes="Connector payload supplied by caller.",
                metadata={"symbol": symbol, "setting": self.setting_key},
            )
        return source_status(
            self.source_id,
            STATUS_MISSING,
            available_fields=[],
            missing_fields=["signals"],
            notes=self.missing_note,
            metadata={"symbol": symbol, "setting": self.setting_key},
        )


class DiscordConnector(ConnectorBase):
    source_id = "advisor_discord"
    setting_key = "enableDiscordSignals"
    settings_section = "discord_advisor"
    missing_note = "Discord signal connector is enabled, but no Discord signal adapter is configured yet."


class XSentimentConnector(ConnectorBase):
    source_id = "x_sentiment"
    setting_key = "enableXSentiment"
    settings_section = "x_sentiment"
    missing_note = "X sentiment connector is enabled, but no X sentiment adapter is configured yet."


class SeekingAlphaConnector(ConnectorBase):
    source_id = "seeking_alpha"
    setting_key = "enableSeekingAlpha"
    settings_section = "seeking_alpha"
    missing_note = "Seeking Alpha connector is enabled, but no normalized ticker-level payload is available."

    def status(self, symbol: str | None = None, payload: dict[str, Any] | None = None) -> SourceStatus:
        if not self.enabled:
            return source_status(
                self.source_id,
                STATUS_DISABLED,
                enabled=False,
                notes=f"{self.setting_key} is disabled.",
                metadata={"symbol": symbol, "setting": self.setting_key},
            )
        if has_value(payload):
            return source_status(
                self.source_id,
                STATUS_AVAILABLE,
                available_fields=["payload"],
                notes="Seeking Alpha payload supplied by caller.",
                metadata={"symbol": symbol, "setting": self.setting_key},
            )

        cfg = self.settings.get(self.settings_section) or {}
        configured_fields: list[str] = []
        if isinstance(cfg, dict) and cfg.get("rss_enabled") and cfg.get("rss_urls"):
            configured_fields.append("rss_urls")
        if isinstance(cfg, dict) and cfg.get("authenticated_enabled") and cfg.get("cookie_header"):
            configured_fields.append("authenticated_session")
        if configured_fields:
            return source_status(
                self.source_id,
                STATUS_PARTIAL,
                available_fields=configured_fields,
                missing_fields=["normalized_symbol_signals"],
                notes="Seeking Alpha access is configured; ticker-level normalization is pending.",
                metadata={"symbol": symbol, "setting": self.setting_key},
            )
        return source_status(
            self.source_id,
            STATUS_MISSING,
            missing_fields=["rss_urls", "authenticated_session", "normalized_symbol_signals"],
            notes=self.missing_note,
            metadata={"symbol": symbol, "setting": self.setting_key},
        )
