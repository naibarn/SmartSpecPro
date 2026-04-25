from __future__ import annotations

from copy import deepcopy


TEXT_SENSITIVE_DELIVERABLES = {
    "poster",
    "banner",
    "thumbnail",
    "social_post",
    "story_post",
    "presentation_slide",
    "infographic",
    "diagram",
    "ui_mockup",
    "document_replica",
    "packaging_mockup",
}

REFERENCE_FIDELITY_DELIVERABLES = {
    "product_ad",
    "product_mockup",
    "packaging_mockup",
    "document_replica",
}

PREMIUM_DELIVERABLES = {
    "poster",
    "social_post",
    "story_post",
    "presentation_slide",
    "product_ad",
    "product_mockup",
    "packaging_mockup",
    "thumbnail",
}


DELIVERABLE_PROFILES: dict[str, dict] = {
    "general_image": {
        "ratio": "3:2",
        "quality": "medium",
        "guidance": {
            "en": "Create a polished single image with a clear subject, coherent setting, readable composition, and no distracting artifacts.",
            "th": "สร้างภาพเดี่ยวที่ดูสมบูรณ์ ตัวแบบชัด ฉากสอดคล้อง องค์ประกอบอ่านง่าย และไม่มีรายละเอียดรบกวน",
        },
        "modifiers": ["clear subject hierarchy", "coherent scene logic", "balanced composition"],
        "avoid": ["unmotivated props", "visual clutter"],
        "questions": ["What mood, audience, or usage context should the image prioritize?"],
    },
    "poster": {
        "ratio": "2:3",
        "quality": "high",
        "visual_defaults": {
            "composition_rule": "golden_ratio",
            "shot_framing": "medium_shot",
            "lighting_preset": "dramatic",
            "depth_of_field": "deep",
            "background_blur": "subtle",
        },
        "guidance": {
            "en": "Design it as a premium poster with one dominant focal point, strong headline hierarchy, clean safe margins, generous negative space, high contrast, and print-ready polish.",
            "th": "ออกแบบเป็นโปสเตอร์พรีเมี่ยม มีจุดโฟกัสหลักเดียว ลำดับหัวข้อเด่น ระยะขอบปลอดภัย พื้นที่ว่างพอดี คอนทราสต์ชัด และความเนี้ยบระดับงานพิมพ์",
        },
        "modifiers": ["premium poster layout", "dominant focal point", "strong headline hierarchy", "clean safe margins"],
        "avoid": ["crowded poster layout", "tiny unreadable headline", "random decorative text"],
        "questions": ["What headline, date, offer, or call to action must appear on the poster?"],
    },
    "banner": {
        "ratio": "16:9",
        "quality": "high",
        "visual_defaults": {
            "composition_rule": "leading_lines",
            "shot_framing": "wide_shot",
            "depth_of_field": "deep",
            "background_blur": "none",
        },
        "guidance": {
            "en": "Build a wide banner with a clear left-to-right visual path, strong subject separation, readable text zone, and responsive-safe spacing.",
            "th": "สร้างแบนเนอร์แนวนอนที่นำสายตาชัด แยกตัวแบบเด่น มีพื้นที่วางข้อความอ่านง่าย และเว้นระยะที่ปลอดภัยต่อการครอป",
        },
        "modifiers": ["wide banner composition", "responsive-safe spacing", "readable text zone"],
        "avoid": ["important details near crop edges", "busy panoramic background"],
        "questions": ["Which platform or placement will this banner be used for?"],
    },
    "thumbnail": {
        "ratio": "16:9",
        "quality": "high",
        "visual_defaults": {
            "composition_rule": "dynamic_diagonal",
            "shot_framing": "medium_close_up",
            "lighting_preset": "dramatic",
            "depth_of_field": "deep",
            "background_blur": "subtle",
        },
        "guidance": {
            "en": "Make it a click-worthy thumbnail with a large readable focal subject, bold contrast, simple background, and space for 2-5 word text if requested.",
            "th": "ทำเป็นภาพปกที่น่าคลิก ตัวแบบหลักใหญ่และอ่านเร็ว คอนทราสต์เด่น พื้นหลังไม่รก และเหลือพื้นที่สำหรับข้อความ 2-5 คำถ้าผู้ใช้ต้องการ",
        },
        "modifiers": ["click-worthy thumbnail", "large readable focal subject", "bold contrast"],
        "avoid": ["small facial details", "low contrast", "too many competing subjects"],
        "questions": ["What short hook text should appear on the thumbnail?"],
    },
    "social_post": {
        "ratio": "4:5",
        "quality": "high",
        "visual_defaults": {
            "composition_rule": "centered",
            "shot_framing": "medium_shot",
            "lighting_preset": "studio_softbox",
            "depth_of_field": "deep",
            "background_blur": "subtle",
        },
        "guidance": {
            "en": "Create a thumb-stopping feed post with an immediate hook, strong first-glance contrast, one clear message, premium spacing, and mobile-readable text hierarchy.",
            "th": "สร้างโพสต์ฟีดที่หยุดนิ้วคนดู มี hook เห็นทันที คอนทราสต์เด่นตั้งแต่แรกเห็น สื่อสารข้อความเดียว ระยะหายใจพรีเมี่ยม และลำดับตัวอักษรอ่านชัดบนมือถือ",
        },
        "modifiers": ["thumb-stopping hook", "mobile-readable hierarchy", "premium social layout"],
        "avoid": ["too many messages", "tiny mobile text", "generic stock-photo feel"],
        "questions": ["What is the one hook or offer the viewer should understand in the first second?"],
    },
    "story_post": {
        "ratio": "9:16",
        "quality": "high",
        "visual_defaults": {
            "composition_rule": "centered",
            "shot_framing": "medium_shot",
            "lighting_preset": "studio_softbox",
            "depth_of_field": "deep",
            "background_blur": "subtle",
        },
        "guidance": {
            "en": "Design a vertical story post with a fast visual hook, safe top and bottom UI zones, bold central subject, and swipe-stopping contrast.",
            "th": "ออกแบบสตอรี่แนวตั้งที่มี hook เร็ว เว้นพื้นที่ปลอดภัยด้านบนและล่างสำหรับ UI ตัวแบบหลักเด่นกลางภาพ และคอนทราสต์ที่หยุดการปัดผ่าน",
        },
        "modifiers": ["vertical story safe zones", "swipe-stopping contrast", "bold central subject"],
        "avoid": ["critical text under story UI", "weak focal point", "flat lighting"],
        "questions": ["Should this story prioritize awareness, promotion, lead capture, or event reminder?"],
    },
    "presentation_slide": {
        "ratio": "16:9",
        "quality": "high",
        "visual_defaults": {
            "composition_rule": "symmetry",
            "shot_framing": "wide_shot",
            "lighting_preset": "high_key",
            "depth_of_field": "deep",
            "background_blur": "none",
        },
        "guidance": {
            "en": "Create a modern premium presentation slide with one clear idea, executive-grade spacing, crisp title/body zones, restrained visual accents, and readable chart or diagram areas if needed.",
            "th": "สร้างสไลด์นำเสนอที่ทันสมัยและพรีเมี่ยม มีหนึ่งไอเดียหลัก ระยะหายใจแบบงานผู้บริหาร โซนหัวข้อ/เนื้อหาคมชัด ใช้องค์ประกอบตกแต่งอย่างพอดี และพื้นที่กราฟหรือไดอะแกรมอ่านง่ายถ้าจำเป็น",
        },
        "modifiers": ["modern executive slide", "one clear idea", "crisp title and body zones"],
        "avoid": ["template clutter", "tiny paragraph text", "decorative overload"],
        "questions": ["What is the slide title and the single takeaway the audience should remember?"],
    },
    "infographic": {
        "ratio": "4:5",
        "quality": "high",
        "visual_defaults": {
            "composition_rule": "symmetry",
            "shot_framing": "wide_shot",
            "lighting_preset": "high_key",
            "depth_of_field": "deep",
            "background_blur": "none",
        },
        "guidance": {
            "en": "Build a clean infographic with a clear reading order, grouped data blocks, simple icons, crisp labels, and enough spacing for every text element.",
            "th": "สร้างอินโฟกราฟิกสะอาด มีลำดับการอ่านชัด กลุ่มข้อมูลเป็นระเบียบ ไอคอนเรียบ ป้ายข้อความคม และเว้นระยะให้ทุกตัวอักษรอ่านง่าย",
        },
        "modifiers": ["clear reading order", "grouped data blocks", "crisp labels"],
        "avoid": ["unverified statistics", "crowded labels", "decorative chart junk"],
        "questions": ["What exact data points, labels, or steps must be included?"],
    },
    "diagram": {
        "ratio": "16:9",
        "quality": "high",
        "visual_defaults": {
            "composition_rule": "symmetry",
            "shot_framing": "wide_shot",
            "lighting_preset": "high_key",
            "depth_of_field": "deep",
            "background_blur": "none",
        },
        "guidance": {
            "en": "Create a precise diagram with simple shapes, consistent connectors, readable labels, and an obvious flow from start to finish.",
            "th": "สร้างไดอะแกรมที่แม่นยำ ใช้รูปทรงเรียบ เส้นเชื่อมสม่ำเสมอ ป้ายข้อความอ่านง่าย และเห็นทิศทางลำดับตั้งแต่ต้นจนจบ",
        },
        "modifiers": ["precise diagram layout", "consistent connectors", "readable labels"],
        "avoid": ["ambiguous arrows", "overlapping labels", "decorative noise"],
        "questions": ["What entities, steps, and relationships must the diagram show?"],
    },
    "ui_mockup": {
        "ratio": "16:9",
        "quality": "high",
        "visual_defaults": {
            "composition_rule": "symmetry",
            "shot_framing": "wide_shot",
            "lighting_preset": "high_key",
            "depth_of_field": "deep",
            "background_blur": "none",
        },
        "guidance": {
            "en": "Generate a polished UI mockup with realistic interface density, consistent spacing, crisp controls, readable labels, and no nonsensical placeholder text.",
            "th": "สร้างม็อกอัป UI ที่ดูใช้งานจริง ความหนาแน่นเหมาะสม ระยะห่างสม่ำเสมอ คอนโทรลคม ป้ายข้อความอ่านง่าย และไม่มี placeholder ที่มั่วหรือไร้ความหมาย",
        },
        "modifiers": ["polished UI mockup", "consistent interface spacing", "crisp controls"],
        "avoid": ["random UI text", "misaligned components", "fake broken charts"],
        "questions": ["What screen, user role, and core task should this UI show?"],
    },
    "product_ad": {
        "ratio": "4:5",
        "quality": "high",
        "visual_defaults": {
            "composition_rule": "centered",
            "shot_framing": "medium_shot",
            "lighting_preset": "studio_softbox",
            "depth_of_field": "medium",
            "background_blur": "subtle",
        },
        "guidance": {
            "en": "Create a premium product ad with the product as the hero, clear value cue, clean commercial lighting, realistic scale, and enough negative space for offer text.",
            "th": "สร้างโฆษณาสินค้าพรีเมี่ยม ให้สินค้าเป็นพระเอก สื่อคุณค่าชัด แสงโฆษณาสะอาด สัดส่วนสมจริง และเหลือพื้นที่สำหรับข้อความโปรโมชัน",
        },
        "modifiers": ["hero product focus", "clean commercial lighting", "realistic product scale"],
        "avoid": ["distorted product proportions", "extra fake logos", "messy props"],
        "questions": ["What is the product name, main benefit, and offer or CTA?"],
    },
    "product_mockup": {
        "ratio": "4:5",
        "quality": "high",
        "visual_defaults": {
            "composition_rule": "centered",
            "shot_framing": "medium_close_up",
            "lighting_preset": "studio_softbox",
            "depth_of_field": "deep",
            "background_blur": "none",
        },
        "guidance": {
            "en": "Create a clean product mockup where the product is sharp, centered, undistorted, correctly proportioned, and lit with realistic contact shadows and clear readable surface details.",
            "th": "สร้างม็อกอัปสินค้าที่สะอาด สินค้าคมชัด อยู่กลางภาพ ไม่บิดเบี้ยว สัดส่วนถูกต้อง แสงและเงาสัมผัสสมจริง และรายละเอียดบนผิวสินค้าอ่านชัด",
        },
        "modifiers": ["undistorted product geometry", "accurate proportions", "readable product details"],
        "avoid": ["warped product label", "changed product shape", "unreadable surface text", "floating product"],
        "questions": ["Is there a reference product image, exact label text, or required viewing angle?"],
    },
    "document_replica": {
        "ratio": "3:4",
        "quality": "high",
        "visual_defaults": {
            "composition_rule": "symmetry",
            "shot_framing": "top_down",
            "lighting_preset": "high_key",
            "depth_of_field": "deep",
            "background_blur": "none",
        },
        "guidance": {
            "en": "Make a document-like replica with straight edges, consistent margins, readable text blocks, and no invented legal, financial, or factual details.",
            "th": "สร้างภาพเอกสารที่ขอบตรง ระยะขอบสม่ำเสมอ กล่องข้อความอ่านง่าย และไม่สร้างรายละเอียดทางกฎหมาย การเงิน หรือข้อเท็จจริงขึ้นเอง",
        },
        "modifiers": ["straight document edges", "consistent margins", "readable text blocks"],
        "avoid": ["fake official seals", "invented personal data", "warped document text"],
        "questions": ["Which text must be exact, and is this a fictional layout or a supplied reference document?"],
    },
    "character_sheet": {
        "ratio": "16:9",
        "quality": "high",
        "visual_defaults": {
            "composition_rule": "symmetry",
            "shot_framing": "full_body",
            "lighting_preset": "studio_softbox",
            "depth_of_field": "deep",
            "background_blur": "none",
        },
        "guidance": {
            "en": "Create a character sheet with consistent identity, front/side/back views or expression poses, clean neutral background, and clearly separated panels.",
            "th": "สร้างชีตตัวละครที่เอกลักษณ์คงที่ มีมุมหน้า/ข้าง/หลังหรือท่าทางแสดงสีหน้า ฉากหลังกลางสะอาด และแยกช่องภาพชัด",
        },
        "modifiers": ["consistent character identity", "neutral reference background", "separated view panels"],
        "avoid": ["changing facial structure between views", "inconsistent costume", "overly dramatic lighting"],
        "questions": ["Which views, expressions, outfit details, and character traits must stay locked?"],
    },
    "packaging_mockup": {
        "ratio": "4:5",
        "quality": "high",
        "visual_defaults": {
            "composition_rule": "centered",
            "shot_framing": "medium_close_up",
            "lighting_preset": "studio_softbox",
            "depth_of_field": "deep",
            "background_blur": "none",
        },
        "guidance": {
            "en": "Create a premium packaging mockup with correct package proportions, front label readability, realistic material finish, clean edges, accurate folds, and product text kept sharp.",
            "th": "สร้างม็อกอัปแพ็กเกจพรีเมี่ยม สัดส่วนบรรจุภัณฑ์ถูกต้อง ฉลากด้านหน้าอ่านชัด ผิววัสดุสมจริง ขอบสะอาด รอยพับแม่นยำ และตัวหนังสือบนแพ็กเกจคม",
        },
        "modifiers": ["premium packaging mockup", "front label readability", "realistic material finish", "correct package proportions"],
        "avoid": ["warped package label", "incorrect box proportions", "blurred brand text", "extra invented claims"],
        "questions": ["What package type, exact front label text, material, and reference artwork should be preserved?"],
    },
    "storyboard": {
        "ratio": "16:9",
        "quality": "high",
        "visual_defaults": {
            "composition_rule": "rule_of_thirds",
            "shot_framing": "wide_shot",
            "lighting_preset": "moody_cinematic",
            "depth_of_field": "deep",
            "background_blur": "none",
        },
        "guidance": {
            "en": "Create a coherent storyboard where every panel belongs to one continuous story, locking the same character identity, wardrobe, props, location logic, lighting direction, and visual style across panels.",
            "th": "สร้างสตอรี่บอร์ดที่ทุกช่องต่อเนื่องเป็นเรื่องเดียวกัน โดยล็อกเอกลักษณ์ตัวละคร เสื้อผ้า พร็อพ ตรรกะสถานที่ ทิศทางแสง และสไตล์ภาพให้ตรงกันทุกช่อง",
        },
        "modifiers": ["strict storyboard continuity", "locked character identity across panels", "consistent location and lighting"],
        "avoid": ["character drift between panels", "unrelated scenes", "inconsistent wardrobe or props"],
        "questions": ["What are the key beats for each panel, and which character/location details must stay locked?"],
    },
    "contact_sheet": {
        "ratio": "16:9",
        "quality": "high",
        "visual_defaults": {
            "composition_rule": "symmetry",
            "shot_framing": "medium_shot",
            "lighting_preset": "studio_softbox",
            "depth_of_field": "deep",
            "background_blur": "none",
        },
        "guidance": {
            "en": "Create a contact sheet with consistent lighting, evenly spaced frames, clear variation labels, and comparable angles or poses.",
            "th": "สร้าง contact sheet ที่แสงสม่ำเสมอ ช่องภาพเว้นระยะเท่ากัน มีป้ายกำกับความแตกต่างชัด และมุมภาพหรือท่าทางเปรียบเทียบกันได้",
        },
        "modifiers": ["even contact sheet grid", "consistent lighting across frames", "clear variation labels"],
        "avoid": ["uneven panel sizes", "unrelated variations", "tiny unreadable labels"],
        "questions": ["Which variations, angles, or backgrounds should the contact sheet compare?"],
    },
}


def profile_for(deliverable: str | None) -> dict:
    return deepcopy(DELIVERABLE_PROFILES.get(str(deliverable or "general_image"), DELIVERABLE_PROFILES["general_image"]))


def reference_paths(data: dict) -> list[str]:
    value = data.get("source_image_path")
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def guidance_for(normalized: dict, lang: str) -> str:
    profile = profile_for(normalized.get("deliverable_type"))
    return profile.get("guidance", {}).get(lang, profile.get("guidance", {}).get("en", ""))


def profile_modifiers(normalized: dict) -> list[str]:
    return list(profile_for(normalized.get("deliverable_type")).get("modifiers", []))


def profile_avoid(normalized: dict) -> list[str]:
    return list(profile_for(normalized.get("deliverable_type")).get("avoid", []))


def profile_questions(deliverable: str | None) -> list[str]:
    return list(profile_for(deliverable).get("questions", []))


def visual_defaults_for(deliverable: str | None) -> dict:
    return dict(profile_for(deliverable).get("visual_defaults", {}))
