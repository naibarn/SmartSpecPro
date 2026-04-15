from __future__ import annotations

import re
from .generic_bank import GenericBankParser
from ..normalizers import normalize_text

class KTBParser(GenericBankParser):
    issuer_code = "KTB"
    issuer_type = "bank"

    def parse(self, source: dict, issuer: dict, transaction_type: str, parse_options: dict | None = None) -> dict:
        result = super().parse(source, issuer, transaction_type, parse_options)
        text = normalize_text(source.get("raw_ocr_text"), source.get("short_caption"))
        if not result["transaction"].get("reference_id"):
            m = re.search(r"รหัสอ้างอิง\s*([A-Za-z0-9]+)", text)
            if m:
                result["transaction"]["reference_id"] = m.group(1)
        if not result["transaction"].get("merchant_code"):
            m = re.search(r"รหัสร้านค้า\s*([A-Z0-9]+)", text)
            if m:
                result["transaction"]["merchant_code"] = m.group(1)
        if not result["transaction"].get("merchant_reference"):
            m = re.search(r"รหัสธุรกรรม\s*([A-Z0-9]+)", text)
            if m:
                result["transaction"]["merchant_reference"] = m.group(1)
        return result