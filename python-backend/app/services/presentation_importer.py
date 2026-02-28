"""
Shared types for presentation import.

Both PptxImporter and GSlidesImporter return ImportResult.
"""
from dataclasses import dataclass, field


@dataclass
class ImportResult:
    """Result of parsing a presentation file into SmartSpecPro slide content."""

    slides: list[dict]
    """List of PresentationSlideContent dicts, one per slide."""

    fidelity_warnings: list[str] = field(default_factory=list)
    """Capped at 25 items. Each string describes a feature that could not be fully preserved."""
