from __future__ import annotations

import re
from .generic_bank import GenericBankParser
from ..normalizers import normalize_text

class BAYParser(GenericBankParser):
    issuer_code = "BAY"
    issuer_type = "bank"

    def parse(self, source: dict, issuer: dict, transaction_type: str, parse_options: dict | None = None) -> dict:
        result = super().parse(source, issuer, transaction_type, parse_options)
        text = normalize_text(source.get("raw_ocr_text"), source.get("short_caption"))
        if not result["transaction"].get("reference_id"):
            m = re.search(r"(BAYM\d+)", text, flags=re.IGNORECASE)
            if m:
                result["transaction"]["reference_id"] = m.group(1)
        if "ชำระด้วย qr สำเร็จ" in text.lower():
            result["transaction"]["transaction_type"] = "qr_payment"
        return result