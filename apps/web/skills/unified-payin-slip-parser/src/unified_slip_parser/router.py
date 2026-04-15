from __future__ import annotations

from .detectors import detect_issuer, detect_transaction_type
from .normalizers import normalize_text
from .parser_registry import get_parser

def parse_slip(payload: dict) -> dict:
    source = payload.get("source", {})
    parse_options = payload.get("parse_options", {})
    text = normalize_text(source.get("raw_ocr_text"), source.get("short_caption"))
    issuer = detect_issuer(source, parse_options)
    transaction_type = detect_transaction_type(text, issuer) if parse_options.get("auto_detect_transaction_type", True) else "unknown"
    parser = get_parser(issuer.get("issuer_code", "UNKNOWN"), issuer.get("issuer_type", "unknown"))
    return parser.parse(source, issuer, transaction_type, parse_options)