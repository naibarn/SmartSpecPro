import importlib
import time


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


def test_text_render_telemetry_version_policy_matrix_outcomes():
    worker = _load_worker_module()
    cases = [
        (
            {"contractVersion": "1.0", "compatibilityPolicy": {"unsupportedContractPolicy": "reject_with_clear_error"}},
            [],
            "supported",
        ),
        (
            {"contractVersion": "3.0", "compatibilityPolicy": {"unsupportedContractPolicy": "reject_with_clear_error"}},
            [],
            "unsupported_rejected",
        ),
        (
            {"contractVersion": "3.0", "compatibilityPolicy": {"unsupportedContractPolicy": "gated_downgrade"}},
            [],
            "gated_downgrade_no_text",
        ),
        (
            {"contractVersion": "3.0", "compatibilityPolicy": {"unsupportedContractPolicy": "gated_downgrade"}},
            [_make_text_clip()],
            "unsupported_with_text_rejected",
        ),
        (
            {"contractVersion": "bad.version"},
            [],
            "invalid_contract_version",
        ),
    ]

    for project, clips, expected in cases:
        telemetry = worker._build_text_render_telemetry(
            project,
            clips,
            strategy="ass",
            fast_path={"eligible": False, "reason": "compatibility_matrix"},
        )
        assert telemetry["versionPolicyOutcome"] == expected


def test_generate_ass_document_preserves_i18n_fixture_text():
    worker = _load_worker_module()
    clip = _make_text_clip(text="Hello\nภาษาไทย مرحبا שלום ﬁ")

    ass = worker._generate_ass_document([clip], width=1920, height=1080)

    assert r"Hello\Nภาษาไทย مرحبا שלום ﬁ" in ass
    assert "Dialogue: 0,0:00:01.00,0:00:04.00,Style0" in ass


def test_drawtext_filter_escapes_percent_brackets_quotes_and_colons():
    worker = _load_worker_module()
    clip = _make_text_clip(text="100% [safe] 'quote':value")

    drawtext_filter = worker._build_drawtext_filter([clip], width=1920, height=1080)

    assert r"100\% \[safe\] \'quote\'\:value" in drawtext_filter
    assert ";" not in drawtext_filter


def test_text_render_benchmark_ass_generation_under_threshold():
    worker = _load_worker_module()
    clips = []
    for idx in range(220):
        clips.append(
            _make_text_clip(
                text=f"Benchmark {idx}",
                font_family="Noto Sans",
            )
        )
        clips[-1]["clipId"] = f"txt-{idx}"
        clips[-1]["startMs"] = idx * 10
        clips[-1]["outMs"] = clips[-1]["startMs"] + 3000

    started = time.perf_counter()
    ass = worker._generate_ass_document(clips, width=1920, height=1080)
    elapsed_ms = (time.perf_counter() - started) * 1000

    assert "Dialogue: 0,0:00:00.00,0:00:03.00,Style0" in ass
    assert elapsed_ms < 800
