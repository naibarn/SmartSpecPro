from __future__ import annotations

from .base import BaseParser
from ..extractors import detect_account_or_wallet_id, extract_payment_parties
from ..normalizers import normalize_text

class GenericWalletParser(BaseParser):
    issuer_code = "GENERIC_WALLET"
    issuer_type = "wallet"

    def parse(self, source: dict, issuer: dict, transaction_type: str, parse_options: dict | None = None) -> dict:
        text = normalize_text(source.get("raw_ocr_text"), source.get("short_caption"))
        payer, payee = extract_payment_parties(text)
        wallet_id = detect_account_or_wallet_id(text)
        if wallet_id and not payer.get("wallet_id"):
            payer["wallet_id"] = wallet_id
        txn = self.common_transaction(text, transaction_type or "wallet_payment", channel="wallet_app")
        warnings = []
        if issuer.get("source_used") == "image_only":
            warnings.append("wallet field extraction from image-only input is limited")
        return self.build_result(source, issuer, txn, payer, payee, warnings)