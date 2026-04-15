from __future__ import annotations

from .base import BaseParser
from ..extractors import extract_payment_parties, extract_transfer_parties
from ..normalizers import normalize_text

class GenericBankParser(BaseParser):
    issuer_code = "GENERIC_BANK"
    issuer_type = "bank"

    def parse(self, source: dict, issuer: dict, transaction_type: str, parse_options: dict | None = None) -> dict:
        text = normalize_text(source.get("raw_ocr_text"), source.get("short_caption"))
        if transaction_type == "transfer_between_accounts":
            payer, payee = extract_transfer_parties(text)
        else:
            payer, payee = extract_payment_parties(text)
        txn = self.common_transaction(text, transaction_type, channel="mobile_banking")
        warnings = []
        if issuer.get("source_used") == "image_only":
            warnings.append("image-only parsing is limited without OCR text")
        return self.build_result(source, issuer, txn, payer, payee, warnings)