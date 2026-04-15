from __future__ import annotations

import json
import re
from pathlib import Path

from .normalizers import normalize_text, source_used

try:
    from PIL import Image
except Exception:
    Image = None

CONFIG_DIR = Path(__file__).resolve().parents[2] / "configs"

def _load_json(name: str) -> dict:
    return json.loads((CONFIG_DIR / name).read_text(encoding="utf-8"))

ISSUER_RULES = _load_json("issuer-detection.rules.json")
TRANSACTION_RULES = _load_json("transaction-type.rules.json")

def _image_average_rgb(image_path: str) -> tuple[int, int, int] | None:
    if Image is None or not image_path or not Path(image_path).exists():
        return None
    img = Image.open(image_path).convert("RGB")
    w, h = img.size
    crop = img.crop((0, 0, w, max(1, h // 4)))
    crop = crop.resize((32, 32))
    pixels = list(crop.getdata())
    if not pixels:
        return None
    r = sum(p[0] for p in pixels) // len(pixels)
    g = sum(p[1] for p in pixels) // len(pixels)
    b = sum(p[2] for p in pixels) // len(pixels)
    return (r, g, b)

def _color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5

def detect_issuer(source: dict, parse_options: dict | None = None) -> dict:
    parse_options = parse_options or {}
    text = normalize_text(source.get("raw_ocr_text"), source.get("short_caption")).lower()
    filename_blob = " ".join([source.get("filename") or "", source.get("image_path") or ""]).lower()
    evidence = []
    scores = {}
    avg_rgb = _image_average_rgb(source.get("image_path") or "")

    for issuer in ISSUER_RULES["issuers"]:
        code = issuer["issuer_code"]
        score = 0.0
        local_evidence = []

        for kw in issuer.get("text_keywords", []):
            if kw.lower() in text:
                score += 0.9
                local_evidence.append({"kind": "text_keyword", "signal": "issuer keyword", "weight": 0.9, "matched_value": kw})

        for kw in issuer.get("filename_keywords", []):
            if kw.lower() in filename_blob:
                score += 0.55
                local_evidence.append({"kind": "filename_keyword", "signal": "filename keyword", "weight": 0.55, "matched_value": kw})

        for pattern in issuer.get("reference_patterns", []):
            if re.search(pattern, text, flags=re.IGNORECASE | re.MULTILINE):
                score += 0.75
                local_evidence.append({"kind": "reference_pattern", "signal": "reference pattern", "weight": 0.75, "matched_value": pattern})

        if avg_rgb and issuer.get("visual_colors_rgb"):
            distances = [_color_distance(avg_rgb, tuple(rgb)) for rgb in issuer["visual_colors_rgb"]]
            best_dist = min(distances)
            if best_dist < 90:
                weight = 0.35 if best_dist < 60 else 0.2
                score += weight
                local_evidence.append({"kind": "image_color", "signal": "dominant header color", "weight": weight, "matched_value": str(avg_rgb)})

        if code == "TRUEMONEY" and any(k in text for k in ["wallet", "truemoney", "ทรูมันนี่"]):
            score += 0.25
        if code == "PAOTANG" and any(k in text for k in ["เป๋าตัง", "g-wallet", "g wallet"]):
            score += 0.25

        scores[code] = (score, local_evidence, issuer)

    best_code = "UNKNOWN"
    best_score = 0.0
    best_issuer = {"issuer_code": "UNKNOWN", "issuer_type": "unknown", "issuer_name_th": "ไม่ทราบ", "issuer_name_en": "Unknown"}
    best_ev = []

    for code, (score, ev, issuer) in scores.items():
        if score > best_score:
            best_code = code
            best_score = score
            best_issuer = issuer
            best_ev = ev

    if best_score < float(parse_options.get("min_confidence", 0.65)):
        if any(k in text for k in ["wallet", "truemoney", "ทรูมันนี่"]):
            best_issuer = {"issuer_code": "TRUEMONEY", "issuer_type": "wallet", "issuer_name_th": "ทรูมันนี่ วอลเล็ท", "issuer_name_en": "TrueMoney Wallet"}
            best_score = 0.51
            best_ev = [{"kind": "generic_hint", "signal": "wallet terms", "weight": 0.51, "matched_value": "wallet"}]
        elif any(k in text for k in ["เป๋าตัง", "g-wallet", "g wallet"]):
            best_issuer = {"issuer_code": "PAOTANG", "issuer_type": "gov_app", "issuer_name_th": "เป๋าตัง", "issuer_name_en": "Paotang"}
            best_score = 0.51
            best_ev = [{"kind": "generic_hint", "signal": "gov wallet terms", "weight": 0.51, "matched_value": "g-wallet"}]
        elif any(k in text for k in ["กรุง", "ไทยพาณิชย์", "ธนาคาร", "โอนเงินสำเร็จ", "จ่ายบิลสำเร็จ"]):
            best_issuer = {"issuer_code": "UNKNOWN", "issuer_type": "bank", "issuer_name_th": "ธนาคารไม่ทราบ", "issuer_name_en": "Unknown Bank"}
            best_score = max(best_score, 0.4)
            best_ev = [{"kind": "generic_hint", "signal": "bank-like slip terms", "weight": best_score, "matched_value": "bank"}]
        else:
            best_issuer = {"issuer_code": "UNKNOWN", "issuer_type": "unknown", "issuer_name_th": "ไม่ทราบ", "issuer_name_en": "Unknown"}

    return {
        "issuer_code": best_issuer["issuer_code"],
        "issuer_type": best_issuer["issuer_type"],
        "issuer_name_th": best_issuer["issuer_name_th"],
        "issuer_name_en": best_issuer["issuer_name_en"],
        "source_used": source_used(source, parse_options.get("mode", "auto")),
        "confidence": round(min(best_score, 0.99), 4),
        "evidence": best_ev if parse_options.get("return_detection_evidence", True) else [],
    }

def detect_transaction_type(text: str, issuer: dict) -> str:
    blob = normalize_text(text).lower()
    scored = {}
    for rule in TRANSACTION_RULES["rules"]:
        score = 0
        for kw in rule["match_any_text"]:
            if kw.lower() in blob:
                score += 1
        if score:
            scored[rule["transaction_type"]] = score

    if scored:
        return sorted(scored.items(), key=lambda x: (-x[1], x[0]))[0][0]

    if issuer.get("issuer_type") == "wallet":
        return "wallet_payment"
    if issuer.get("issuer_type") == "gov_app":
        return "wallet_payment"
    return "unknown"