from __future__ import annotations

import re
from .normalizers import normalize_currency, split_lines, to_iso_datetime

AMOUNT_PATTERNS = [
    r"(?:จำนวนเงิน|amount)\s*[:\-]?\s*([\d,]+\.\d{2})\s*(บาท|THB|Baht|baht)?",
]
FEE_PATTERNS = [
    r"(?:ค่าธรรมเนียม|fee)\s*[:\-]?\s*([\d,]+\.\d{2})\s*(บาท|THB|Baht|baht)?",
]
DATE_PATTERNS = [
    r"(?:วันที่ทำรายการ|date|transaction date)\s*[:\-]?\s*([\d\sก-๙\./:-]+)",
    r"(\d{1,2}\s*(?:ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*\d{4}\s*(?:[- ]\s*\d{1,2}:\d{2}(?::\d{2})?)?)",
]
REF_PATTERNS = {
    "reference_id": [
        r"(?:รหัสอ้างอิง|หมายเลขอ้างอิง)\s*[:\-]?\s*([A-Z0-9]{8,})",
    ],
    "reference_id_1": [
        r"หมายเลขอ้างอิง\s*1\s*[:\-]?\s*([A-Z0-9]{6,})",
    ],
    "reference_id_2": [
        r"หมายเลขอ้างอิง\s*2\s*[:\-]?\s*([A-Z0-9]{6,})",
    ],
}
MERCHANT_PATTERNS = {
    "merchant_code": [r"(?:รหัสร้านค้า|merchant code)\s*[:\-]?\s*([A-Z0-9_-]{6,})"],
    "merchant_reference": [r"(?:รหัสธุรกรรม|รหัสอ้างอิงร้านค้า|merchant reference)\s*[:\-]?\s*([A-Z0-9_-]{6,})"],
    "merchant_tax_id": [r"\((\d{13})\)"],
}

def _pick_first(text: str, patterns: list[str]) -> str | None:
    for pattern in patterns:
        m = re.search(pattern, text, flags=re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return None

def parse_amount(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return float(value.replace(",", ""))
    except Exception:
        return None

def extract_money(text: str) -> dict:
    amount_raw = _pick_first(text, AMOUNT_PATTERNS)
    fee_raw = _pick_first(text, FEE_PATTERNS)
    currency = None
    for pattern in AMOUNT_PATTERNS:
        m = re.search(pattern, text, flags=re.IGNORECASE)
        if m and len(m.groups()) >= 2:
            currency = normalize_currency(m.group(2))
            break
    fee_currency = None
    for pattern in FEE_PATTERNS:
        m = re.search(pattern, text, flags=re.IGNORECASE)
        if m and len(m.groups()) >= 2:
            fee_currency = normalize_currency(m.group(2))
            break
    return {
        "amount": parse_amount(amount_raw),
        "currency": currency or "THB",
        "fee": parse_amount(fee_raw),
        "fee_currency": fee_currency or "THB",
    }

def extract_references(text: str) -> dict:
    out = {}
    for key, patterns in REF_PATTERNS.items():
        value = _pick_first(text, patterns)
        if value:
            out[key] = value
    return out

def extract_merchants(text: str) -> dict:
    out = {}
    for key, patterns in MERCHANT_PATTERNS.items():
        value = _pick_first(text, patterns)
        if value:
            out[key] = value
    lines = split_lines(text)
    for line in lines:
        if "บริษัท" in line or "public co.,ltd" in line.lower() or "shop" in line.lower():
            out.setdefault("merchant_name", line.strip())
            break
    return out

def extract_datetime(text: str) -> dict:
    raw_date = None
    for pattern in DATE_PATTERNS:
        m = re.search(pattern, text, flags=re.IGNORECASE)
        if m:
            raw_date = m.group(1).strip()
            break
    iso = to_iso_datetime(raw_date) if raw_date else to_iso_datetime(text)
    return {
        "raw_date_text": raw_date,
        "transaction_datetime_local": raw_date,
        "transaction_datetime_iso": iso,
    }

def _looks_like_account(line: str) -> bool:
    return bool(re.search(r"(?:X|\*){2,}|\d{3}-\d-\d{4,}|\d{3}-\d{3}-\d{4}", line))

def _looks_like_mobile(line: str) -> bool:
    return bool(re.search(r"(?:0\d{8,9}|X{3}-X{3}-\d{4}|XXX-XXX-\d{4})", line))

def extract_transfer_parties(text: str) -> tuple[dict, dict]:
    lines = split_lines(text)
    payer, payee = {}, {}
    from_idx = next((i for i, line in enumerate(lines) if line in {"จาก", "from"} or "จาก" == line.strip()), None)
    to_idx = next((i for i, line in enumerate(lines) if line in {"ไปยัง", "to"} or "ไปยัง" == line.strip()), None)

    if from_idx is not None:
        window = lines[from_idx + 1: min(from_idx + 5, len(lines))]
        for line in window:
            if not payer.get("name") and not _looks_like_account(line) and len(line) > 2:
                payer["name"] = line
            if _looks_like_account(line):
                payer["account_number"] = line
            if "กรุง" in line or "ไทยพาณิชย์" in line or line.lower() in {"scb", "ttb", "krungthai"}:
                payer["issuer_name"] = line

    if to_idx is not None:
        window = lines[to_idx + 1: min(to_idx + 5, len(lines))]
        for line in window:
            if not payee.get("name") and not _looks_like_account(line) and len(line) > 2:
                payee["name"] = line
            if _looks_like_account(line):
                if _looks_like_mobile(line):
                    payee["mobile_number"] = line
                else:
                    payee["account_number"] = line
            if "กรุง" in line or "ไทยพาณิชย์" in line or line.lower() in {"scb", "ttb", "krungthai"}:
                payee["issuer_name"] = line

    return payer, payee

def extract_payment_parties(text: str) -> tuple[dict, dict]:
    lines = split_lines(text)
    payer, payee = {}, {}
    account_lines = [(i, line) for i, line in enumerate(lines) if _looks_like_account(line)]
    if account_lines:
        first_idx, first_account = account_lines[0]
        payer["account_number"] = first_account
        for i in range(max(0, first_idx - 2), first_idx):
            if len(lines[i]) > 2 and not _looks_like_account(lines[i]):
                payer["name"] = lines[i]
                break
        if first_idx + 1 < len(lines):
            maybe_issuer = lines[first_idx - 1] if first_idx - 1 >= 0 else ""
            if "กรุง" in maybe_issuer or "scb" in maybe_issuer.lower() or "ttb" in maybe_issuer.lower():
                payer["issuer_name"] = maybe_issuer

    if len(account_lines) >= 2:
        second_idx, second_account = account_lines[1]
        payee["account_number"] = second_account
        for i in range(max(0, second_idx - 2), second_idx):
            if len(lines[i]) > 2 and not _looks_like_account(lines[i]):
                payee["name"] = lines[i]
                break
    else:
        for line in lines:
            if ("บริษัท" in line or "shop" in line.lower() or "public co.,ltd" in line.lower()) and not payee.get("name"):
                payee["name"] = line
                payee["merchant_name"] = line
    return payer, payee

def detect_account_or_wallet_id(text: str) -> str | None:
    m = re.search(r"((?:X|\*){2,}[\dX*-]+|\d{3}-\d-\d{4,}|\d{10,})", text)
    return m.group(1) if m else None