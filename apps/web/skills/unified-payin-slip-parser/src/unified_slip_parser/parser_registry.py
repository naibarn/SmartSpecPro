from __future__ import annotations

from .parsers import (
    BAYParser,
    GenericGovAppParser,
    GenericSlipParser,
    GenericWalletParser,
    GenericBankParser,
    KTBParser,
    PaotangParser,
    SCBParser,
    TTBParser,
    TrueMoneyParser,
)

ISSUER_PARSERS = {
    "KTB": KTBParser,
    "BAY": BAYParser,
    "SCB": SCBParser,
    "TTB": TTBParser,
    "TRUEMONEY": TrueMoneyParser,
    "PAOTANG": PaotangParser,
}

TYPE_PARSERS = {
    "bank": GenericBankParser,
    "wallet": GenericWalletParser,
    "gov_app": GenericGovAppParser,
}

def get_parser(issuer_code: str, issuer_type: str):
    cls = ISSUER_PARSERS.get(issuer_code)
    if cls:
        return cls()
    cls = TYPE_PARSERS.get(issuer_type)
    if cls:
        return cls()
    return GenericSlipParser()