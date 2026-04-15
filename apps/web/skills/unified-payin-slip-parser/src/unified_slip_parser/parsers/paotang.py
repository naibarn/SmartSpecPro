from __future__ import annotations

from .generic_gov_app import GenericGovAppParser
from ..normalizers import normalize_text

class PaotangParser(GenericGovAppParser):
    issuer_code = "PAOTANG"
    issuer_type = "gov_app"

    def parse(self, source: dict, issuer: dict, transaction_type: str, parse_options: dict | None = None) -> dict:
        result = super().parse(source, issuer, transaction_type or "wallet_payment", parse_options)
        text = normalize_text(source.get("raw_ocr_text"), source.get("short_caption"))
        result["transaction"]["channel"] = "gov_app"
        if "g-wallet" in text.lower() or "g wallet" in text.lower():
            result["transaction"]["transaction_type"] = "wallet_payment"
        return result