SEXUAL_TERMS = ["nude", "explicit", "porn", "sexual", "nsfw", "โป๊", "เปลือย", "ลามก", "อนาจาร"]
MINOR_TERMS = ["child", "kid", "teen", "minor", "underage", "เด็ก", "วัยรุ่น", "เยาวชน"]
GRAPHIC_VIOLENCE_TERMS = ["gore", "bloodbath", "dismember", "graphic violence", "เลือดสาด", "ชำแหละ"]
HATE_TERMS = ["nazi propaganda", "racial slur", "hate symbol", "สัญลักษณ์เกลียดชัง"]
SELF_HARM_TERMS = ["self-harm", "suicide", "kill myself", "ทำร้ายตัวเอง", "ฆ่าตัวตาย"]
ILLEGAL_TERMS = ["counterfeit", "fake id", "credit card fraud", "weapon instructions", "ยาเสพติด", "ปลอมเอกสาร"]
DECEPTION_TERMS = ["fake endorsement", "deepfake", "impersonate", "ปลอมเป็น", "หลอกว่า"]


def _has_any(topic: str, terms: list[str]) -> bool:
    return any(term in topic for term in terms)


def review(payload: dict, normalized: dict) -> dict:
    flags = []
    notes = []
    risk = "low"
    status = "ok"
    level = normalized.get("safety_review_level", payload.get("safety_review_level", "standard"))

    age = payload.get("subject_age")
    if age is not None and age <= 18:
        flags.append("age_sensitive")
        notes.append("Subject age is 18 or lower; prompt should keep styling fully non-sexualized, age-appropriate, and respectful.")
        risk = "medium"
        status = "review"

    if payload.get("depicts_real_person"):
        flags.append("real_person")
        notes.append("Depicts a real person; preserve consent, identity, and avoid misleading context.")
        status = "review"

    if payload.get("depicts_public_figure"):
        flags.append("public_figure")
        notes.append("Public figure request: avoid misleading endorsements, political persuasion, or false context.")
        status = "review"

    if payload.get("brand_or_logo"):
        flags.append("brand_or_logo")
        notes.append("Brand/logo mentioned; preserve exact brand elements only when user has rights or reference assets.")
        status = "review"

    if payload.get("copyrighted_character"):
        flags.append("copyrighted_character")
        notes.append("Copyrighted character mentioned; consider an original character inspired by broad traits instead.")
        status = "review"

    if payload.get("medical_or_legal_claim"):
        flags.append("regulated_claim")
        notes.append("Medical/legal claim detected; avoid implying professional advice or guaranteed outcomes.")
        status = "review"
        risk = "medium"

    topic = payload.get("topic","").lower()
    has_sexual = _has_any(topic, SEXUAL_TERMS)
    has_minor = _has_any(topic, MINOR_TERMS) or (age is not None and age < 18)
    if has_sexual:
        flags.append("sexual_content_signal")
        notes.append("Sexualized wording detected; final prompt must be non-explicit or converted to a safe alternative.")
        risk = "high"
        status = "blocked" if has_minor or level in {"standard", "strict", "auto"} else "review"

    if has_sexual and has_minor:
        flags.append("minor_sexual_safety")
        notes.append("Sexualized content involving a minor or young-looking subject is blocked.")
        risk = "high"
        status = "blocked"

    if _has_any(topic, GRAPHIC_VIOLENCE_TERMS):
        flags.append("graphic_violence_signal")
        notes.append("Graphic violence wording detected; final prompt must avoid gore or explicit injury detail.")
        risk = "high"
        status = "blocked" if level in {"standard", "strict", "auto"} else "review"

    if _has_any(topic, SELF_HARM_TERMS):
        flags.append("self_harm_signal")
        notes.append("Self-harm wording detected; final prompt must avoid instructions, depiction, or glamorization.")
        risk = "high"
        status = "blocked"

    if _has_any(topic, HATE_TERMS):
        flags.append("hate_signal")
        notes.append("Hate or extremist signal detected; avoid propaganda, praise, harassment, or symbols used to intimidate.")
        risk = "high"
        status = "blocked" if level in {"standard", "strict", "auto"} else "review"

    if _has_any(topic, ILLEGAL_TERMS):
        flags.append("illegal_activity_signal")
        notes.append("Illegal activity signal detected; avoid operational instructions or deceptive document/product replication.")
        status = "review"
        risk = "medium" if risk != "high" else risk

    if _has_any(topic, DECEPTION_TERMS):
        flags.append("deception_signal")
        notes.append("Deceptive identity or endorsement signal detected; avoid false context and make the scene clearly fictional when needed.")
        status = "review" if status != "blocked" else status
        risk = "medium" if risk != "high" else risk

    if level == "strict" and flags and risk == "low":
        risk = "medium"
        status = "review"

    return {"status": status, "risk_level": risk, "flags": flags, "notes": notes}
