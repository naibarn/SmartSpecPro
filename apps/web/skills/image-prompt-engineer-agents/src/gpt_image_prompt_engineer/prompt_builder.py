from .localization import label, field_label
from .deliverables import (
    REFERENCE_FIDELITY_DELIVERABLES,
    TEXT_SENSITIVE_DELIVERABLES,
    guidance_for,
    profile_avoid,
    profile_modifiers,
    reference_paths,
)
from .factual_references import factual_reference_note
import re

BASE_AVOID = [
    "distorted anatomy", "deformed hands", "extra fingers", "warped face",
    "blurry details", "low detail", "unwanted text", "watermark",
    "cluttered background", "misaligned layout"
]

TH_PHRASES = {
    "distorted anatomy": "กายวิภาคผิดเพี้ยน",
    "deformed hands": "มือผิดรูป",
    "extra fingers": "นิ้วเกิน",
    "warped face": "ใบหน้าบิดเบี้ยว",
    "blurry details": "รายละเอียดเบลอ",
    "low detail": "รายละเอียดต่ำ",
    "unwanted text": "ตัวอักษรที่ไม่ต้องการ",
    "watermark": "ลายน้ำ",
    "cluttered background": "พื้นหลังรก",
    "misaligned layout": "เลย์เอาต์ไม่ตรง",
    "sexualized pose or revealing styling for an 18-year-old subject": "ท่าทางหรือการแต่งกายที่สื่อทางเพศสำหรับตัวแบบอายุ 18 ปี",
    "sexualized styling": "สไตล์ที่สื่อทางเพศ",
    "revealing outfit emphasis": "เน้นเสื้อผ้าเปิดเผย",
    "adult-coded pose for a young subject": "ท่าทางแบบผู้ใหญ่สำหรับตัวแบบอายุน้อย",
    "photorealistic": "สมจริงเหมือนภาพถ่าย",
    "cinematic lighting": "แสงแบบภาพยนตร์",
    "sharp focus": "โฟกัสคมชัด",
    "high detail": "รายละเอียดสูง",
    "natural skin texture": "ผิวธรรมชาติ",
    "clean composition": "องค์ประกอบสะอาด",
    "commercial quality": "คุณภาพงานโฆษณา",
    "editorial style": "สไตล์นิตยสาร",
    "soft background blur": "ฉากหลังเบลอนุ่ม",
    "vibrant colors": "สีสด",
    "clear subject separation": "แยกตัวแบบออกจากฉากหลังชัดเจน",
    "intentional visual hierarchy": "ลำดับชั้นภาพชัดเจน",
    "coherent background supporting the subject": "พื้นหลังสอดคล้องและช่วยส่งตัวแบบ",
    "film-still composition": "องค์ประกอบแบบภาพนิ่งจากภาพยนตร์",
    "motivated lighting": "แสงมีเหตุผลตามฉาก",
    "controlled depth and shadow transitions": "ควบคุมมิติภาพและเงาอย่างตั้งใจ",
    "natural localized wording with preserved visual technique terms": "ถ้อยคำภาษาไทยเป็นธรรมชาติ พร้อมคงศัพท์เทคนิคภาพที่จำเป็น",
    "resolved constraints": "ข้อกำหนดไม่ขัดแย้งกัน",
    "concise renderer-friendly detail": "รายละเอียดกระชับและเหมาะกับระบบสร้างภาพ",
}

def phrase(text: str, lang: str) -> str:
    if lang == "th":
        panel_match = re.match(r"^Panel\s+(\d+):\s+distinct but consistent view of the same concept$", text)
        if panel_match:
            return f"ช่องที่ {panel_match.group(1)}: มุมมองที่แตกต่างแต่ยังคงแนวคิดเดียวกันอย่างต่อเนื่อง"
        return TH_PHRASES.get(text, label(text, lang))
    return text

def phrase_list(items: list[str], lang: str) -> list[str]:
    seen = set()
    result = []
    for item in items:
        translated = phrase(str(item), lang)
        if translated and translated not in seen:
            result.append(translated)
            seen.add(translated)
    return result

CONTEXT_VALUES = {
    "th": {
        "aperture_style": {
            "f1_2": "f/1.2 เบลอมาก",
            "f1_4": "f/1.4 เบลอมาก",
            "f1_8": "f/1.8 หลังละลาย",
            "f2_8": "f/2.8 แยกฉากนุ่ม",
            "f4": "f/4 สมดุล",
            "f5_6": "f/5.6 ชัดขึ้น",
            "f8": "f/8 ชัดทั้งฉาก",
            "f11": "f/11 ชัดลึก",
            "deep_focus": "ชัดลึก",
        },
        "background_blur": {
            "none": "ไม่เบลอ",
            "subtle": "เบลอเล็กน้อย",
            "medium": "เบลอปานกลาง",
            "strong": "เบลอมาก",
        },
        "depth_of_field": {
            "shallow": "ชัดตื้น",
            "medium": "ชัดลึกปานกลาง",
            "deep": "ชัดลึก",
        },
    },
    "en": {
        "aperture_style": {
            "f1_2": "f/1.2 very shallow",
            "f1_4": "f/1.4 shallow",
            "f1_8": "f/1.8 shallow",
            "f2_8": "f/2.8 soft separation",
            "f4": "f/4 balanced",
            "f5_6": "f/5.6 clearer scene",
            "f8": "f/8 deep focus",
            "f11": "f/11 deep focus",
            "deep_focus": "deep focus",
        },
        "background_blur": {
            "none": "no blur",
            "subtle": "subtle blur",
            "medium": "medium blur",
            "strong": "strong blur",
        },
    },
}

def value_label(field_key: str, value: str, lang: str) -> str:
    return CONTEXT_VALUES.get(lang, {}).get(field_key, {}).get(value, label(value, lang))

def visual_lines(n: dict, lang: str) -> list[str]:
    fields = [
        ("style","image_style"),("deliverable","deliverable_type"),("aspect_ratio","aspect_ratio"),("camera_angle","camera_angle"),
        ("shot_framing","shot_framing"),("camera_system","camera_system"),("lens","lens_focal_length"),
        ("aperture","aperture_style"),("depth","depth_of_field"),("blur","background_blur"),
        ("lighting","lighting_preset"),("source","light_source"),("direction","light_direction"),
        ("grade","color_grade"),("composition","composition_rule"),("cinematic","cinematic_mode")
    ]
    return [f"{field_label(f, lang)}: {value_label(k, str(n.get(k)), lang)}" for f,k in fields]

def reference_fidelity_note(n: dict, lang: str) -> str:
    refs = reference_paths(n)
    deliverable = str(n.get("deliverable_type"))
    if not refs and deliverable not in REFERENCE_FIDELITY_DELIVERABLES:
        return ""
    if lang == "th":
        base = "ความแม่นยำจากภาพอ้างอิง: "
        if refs:
            return (
                base
                + "ใช้ภาพอ้างอิงที่แนบมาเป็น source of truth; รักษารูปร่าง สัดส่วน สี ตำแหน่งโลโก้ ฉลาก ลายแพ็กเกจ และตัวอักษรสำคัญให้ตรงที่สุด ห้ามบิดรูปทรงหรือเพิ่มโลโก้เอง"
            )
        return base + "หากมีภาพอ้างอิง ให้รักษาสัดส่วน รูปทรง ฉลาก สี และตำแหน่งองค์ประกอบสำคัญให้ตรงที่สุด"
    base = "Reference fidelity: "
    if refs:
        return (
            base
            + "use the supplied reference image(s) as the source of truth; preserve shape, proportions, colors, logo placement, labels, packaging artwork, and key text as accurately as possible; do not warp geometry or invent extra logos."
        )
    return base + "when reference images are supplied, preserve proportions, shape, labels, color, and important placement details as accurately as possible."

def text_legibility_note(n: dict, lang: str) -> str:
    if str(n.get("deliverable_type")) not in TEXT_SENSITIVE_DELIVERABLES and not n.get("exact_text"):
        return ""
    if lang == "th":
        return "ตัวอักษรต้องคม อ่านง่าย สะกดถูกต้อง วางอยู่ใน safe margins และไม่ถูกตัดหรือทับกับองค์ประกอบอื่น"
    return "All text must be crisp, readable, correctly spelled, inside safe margins, and not cropped or overlapping other elements."

def sentence(text: str) -> str:
    value = str(text or "").strip()
    if not value:
        return ""
    return value if value.endswith((".", "!", "?", "。")) else value + "."

def build_prompts(n: dict, safety: dict) -> dict:
    lang = n.get("target_language","en")
    topic = n["topic"]
    avoid = BASE_AVOID + profile_avoid(n) + n.get("avoid", [])
    if "age_sensitive" in safety.get("flags", []):
        avoid.append("sexualized pose or revealing styling for an 18-year-old subject")
    avoid_local = phrase_list(avoid, lang)
    visual = "; ".join(visual_lines(n, lang))
    modifier_items = profile_modifiers(n) + n.get("modifiers", [])
    modifiers = ", ".join(phrase_list(modifier_items, lang))
    deliverable_guidance = guidance_for(n, lang)
    reference_note = reference_fidelity_note(n, lang)
    factual_note = factual_reference_note(n, lang)
    legibility_note = text_legibility_note(n, lang)
    panels = ""
    if n.get("multi_frame_mode") != "single":
        panel_desc = "; ".join(phrase_list(n.get("panel_descriptions") or [], lang))
        if lang == "th":
            panels = (
                f" แนวทางหลายเฟรม: {label(str(n.get('multi_frame_mode')), lang)}, "
                f"เลย์เอาต์ {n['frame_layout']}, จำนวน {n['panel_count']} ช่อง, "
                f"ความต่อเนื่อง {label(str(n.get('continuity_mode')), lang)}. {panel_desc}"
            )
        else:
            panels = f" Multi-frame direction: {label(str(n.get('multi_frame_mode')), lang)}, layout {n['frame_layout']}, {n['panel_count']} panels, continuity {label(str(n.get('continuity_mode')), lang)}. {panel_desc}"

    if lang == "th":
        exact = f' ใส่ข้อความในภาพตามนี้: "{n.get("exact_text")}".' if n.get("exact_text") else ""
        background = f" พื้นหลัง: {label(str(n.get('scene_background_mode')), lang)}; {n.get('background_description') or 'เลือกพื้นหลังที่สอดคล้องและช่วยส่งตัวแบบ'}."
        short = f"{topic}; {visual}"
        detailed = (
            f"หัวข้อภาพ: {topic}. "
            f"แนวทางภาพ: {visual}. "
            f"ข้อกำหนดเฉพาะประเภทงาน: {sentence(deliverable_guidance)} "
            f"{background} {panels} "
            f"{sentence(reference_note) + ' ' if reference_note else ''}"
            f"{sentence(factual_note) + ' ' if factual_note else ''}"
            f"{sentence(legibility_note) + ' ' if legibility_note else ''}"
            f"เพิ่มรายละเอียดเสริม: {modifiers if modifiers else 'ให้ระบบเลือกตามบริบทอย่างเหมาะสม'}. "
            f"{exact} "
            f"รักษาความสมจริง องค์ประกอบสะอาด อ่านง่าย และสอดคล้องกับเป้าหมายงาน {label(str(n.get('deliverable_type')), lang)}. "
            f"หลีกเลี่ยง: {', '.join(avoid_local)}."
        )
        structured = "\n".join([f"หัวข้อ: {topic}", *visual_lines(n, lang), f"ข้อกำหนดประเภทงาน: {deliverable_guidance}", f"ความแม่นยำจากภาพอ้างอิง: {reference_note or 'ไม่มีภาพอ้างอิงที่ต้องล็อก'}", f"การอ้างอิงข้อเท็จจริง: {factual_note or 'ไม่จำเป็นต้องค้นข้อมูลสินค้า/สถานที่จริง'}", f"ฉากหลัง: {label(n.get('scene_background_mode'), lang)}", f"ข้อห้าม: {', '.join(avoid_local)}"])
    else:
        exact = f' Render exact in-image text: "{n.get("exact_text")}".' if n.get("exact_text") else ""
        background = f" Background direction: {label(str(n.get('scene_background_mode')), lang)}; {n.get('background_description') or 'choose a coherent background that supports the subject'}."
        short = f"{topic}; {visual}"
        detailed = (
            f"Image concept: {topic}. "
            f"Visual direction: {visual}. "
            f"Deliverable requirements: {sentence(deliverable_guidance)} "
            f"{background} {panels} "
            f"{sentence(reference_note) + ' ' if reference_note else ''}"
            f"{sentence(factual_note) + ' ' if factual_note else ''}"
            f"{sentence(legibility_note) + ' ' if legibility_note else ''}"
            f"Additional modifiers: {modifiers if modifiers else 'choose context-appropriate refinements automatically'}. "
            f"{exact} "
            f"Keep the composition clean, intentional, and aligned with the {label(str(n.get('deliverable_type')), lang)} deliverable. "
            f"Avoid: {', '.join(avoid_local)}."
        )
        structured = "\n".join([f"Topic: {topic}", *visual_lines(n, lang), f"Deliverable requirements: {deliverable_guidance}", f"Reference fidelity: {reference_note or 'No locked reference image supplied'}", f"Factual reference grounding: {factual_note or 'No real product/place research required'}", f"Background: {label(str(n.get('scene_background_mode')), lang)}", f"Avoid: {', '.join(avoid_local)}"])

    variants = [detailed]
    if n.get("return_variants",2) >= 2:
        variants.append(detailed + (" เพิ่มอารมณ์ภาพให้หรูและมีชั้นเชิงมากขึ้น." if lang=="th" else " Add a more premium, polished mood."))
    if n.get("return_variants",2) >= 3:
        variants.append(detailed + (" เน้นแสง เงา และมิติฉากให้ cinematic มากขึ้น." if lang=="th" else " Emphasize lighting, shadow, depth, and cinematic atmosphere."))

    edit = None
    if n.get("mode") == "edit" and n.get("include_edit_prompt", True):
        if lang == "th":
            edit = (f"แก้ไขภาพที่อัปโหลดให้ตรงกับ: {topic}. รักษาเอกลักษณ์ เลย์เอาต์ สัดส่วนสินค้า/บุคคล ตัวอักษรสำคัญ และพื้นที่ที่ไม่ต้องแก้ไว้ ใช้แนวทางภาพ: {visual}. {deliverable_guidance}. {reference_note} {factual_note} หลีกเลี่ยง: {', '.join(avoid_local)}.")
        else:
            edit = (f"Edit the provided image to match: {topic}. Preserve identity, layout, product/person proportions, key text, and unchanged regions. Use: {visual}. {deliverable_guidance}. {reference_note} {factual_note} Avoid: {', '.join(avoid_local)}.")
    return {"short": short, "detailed": detailed, "structured": structured, "negative_constraints": ", ".join(avoid_local), "edit": edit, "variants": variants[:n.get("return_variants",2)]}
