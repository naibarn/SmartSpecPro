from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

THAI_MONTHS = {
    "ม.ค.": "01", "ก.พ.": "02", "มี.ค.": "03", "เม.ย.": "04",
    "พ.ค.": "05", "มิ.ย.": "06", "ก.ค.": "07", "ส.ค.": "08",
    "ก.ย.": "09", "ต.ค.": "10", "พ.ย.": "11", "ธ.ค.": "12",
}

BANK_NAMES = {
    "KTB": ("กรุงไทย", "Krungthai"),
    "BAY": ("กรุงศรี", "Krungsri"),
    "SCB": ("ไทยพาณิชย์", "SCB"),
    "TTB": ("ทีทีบี", "ttb"),
}

def normalize_text(*parts: str | None) -> str:
    text = " ".join([p for p in parts if p]).strip()
    text = text.replace("\n", "\n")
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[\t\r]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def split_lines(*parts: str | None) -> list[str]:
    joined = "\n".join([p for p in parts if p]).replace("\r", "\n")
    joined = re.sub(r"<[^>]+>", "\n", joined)
    joined = re.sub(r"\n+", "\n", joined)
    lines = [line.strip() for line in joined.split("\n")]
    return [line for line in lines if line]

def normalize_currency(raw: str | None) -> str | None:
    if not raw:
        return None
    value = raw.strip().lower()
    if value in {"บาท", "thb", "baht"}:
        return "THB"
    return raw.strip().upper()

def mask_value(value: str | None) -> str | None:
    if not value:
        return value
    if "XXX" in value or "*" in value:
        return value
    if len(value) <= 4:
        return value
    return value[:2] + "*" * max(len(value) - 4, 0) + value[-2:]

def to_iso_datetime(raw: str | None) -> str | None:
    if not raw:
        return None
    pattern = r"(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*(\d{4})\s*[- ]\s*(\d{1,2}:\d{2}(?::\d{2})?)"
    m = re.search(pattern, raw)
    if m:
        day, month_th, year, time_text = m.groups()
        month = THAI_MONTHS[month_th]
        year_int = int(year)
        if year_int > 2400:
            year_int -= 543
        if len(time_text.split(":")) == 2:
            time_text += ":00"
        return f"{year_int:04d}-{month}-{int(day):02d}T{time_text}+07:00"

    pattern2 = r"(\d{1,2})\s*/\s*(\d{1,2})\s*/\s*(\d{4})\s*(\d{1,2}:\d{2}(?::\d{2})?)?"
    m = re.search(pattern2, raw)
    if m:
        day, month, year, time_text = m.groups()
        year_int = int(year)
        if year_int > 2400:
            year_int -= 543
        time_text = time_text or "00:00:00"
        if len(time_text.split(":")) == 2:
            time_text += ":00"
        return f"{year_int:04d}-{int(month):02d}-{int(day):02d}T{time_text}+07:00"
    return None

def source_used(source: dict, mode: str = "auto") -> str:
    has_text = bool((source.get("raw_ocr_text") or "").strip() or (source.get("short_caption") or "").strip())
    has_image = bool((source.get("image_path") or "").strip())
    if mode == "ocr_only":
        return "ocr_only"
    if mode == "image_only":
        return "image_only"
    if has_text and has_image:
        return "multimodal"
    if has_text:
        return "ocr_only"
    if has_image:
        return "image_only"
    return "unknown"

def compatibility_from_issuer(issuer_code: str, issuer_type: str) -> dict:
    if issuer_type != "bank":
        return {}
    th, en = BANK_NAMES.get(issuer_code, ("", ""))
    return {
        "bank_code": issuer_code,
        "bank_name_th": th,
        "bank_name_en": en,
    }