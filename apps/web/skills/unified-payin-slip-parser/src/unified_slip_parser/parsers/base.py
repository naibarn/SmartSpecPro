from __future__ import annotations

from ..extractors import extract_datetime, extract_merchants, extract_money, extract_references
from ..normalizers import compatibility_from_issuer, normalize_text

class BaseParser:
    issuer_code = "BASE"
    issuer_type = "unknown"

    def common_transaction(self, text: str, transaction_type: str, channel: str) -> dict:
        txn = {
            "status": "success" if ("สำเร็จ" in text or "success" in text.lower()) else None,
            "transaction_type": transaction_type,
            "channel": channel,
        }
        txn.update(extract_references(text))
        txn.update(extract_merchants(text))
        txn.update(extract_money(text))
        txn.update(extract_datetime(text))
        return txn

    def build_result(self, source: dict, issuer: dict, transaction: dict, payer: dict, payee: dict, warnings: list[str] | None = None) -> dict:
        warnings = warnings or []
        missing = []
        if transaction.get("amount") is None:
            missing.append("transaction.amount")
        if not payer and not payee:
            warnings.append("party extraction is partial")
        return {
            "detected_issuer": issuer,
            "transaction": transaction,
            "payer": payer,
            "payee": payee,
            "compatibility": compatibility_from_issuer(issuer.get("issuer_code", "UNKNOWN"), issuer.get("issuer_type", "unknown")),
            "validation": {
                "is_valid": len(missing) == 0,
                "warnings": warnings,
                "missing_fields": missing,
            },
            "raw": {
                "raw_ocr_text": source.get("raw_ocr_text", ""),
                "short_caption": source.get("short_caption", ""),
                "image_path": source.get("image_path", ""),
            }
        }

    def parse(self, source: dict, issuer: dict, transaction_type: str, parse_options: dict | None = None) -> dict:
        raise NotImplementedError