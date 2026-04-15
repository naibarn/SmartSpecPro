from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

from app.services.finance_ocr_debug_trace import write_finance_ocr_debug_event

SKILL_SRC = Path(__file__).resolve().parents[3] / "apps/web/skills/unified-payin-slip-parser/src"
if SKILL_SRC.exists():
    skill_src = str(SKILL_SRC)
    if skill_src not in sys.path:
        sys.path.insert(0, skill_src)

from unified_slip_parser.router import parse_slip


def _coerce_text(value: Any) -> str:
    return str(value or "").strip()


def _clean_ocr_text(value: Any) -> str:
    text = _coerce_text(value)
    if not text:
        return ""

    cleaned_lines: list[str] = []
    seen: set[str] = set()
    for raw_line in re.split(r"[\r\n]+", text):
        line = re.sub(r"\s+", " ", _coerce_text(raw_line)).strip()
        if not line:
            continue
        lowered = line.lower()
        if lowered in seen:
            continue
        if lowered.startswith("{") and ("shortcaption" in lowered or "detailedcaption" in lowered or "ocrtext" in lowered):
            continue
        seen.add(lowered)
        cleaned_lines.append(line)
    return "\n".join(cleaned_lines).strip()


def _format_amount(amount: Any, currency: Any) -> str | None:
    if not isinstance(amount, (int, float)) or amount <= 0:
        return None
    safe_currency = _coerce_text(currency).upper() or "THB"
    try:
        return f"{amount:,.2f} {safe_currency}"
    except Exception:
        return f"{amount} {safe_currency}"


def _format_party(party: dict[str, Any] | None) -> str | None:
    if not isinstance(party, dict):
        return None
    parts: list[str] = []
    name = _coerce_text(party.get("name"))
    issuer_name = _coerce_text(party.get("issuer_name"))
    account_number = _coerce_text(party.get("account_number"))
    merchant_name = _coerce_text(party.get("merchant_name"))
    if name:
        parts.append(name)
    elif merchant_name:
        parts.append(merchant_name)
    if issuer_name and issuer_name not in parts:
        parts.append(issuer_name)
    if account_number:
        parts.append(account_number)
    return " · ".join(parts) if parts else None


def _format_transaction_type(transaction_type: str) -> str:
    return {
        "transfer_between_accounts": "โอนเงินระหว่างบัญชี",
        "bill_payment": "จ่ายบิล",
        "wallet_payment": "ชำระเงินผ่านวอลเล็ท",
        "qr_payment": "จ่ายผ่าน QR",
        "payment": "จ่ายเงิน",
        "unknown": "สลิปโอนเงิน",
    }.get(transaction_type, transaction_type or "สลิปโอนเงิน")


def _summarize_transaction(parsed: dict[str, Any]) -> str:
    issuer = parsed.get("detected_issuer") if isinstance(parsed.get("detected_issuer"), dict) else {}
    transaction = parsed.get("transaction") if isinstance(parsed.get("transaction"), dict) else {}
    payer = parsed.get("payer") if isinstance(parsed.get("payer"), dict) else {}
    payee = parsed.get("payee") if isinstance(parsed.get("payee"), dict) else {}
    validation = parsed.get("validation") if isinstance(parsed.get("validation"), dict) else {}

    transaction_type = _coerce_text(transaction.get("transaction_type"))
    amount = _format_amount(transaction.get("amount"), transaction.get("currency"))
    fee = _format_amount(transaction.get("fee"), transaction.get("fee_currency"))
    reference_id = _coerce_text(transaction.get("reference_id"))
    merchant_code = _coerce_text(transaction.get("merchant_code"))
    merchant_reference = _coerce_text(transaction.get("merchant_reference"))
    merchant_tax_id = _coerce_text(transaction.get("merchant_tax_id"))
    raw_date_text = _coerce_text(transaction.get("transaction_datetime_local") or transaction.get("raw_date_text"))
    issuer_name = _coerce_text(issuer.get("issuer_name_th") or issuer.get("issuer_name_en") or issuer.get("issuer_code"))
    issuer_type = _coerce_text(issuer.get("issuer_type"))
    status = _coerce_text(transaction.get("status"))
    payer_line = _format_party(payer)
    payee_line = _format_party(payee)
    warnings = validation.get("warnings") if isinstance(validation.get("warnings"), list) else []
    missing_fields = validation.get("missing_fields") if isinstance(validation.get("missing_fields"), list) else []

    type_label = _format_transaction_type(transaction_type)

    lines = [
        "สรุปรายการสลิปโอนเงิน",
        f"• ประเภท: {type_label}",
    ]
    if issuer_name:
        lines.append(f"• ผู้ให้บริการ: {issuer_name}" + (f" ({issuer_type})" if issuer_type else ""))
    if status:
        lines.append(f"• สถานะ: {status}")
    if amount:
        lines.append(f"• จำนวนเงิน: {amount}")
    if fee:
        lines.append(f"• ค่าธรรมเนียม: {fee}")
    if payer_line:
        lines.append(f"• โอนจาก: {payer_line}")
    if payee_line:
        lines.append(f"• โอนไปยัง: {payee_line}")
    if reference_id:
        lines.append(f"• รหัสอ้างอิง: {reference_id}")
    if merchant_code:
        lines.append(f"• รหัสร้านค้า: {merchant_code}")
    if merchant_reference:
        lines.append(f"• หมายเลขอ้างอิงร้านค้า: {merchant_reference}")
    if merchant_tax_id:
        lines.append(f"• เลขผู้เสียภาษี: {merchant_tax_id}")
    if raw_date_text:
        lines.append(f"• วันที่และเวลา: {raw_date_text}")
    if missing_fields:
        lines.append(f"• ข้อมูลที่ยังไม่ครบ: {', '.join(str(item) for item in missing_fields)}")
    if warnings:
        lines.append(f"• หมายเหตุ: {'; '.join(str(item) for item in warnings[:3])}")

    return "\n".join(lines).strip()


def parse_and_summarize_payin_slip(payload: dict[str, Any]) -> dict[str, Any]:
    trace_id = _coerce_text(payload.get("trace_id") or payload.get("traceId"))
    source = payload.get("source", {}) if isinstance(payload.get("source"), dict) else {}
    write_finance_ocr_debug_event(
        "finance_ocr.unified_payin_slip.parser.input",
        {
            "trace_id": trace_id or None,
            "source_keys": sorted(str(key) for key in source.keys())[:50],
            "raw_ocr_text_length": len(_coerce_text(source.get("raw_ocr_text") or source.get("ocr_text") or source.get("full_text"))),
            "short_caption_length": len(_coerce_text(source.get("short_caption"))),
            "detailed_caption_length": len(_coerce_text(source.get("detailed_caption"))),
            "filename": _coerce_text(source.get("filename")),
            "image_path_present": bool(_coerce_text(source.get("image_path"))),
            "parse_option_keys": sorted(str(key) for key in (payload.get("parse_options") or {}).keys())[:50]
            if isinstance(payload.get("parse_options"), dict)
            else [],
        },
    )
    cleaned_raw_ocr = _clean_ocr_text(source.get("raw_ocr_text") or source.get("ocr_text") or source.get("full_text"))
    cleaned_short_caption = _clean_ocr_text(source.get("short_caption"))
    cleaned_detailed_caption = _clean_ocr_text(source.get("detailed_caption"))
    normalized_source = {
        **source,
        "raw_ocr_text": cleaned_raw_ocr or _clean_ocr_text(source.get("raw_ocr_text")),
        "short_caption": cleaned_short_caption,
        "detailed_caption": cleaned_detailed_caption,
    }
    write_finance_ocr_debug_event(
        "finance_ocr.unified_payin_slip.parser.cleaned_source",
        {
            "trace_id": trace_id or None,
            "cleaned_raw_ocr_length": len(cleaned_raw_ocr),
            "cleaned_short_caption_length": len(cleaned_short_caption),
            "cleaned_detailed_caption_length": len(cleaned_detailed_caption),
            "raw_ocr_preview": cleaned_raw_ocr[:240] if cleaned_raw_ocr else "",
            "short_caption_preview": cleaned_short_caption[:240] if cleaned_short_caption else "",
            "detailed_caption_preview": cleaned_detailed_caption[:240] if cleaned_detailed_caption else "",
        },
    )
    parsed = parse_slip({
        **payload,
        "source": normalized_source,
    })
    parsed_transaction = parsed.get("transaction") if isinstance(parsed.get("transaction"), dict) else {}
    parsed_validation = parsed.get("validation") if isinstance(parsed.get("validation"), dict) else {}
    write_finance_ocr_debug_event(
        "finance_ocr.unified_payin_slip.parser.parsed",
        {
            "trace_id": trace_id or None,
            "parsed_keys": sorted(str(key) for key in parsed.keys())[:80],
            "transaction_type": _coerce_text(parsed_transaction.get("transaction_type")),
            "amount": parsed_transaction.get("amount"),
            "currency": _coerce_text(parsed_transaction.get("currency")),
            "fee": parsed_transaction.get("fee"),
            "raw_date_text": _coerce_text(parsed_transaction.get("raw_date_text") or parsed_transaction.get("transaction_datetime_local")),
            "reference_id": _coerce_text(parsed_transaction.get("reference_id")),
            "merchant_code": _coerce_text(parsed_transaction.get("merchant_code")),
            "merchant_reference": _coerce_text(parsed_transaction.get("merchant_reference")),
            "merchant_tax_id": _coerce_text(parsed_transaction.get("merchant_tax_id")),
            "warnings": parsed_validation.get("warnings") if isinstance(parsed_validation.get("warnings"), list) else [],
            "missing_fields": parsed_validation.get("missing_fields") if isinstance(parsed_validation.get("missing_fields"), list) else [],
            "confidence": parsed_transaction.get("confidence"),
        },
    )
    summary = _summarize_transaction(parsed)
    raw_ocr_text = cleaned_raw_ocr or _coerce_text(source.get("raw_ocr_text"))
    short_caption = cleaned_short_caption or _coerce_text(source.get("short_caption"))
    write_finance_ocr_debug_event(
        "finance_ocr.unified_payin_slip.parser.summary",
        {
            "trace_id": trace_id or None,
            "summary_length": len(summary),
            "summary_preview": summary[:500],
            "raw_ocr_text_length": len(raw_ocr_text),
            "short_caption_length": len(short_caption),
        },
    )
    return {
        "parsed": parsed,
        "summary": summary,
        "raw_ocr_text": raw_ocr_text,
        "short_caption": short_caption,
    }
