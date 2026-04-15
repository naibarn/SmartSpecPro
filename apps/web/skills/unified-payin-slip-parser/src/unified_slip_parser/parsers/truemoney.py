from __future__ import annotations

import re
from .generic_wallet import GenericWalletParser
from ..normalizers import normalize_text

class TrueMoneyParser(GenericWalletParser):
    issuer_code = "TRUEMONEY"
    issuer_type = "wallet"

    def parse(self, source: dict, issuer: dict, transaction_type: str, parse_options: dict | None = None) -> dict:
        result = super().parse(source, issuer, transaction_type or "wallet_payment", parse_options)
        text = normalize_text(source.get("raw_ocr_text"), source.get("short_caption"))
        m = re.search(r"(TMN[_A-Z0-9-]+)", text, flags=re.IGNORECASE)
        if m:
            result["transaction"]["reference_id"] = m.group(1)
        result["transaction"]["channel"] = "wallet_app"
        if result["transaction"]["transaction_type"] == "unknown":
            result["transaction"]["transaction_type"] = "wallet_payment"
        return result