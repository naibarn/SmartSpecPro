from __future__ import annotations

from .generic_bank import GenericBankParser

class TTBParser(GenericBankParser):
    issuer_code = "TTB"
    issuer_type = "bank"