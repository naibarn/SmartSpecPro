"""Ten-pass invariant audit for character-prompt-skill.

This is intentionally a lightweight contract audit, not a visual-quality grader.
It checks that the skill instructions, schemas, role taxonomy, and the latest
supporting-cast example agree with one another.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator


ROOT = Path(__file__).resolve().parents[1]
INSTALLED = Path(r"C:\Users\naiba\.codex\skills\character-prompt-skill")


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def sample_characters() -> list[dict]:
    return [
        {
            "character_id": "char_grandfather_01",
            "name": "ปู่ภพ",
            "role": "ปู่ของพระเอก",
            "narrative_role": "supporting",
            "role_tier": "elder_patriarch",
            "occupation": "อดีตช่างซ่อมเรือ",
            "description": "ชายไทยอายุ 76 ปี อาศัยอยู่ริมแม่น้ำเจ้าพระยา เป็นคนพูดน้อย สุขุม รู้ความลับเรื่องอดีตของครอบครัว และยังคอยปกป้องหลานชายอยู่เงียบ ๆ",
            "region_ethnicity": {"descriptor": "Thai, Central Thai / Bangkok riverside community", "explicit": True},
        },
        {
            "character_id": "char_grandmother_01",
            "name": "ยายลำดวน",
            "role": "ยายของนางเอก",
            "narrative_role": "supporting",
            "role_tier": "elder_matriarch",
            "occupation": "อดีตแม่ครัวร้านอาหารตลาดเก่า",
            "description": "หญิงไทยเชื้อสายไทย-จีนอายุ 72 ปี อารมณ์ดี พูดตรง จำรายละเอียดของคนในชุมชนได้แม่น และรู้ว่าครอบครัวนางเอกกำลังถูกหลอก",
            "region_ethnicity": {"descriptor": "Thai-Chinese Bangkok old-market community", "explicit": True},
        },
        {
            "character_id": "char_market_vendor_01",
            "name": "พี่แอ๋ว",
            "role": "แม่ค้าขายน้ำสมุนไพรในตลาด",
            "narrative_role": "supporting",
            "role_tier": "support_memorable",
            "occupation": "แม่ค้าขายน้ำสมุนไพร",
            "description": "หญิงไทยอายุ 49 ปี มีอารมณ์ขัน พูดเร็ว สังเกตคนเก่ง และเป็นคนแรกที่เห็นพระเอกมาที่ตลาดในคืนเกิดเหตุ",
            "region_ethnicity": {"descriptor": "Thai, Northeastern heritage living in Bangkok", "explicit": True},
        },
    ]


def sample_series() -> dict:
    return {
        "title": "สัญญารักใต้เงาฝน",
        "genre": "romantic legal thriller",
        "tone": "ตึงเครียด ลึกลับ แต่มีความอบอุ่นและโรแมนติก",
        "locale": "th",
        "targetAudience": "ผู้ชมไทยวัยผู้ใหญ่ 18-34 ปี",
        "dialogueLanguage": "ภาษาไทยร่วมสมัยแบบเป็นธรรมชาติ",
        "storyWorld": "สำนักงานกฎหมายเก่าแก่ย่านสาทร และชุมชนริมแม่น้ำเจ้าพระยา",
        "emotionalEngine": "ความจริงต้องปะทะกับความภักดีต่อครอบครัว",
        "visualCulture": "ภาพ live-action ไทยระดับพรีเมียม หรูแบบไม่โอ้อวด",
        "realismLevel": "elevated grounded realism",
        "beautyDirection": "หล่อสวยระดับนักแสดงนำ แต่ยังมีผิวจริง",
        "dominantColors": ["charcoal", "amber", "deep teal"],
        "signatureMotifs": ["หยดฝนบนกระจก", "เงาสะท้อนแม่น้ำ"],
        "prohibitedRepetition": ["generic CEO suit", "influencer beauty"],
    }


def check_packaging() -> None:
    text = read(ROOT / "SKILL.md")
    assert_true(text.startswith("---\n"), "SKILL.md has no frontmatter")
    assert_true("name: character-prompt-skill" in text, "frontmatter name mismatch")
    assert_true("description:" in text and len(text.split("description:", 1)[1].splitlines()[0]) > 30, "description too thin")
    assert_true((ROOT / "references").is_dir() and (ROOT / "schemas").is_dir(), "resource folders missing")


def check_resources() -> None:
    text = read(ROOT / "SKILL.md")
    for resource in [
        "schemas/series-dna.schema.json",
        "schemas/character-input.schema.json",
        "schemas/character-prompt-request.schema.json",
        "schemas/character-prompt-profile.schema.json",
        "references/series-context-processing.md",
        "references/role-taxonomy.md",
        "references/face-quality-gate.md",
        "references/diversity-and-presentation.md",
        "references/safety-and-realism.md",
    ]:
        assert_true((ROOT / resource).exists(), f"missing resource: {resource}")
    assert_true("character-prompt-profile.schema.json" in text, "profile schema not routed")


def check_schema_health() -> None:
    for path in sorted((ROOT / "schemas").glob("*.json")):
        schema = load_json(path)
        Draft202012Validator.check_schema(schema)
    input_schema = load_json(ROOT / "schemas/character-input.schema.json")
    profile_schema = load_json(ROOT / "schemas/character-prompt-profile.schema.json")
    assert_true("elder_patriarch" in input_schema["properties"]["role_tier"]["enum"], "input elder tier missing")
    assert_true("support_general" in profile_schema["properties"]["role"]["enum"], "output support tier missing")
    assert_true("quality_gate" in profile_schema["properties"], "quality_gate trace missing")


def check_exact_input_contract() -> None:
    schema = load_json(ROOT / "schemas/character-input.schema.json")
    validator = Draft202012Validator(schema)
    for character in sample_characters():
        errors = list(validator.iter_errors(character))
        assert_true(not errors, f"sample character rejected: {character['name']}: {errors[0].message if errors else ''}")


def check_request_contract() -> None:
    request_schema = load_json(ROOT / "schemas/character-prompt-request.schema.json")
    series_schema = load_json(ROOT / "schemas/series-dna.schema.json")
    assert_true(not list(Draft202012Validator(series_schema).iter_errors(sample_series())), "Series DNA sample rejected")
    request = {"series_dna": sample_series(), "characters": sample_characters(), "generation": {"images_per_character": 1, "face_diversity": "high"}}
    # Resolve the two local refs explicitly because this test is run from the skill folder.
    from referencing import Registry, Resource

    registry = Registry().with_resources([
        ("https://example.local/schemas/series-dna.schema.json", Resource.from_contents(series_schema)),
        ("https://example.local/schemas/character-input.schema.json", Resource.from_contents(load_json(ROOT / "schemas/character-input.schema.json"))),
    ])
    validator = Draft202012Validator(request_schema, registry=registry)
    errors = list(validator.iter_errors(request))
    assert_true(not errors, f"full request rejected: {errors[0].message if errors else ''}")


def check_role_compatibility() -> None:
    text = read(ROOT / "SKILL.md") + read(ROOT / "references/role-taxonomy.md")
    for tier in ["elder_patriarch", "elder_matriarch", "support_memorable", "support_general"]:
        assert_true(tier in text, f"role tier not routed: {tier}")
    assert_true("role compatibility" in text.lower(), "role compatibility preflight missing")
    assert_true("narrative_role: supporting" in text, "supporting compatibility rule missing")


def check_supporting_gate() -> None:
    gate = read(ROOT / "references/face-quality-gate.md")
    skill = read(ROOT / "SKILL.md")
    for phrase in ["ordinary, believable face", "age-accurate", "natural asymmetry"]:
        assert_true(phrase.lower() in gate.lower() or phrase.lower() in skill.lower(), f"supporting gate lacks: {phrase}")
    assert_true(
        "ไม่จำเป็นต้องมีใบหน้าระดับพระเอกนางเอก" in gate
        or "ไม่ใช่ความงามแบบนักแสดงนำ" in gate
        or "no lead-level beauty requirement" in gate.lower(),
        "supporting gate does not explicitly lower the lead beauty requirement",
    )


def check_safety() -> None:
    text = read(ROOT / "SKILL.md") + read(ROOT / "references/safety-and-realism.md")
    for phrase in ["teen_age_appropriate", "child_age_appropriate", "adult tasteful allure", "sexualized"]:
        assert_true(phrase.lower() in text.lower(), f"safety rule missing: {phrase}")
    assert_true("review_status" in text, "review state policy missing")


def check_diversity_and_trace() -> None:
    diversity = read(ROOT / "references/diversity-and-presentation.md")
    context = read(ROOT / "references/series-context-processing.md")
    skill = read(ROOT / "SKILL.md")
    for phrase in ["near_duplicate", "face family", "support_memorable", "visual dominance"]:
        assert_true(phrase.lower() in diversity.lower() or phrase.lower() in skill.lower(), f"diversity rule missing: {phrase}")
    for phrase in ["storyWorld", "story_world", "prohibitedRepetition", "prohibited_repetition"]:
        assert_true(phrase in context or phrase in skill, f"trace mapping missing: {phrase}")


def check_profile_contract() -> None:
    schema = load_json(ROOT / "schemas/character-prompt-profile.schema.json")
    profile = {
        "prompt_id": "audit-support-01",
        "role": "elder_patriarch",
        "age_band": "adult_35_plus",
        "region_direction": "custom",
        "series_context": {
            "title": "x", "genre": "x", "tone": "x", "story_world": "x", "visual_culture": "x",
            "realism_level": "x", "beauty_direction": "x", "dominant_colors": ["x"],
            "signature_motifs": ["x"], "prohibited_repetition": []
        },
        "character_identity": {"character_id": "x", "role": "ปู่ของพระเอก", "name": "ปู่ภพ", "narrative_role": "supporting", "role_tier": "elder_patriarch", "description": "x", "region_ethnicity": {"descriptor": "Thai", "explicit": True}},
        "visual_translation": {"tone_to_lighting": "x", "world_to_environment": "x", "emotional_engine_to_expression": "x", "character_to_wardrobe": "x", "prohibited_patterns": []},
        "face_blueprint": {"face_family": "x", "jaw_profile": "x", "chin_profile": "x", "face_length_width": "x", "eye_geometry": "x", "nose_geometry": "x", "mouth_geometry": "x", "distinctive_detail": "x"},
        "presentation_profile": {"makeup_level": "none", "wardrobe": "x", "lighting": "x", "pose_expression": "x", "environment": "x"},
        "positive_prompt": "A realistic fictional elderly Thai supporting character with ordinary believable features and age-accurate skin.",
        "negative_prompt": "No plastic skin, no lead-level glamour, no anatomy errors.",
        "hard_gate_checks": {"jaw_ok": True, "chin_ok": True, "proportion_ok": True, "age_ok": True, "realism_required": True},
        "quality_gate": {"gate_type": "elder", "face_priority": "ordinary_believable", "disallowed_shortcuts": ["lead glamour"]},
        "diversity_signature": {"face_family": "x", "eye_geometry": "x", "nose_geometry": "x", "mouth_geometry": "x", "lower_face": "x"},
        "safety_mode": "adult_general", "review_status": "generated"
    }
    errors = list(Draft202012Validator(schema).iter_errors(profile))
    assert_true(not errors, f"synthetic profile rejected: {errors[0].message if errors else ''}")


def check_source_installed_parity() -> None:
    assert_true(INSTALLED.exists(), "installed skill missing")
    for source in [ROOT / "SKILL.md", *sorted((ROOT / "references").glob("*.md")), *sorted((ROOT / "schemas").glob("*.json"))]:
        target = INSTALLED / source.relative_to(ROOT)
        assert_true(target.exists(), f"installed resource missing: {target.name}")
        assert_true(source.read_bytes() == target.read_bytes(), f"source/installed mismatch: {source.name}")


def main() -> int:
    rounds = [
        ("packaging and frontmatter", check_packaging),
        ("resource routing", check_resources),
        ("schema health and new role enums", check_schema_health),
        ("exact supporting input contract", check_exact_input_contract),
        ("full request contract", check_request_contract),
        ("role compatibility", check_role_compatibility),
        ("supporting-cast quality gate", check_supporting_gate),
        ("safety and review states", check_safety),
        ("diversity and series trace", check_diversity_and_trace),
        ("profile output and source parity", lambda: (check_profile_contract(), check_source_installed_parity())),
    ]
    failures = 0
    for number, (label, check) in enumerate(rounds, 1):
        try:
            check()
        except Exception as exc:  # noqa: BLE001 - audit should report every failed pass
            failures += 1
            print(f"ROUND {number:02d} FAIL - {label}: {exc}")
        else:
            print(f"ROUND {number:02d} PASS - {label}")
    print(f"AUDIT_RESULT={'PASS' if failures == 0 else 'FAIL'} rounds=10 failures={failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
