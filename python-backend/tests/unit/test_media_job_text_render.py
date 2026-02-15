import importlib


def _load_worker_module():
    return importlib.import_module("app.tasks.media_job_worker")


def _make_text_clip(
    *,
    text: str = "Hello",
    effect: str = "none",
    font_family: str = "Noto Sans",
    with_keyframes: bool = False,
) -> dict:
    transform = {
        "x": 0.5,
        "y": 0.5,
        "scaleX": 1.0,
        "scaleY": 1.0,
        "rotation": 0,
        "opacity": 1,
        "keyframes": [],
    }
    if with_keyframes:
        transform["keyframes"] = [
            {
                "time": 0,
                "x": 0.5,
                "y": 0.5,
                "scaleX": 1.0,
                "scaleY": 1.0,
                "rotation": 0,
                "opacity": 1,
                "easing": "linear",
            }
        ]
    return {
        "clipId": "txt-1",
        "assetId": "text-asset-1",
        "startMs": 1000,
        "inMs": 0,
        "outMs": 4000,
        "zOrder": 0,
        "transform": transform,
        "textConfig": {
            "text": text,
            "fontFamily": font_family,
            "fontSize": 48,
            "fontWeight": 700,
            "fontStyle": "normal",
            "color": "#FFFFFF",
            "backgroundColor": "transparent",
            "textAlign": "center",
            "effect": effect,
        },
    }


def test_generate_ass_document_contains_escaped_dialogue_and_styles():
    worker = _load_worker_module()
    clip = _make_text_clip(text="Title,{v1}\nLine2")

    ass = worker._generate_ass_document([clip], width=1920, height=1080)

    assert "[Script Info]" in ass
    assert "[V4+ Styles]" in ass
    assert "[Events]" in ass
    assert "Style: Style0" in ass
    assert "Dialogue: 0,0:00:01.00,0:00:04.00,Style0" in ass
    assert r"Title\,\{v1\}\NLine2" in ass


def test_drawtext_fast_path_accepts_only_simple_equivalent_clip():
    worker = _load_worker_module()
    clip = _make_text_clip()

    decision = worker._evaluate_drawtext_fast_path([clip])

    assert decision["eligible"] is True
    assert decision["reason"] == "accepted_equivalent"


def test_drawtext_fast_path_rejects_with_reason_code_for_unsupported_semantics():
    worker = _load_worker_module()
    clip = _make_text_clip(effect="outline")

    decision = worker._evaluate_drawtext_fast_path([clip])

    assert decision["eligible"] is False
    assert decision["reason"] == "unsupported_effect"


def test_drawtext_fast_path_rejects_keyframed_transforms():
    worker = _load_worker_module()
    clip = _make_text_clip(with_keyframes=True)

    decision = worker._evaluate_drawtext_fast_path([clip])

    assert decision["eligible"] is False
    assert decision["reason"] == "animated_transform"


def test_drawtext_filter_escapes_text_and_uses_whitelist_font_fallback():
    worker = _load_worker_module()
    clip = _make_text_clip(text=r"hello:world'[]", font_family="Untrusted Font")

    drawtext_filter = worker._build_drawtext_filter([clip], width=1920, height=1080)

    assert "drawtext=" in drawtext_filter
    assert "font='Noto Sans'" in drawtext_filter
    assert "enable='between(t,1.0,4.0)'" in drawtext_filter
    assert ";" not in drawtext_filter


def test_text_render_telemetry_includes_version_policy_and_font_resolution():
    worker = _load_worker_module()
    clip = _make_text_clip(font_family="Missing Font")
    project = {
        "contractVersion": "3.0",
        "compatibilityPolicy": {"unsupportedContractPolicy": "gated_downgrade"},
    }

    telemetry = worker._build_text_render_telemetry(
        project,
        [clip],
        strategy="ass",
        fast_path={"eligible": False, "reason": "font_unresolved"},
    )

    assert telemetry["strategy"] == "ass"
    assert telemetry["fastPathEligible"] is False
    assert telemetry["fastPathReason"] == "font_unresolved"
    assert telemetry["fontFallbackCount"] == 1
    assert telemetry["fontResolution"][0]["resolved"] == "Noto Sans"
    assert telemetry["versionPolicyOutcome"] == "unsupported_with_text_rejected"
