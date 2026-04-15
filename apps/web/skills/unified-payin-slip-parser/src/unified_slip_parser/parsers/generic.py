from __future__ import annotations

from .base import BaseParser
from .generic_bank import GenericBankParser
from .generic_wallet import GenericWalletParser
from .generic_gov_app import GenericGovAppParser

class GenericSlipParser(BaseParser):
    issuer_code = "GENERIC"
    issuer_type = "unknown"

    def __init__(self) -> None:
        self.bank = GenericBankParser()
        self.wallet = GenericWalletParser()
        self.gov = GenericGovAppParser()

    def parse(self, source: dict, issuer: dict, transaction_type: str, parse_options: dict | None = None) -> dict:
        issuer_type = issuer.get("issuer_type", "unknown")
        if issuer_type == "bank":
            return self.bank.parse(source, issuer, transaction_type, parse_options)
        if issuer_type == "wallet":
            return self.wallet.parse(source, issuer, transaction_type, parse_options)
        if issuer_type == "gov_app":
            return self.gov.parse(source, issuer, transaction_type, parse_options)
        txn = self.common_transaction(source.get("raw_ocr_text", "") + " " + source.get("short_caption", ""), transaction_type or "unknown", channel="unknown")
        return self.build_result(source, issuer, txn, {}, {}, ["generic unknown parser used"])