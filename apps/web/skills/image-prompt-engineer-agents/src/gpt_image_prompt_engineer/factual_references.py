from __future__ import annotations

from .deliverables import REFERENCE_FIDELITY_DELIVERABLES, reference_paths


PRODUCT_TERMS = [
    "product", "สินค้า", "packaging", "package", "mockup", "bottle", "box", "label",
    "sku", "model", "device", "phone", "laptop", "watch", "perfume", "cosmetic",
    "skincare", "drink", "coffee", "tea", "supplement", "apparel", "shoe",
]

PLACE_TERMS = [
    "place", "location", "landmark", "destination", "venue", "hotel", "resort",
    "restaurant", "cafe", "museum", "temple", "mall", "airport", "station",
    "city", "beach", "mountain", "สถานที่", "แลนด์มาร์ก", "โรงแรม", "รีสอร์ต",
    "ร้านอาหาร", "คาเฟ่", "พิพิธภัณฑ์", "วัด", "ห้าง", "สนามบิน", "เมือง",
    "ชายหาด", "ภูเขา",
]


def _contains_any(text: str, terms: list[str]) -> bool:
    lower = text.lower()
    return any(term.lower() in lower for term in terms)


def _as_list(value) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return [item for item in value if str(item).strip()]
    if str(value).strip():
        return [value]
    return []


def verified_facts(normalized: dict) -> list[str]:
    return [str(item).strip() for item in _as_list(normalized.get("verified_reference_facts")) if str(item).strip()]


def reference_sources(normalized: dict) -> list[dict]:
    sources: list[dict] = []
    for item in _as_list(normalized.get("reference_sources")):
        if isinstance(item, dict):
            title = str(item.get("title") or item.get("name") or item.get("url") or "reference source").strip()
            source = {
                "title": title,
                "url": str(item.get("url") or "").strip(),
                "publisher": str(item.get("publisher") or "").strip(),
                "source_type": str(item.get("source_type") or "reference").strip(),
                "notes": str(item.get("notes") or "").strip(),
            }
        else:
            text = str(item).strip()
            source = {
                "title": text,
                "url": text if text.startswith(("http://", "https://")) else "",
                "publisher": "",
                "source_type": "reference",
                "notes": "",
            }
        if source["title"] or source["url"]:
            sources.append(source)
    return sources


def user_supplied_facts(normalized: dict) -> list[str]:
    facts: list[str] = []
    for key, label in [
        ("topic", "User topic"),
        ("brand_or_logo", "User brand/logo"),
        ("exact_text", "User exact text"),
        ("background_description", "User background"),
        ("audience", "User audience"),
        ("purpose", "User purpose"),
    ]:
        value = normalized.get(key)
        if isinstance(value, str) and value.strip():
            facts.append(f"{label}: {value.strip()}")
    for path in reference_paths(normalized):
        facts.append(f"User supplied reference image: {path}")
    return facts


def detect_reference_needs(normalized: dict) -> tuple[bool, bool, list[str]]:
    topic = str(normalized.get("topic") or "")
    background = str(normalized.get("background_description") or "")
    deliverable = str(normalized.get("deliverable_type") or "")
    style = str(normalized.get("image_style") or "")
    reasons: list[str] = []

    product_needed = (
        deliverable in REFERENCE_FIDELITY_DELIVERABLES
        or style in {"product_ad", "product_mockup"}
        or bool(normalized.get("brand_or_logo"))
        or _contains_any(topic, PRODUCT_TERMS)
    )
    if product_needed:
        reasons.append("product_or_brand_signal")

    place_needed = (
        style in {"architecture", "landscape"}
        or _contains_any(topic, PLACE_TERMS)
        or _contains_any(background, PLACE_TERMS)
    )
    if place_needed:
        reasons.append("place_or_location_signal")

    return product_needed, place_needed, reasons


def search_queries(normalized: dict, product_needed: bool, place_needed: bool) -> list[str]:
    topic = str(normalized.get("topic") or "").strip()
    queries: list[str] = []
    if product_needed:
        brand = str(normalized.get("brand_or_logo") or "").strip()
        core = f"{brand} {topic}".strip() if brand and brand.lower() not in topic.lower() else topic
        queries.extend([
            f"{core} official product page visual details",
            f"{core} official packaging label logo colors proportions",
        ])
    if place_needed:
        background = str(normalized.get("background_description") or "").strip()
        core = background or topic
        queries.extend([
            f"{core} official site architecture visual reference",
            f"{core} recent photos facade interior landmark details",
        ])
    deduped: list[str] = []
    seen = set()
    for query in queries:
        q = " ".join(query.split())
        if q and q not in seen:
            deduped.append(q)
            seen.add(q)
    return deduped[:4]


def build_reference_research(normalized: dict) -> dict:
    mode = normalized.get("factual_reference_mode", "auto")
    product_needed, place_needed, reasons = detect_reference_needs(normalized)
    facts = verified_facts(normalized)
    sources = reference_sources(normalized)
    visual_refs = reference_paths(normalized)
    required = False if mode == "off" else mode == "required" or (mode == "auto" and (product_needed or place_needed))

    if not required:
        status = "not_required"
    elif facts and sources:
        status = "verified"
    elif facts or sources:
        status = "partially_verified"
    elif visual_refs:
        status = "visual_reference_only"
    else:
        status = "needed"

    return {
        "required": required,
        "status": status,
        "mode": mode,
        "product_reference_needed": product_needed,
        "place_reference_needed": place_needed,
        "reasons": reasons,
        "search_queries": search_queries(normalized, product_needed, place_needed) if required else [],
        "source_priority": [
            "official product, brand, venue, or place website",
            "official store listing, press kit, menu, brochure, or map profile",
            "recent high-quality reference photos from reputable sources",
            "user-supplied source images and exact text",
        ] if required else [],
        "user_supplied_facts": user_supplied_facts(normalized),
        "verified_reference_facts": facts,
        "reference_sources": sources,
        "visual_reference_images": visual_refs,
        "conflict_policy": "Never replace user-supplied facts with research. If verified sources conflict with user details, preserve the user details and flag the conflict for review.",
    }


def factual_reference_note(normalized: dict, lang: str) -> str:
    research = build_reference_research(normalized)
    if not research["required"]:
        return ""
    facts = research["verified_reference_facts"]
    sources = research["reference_sources"]
    user_facts = research["user_supplied_facts"]
    if lang == "th":
        base = (
            "การอ้างอิงข้อเท็จจริง: ใช้ข้อมูลที่ผู้ใช้ระบุเป็นหลัก ห้ามแทนที่หรือแก้ข้อมูลของผู้ใช้ด้วยผลค้นหา; "
            "ใช้ข้อมูลอ้างอิงที่ตรวจสอบแล้วเพื่อเสริมความถูกต้องของสินค้า/สถานที่เท่านั้น"
        )
        if facts or sources:
            fact_text = "; ".join(facts[:6]) if facts else "มีแหล่งอ้างอิงแต่ไม่มี fact list แยก"
            return f"{base}. ข้อมูลอ้างอิงที่ตรวจแล้ว: {fact_text}"
        if user_facts:
            return f"{base}. ยังไม่มี verified_reference_facts/reference_sources; ห้ามเติมสเปก โลโก้ รายละเอียดอาคาร หรือข้อมูลจริงที่ไม่ได้ยืนยัน"
        return f"{base}. ต้องค้นหาและแนบข้อมูลอ้างอิงก่อนสรุปรายละเอียดจริง"
    base = (
        "Factual reference grounding: treat user-provided details as authoritative; do not replace or correct them with search results; "
        "use verified references only to improve real product/place accuracy"
    )
    if facts or sources:
        fact_text = "; ".join(facts[:6]) if facts else "sources provided without a separate fact list"
        return f"{base}. Verified reference facts: {fact_text}"
    if user_facts:
        return f"{base}. No verified_reference_facts/reference_sources were supplied yet; do not invent specs, logos, facade details, venue layout, or factual real-world claims."
    return f"{base}. Search for and attach clear reference sources before finalizing real-world details."
