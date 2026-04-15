from __future__ import annotations

from .generic_bank import GenericBankParser

class SCBParser(GenericBankParser):
    issuer_code = "SCB"
    issuer_type = "bank"