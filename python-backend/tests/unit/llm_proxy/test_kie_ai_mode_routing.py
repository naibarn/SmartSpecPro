"""Declarative mode routing (`apiConfig.modes`) for multi-endpoint Kie models.

The reference case is minimax-h3, which is three endpoints with genuinely
different input contracts behind one catalog row:

* ``minimax-h3/text-to-video``      — prompt + aspect_ratio + duration
* ``minimax-h3/image-to-video``     — first_frame_url / last_frame_url, NO aspect_ratio
* ``minimax-h3/reference-to-video`` — arrays of image / video / audio references
"""

from unittest.mock import AsyncMock

import pytest

from app.llm_proxy.providers.kie_ai_provider import (
    KieAIProvider,
    count_reference_inputs,
    resolve_generation_api_config,
    resolve_mode_api_config,
)

MINIMAX_H3_API_CONFIG = {
    "kie_model_id": "minimax-h3/text-to-video",
    "modes": [
        {
            "id": "reference-to-video",
            "when": {"minVideos": 1},
            "kie_model_id": "minimax-h3/reference-to-video",
            "reference_image_input_key": "reference_image_urls",
            "reference_image_input_type": "array",
            "reference_video_input_key": "reference_video_urls",
            "reference_video_input_type": "array",
            "reference_audio_input_key": "reference_audio_urls",
            "reference_audio_input_type": "array",
        },
        {
            "id": "reference-to-video-audio",
            "when": {"minAudios": 1},
            "kie_model_id": "minimax-h3/reference-to-video",
            "reference_image_input_key": "reference_image_urls",
            "reference_image_input_type": "array",
            "reference_audio_input_key": "reference_audio_urls",
            "reference_audio_input_type": "array",
        },
        {
            "id": "reference-to-video-multi-image",
            "when": {"minImages": 3},
            "kie_model_id": "minimax-h3/reference-to-video",
            "reference_image_input_key": "reference_image_urls",
            "reference_image_input_type": "array",
        },
        {
            "id": "image-to-video",
            "when": {"minImages": 1, "maxImages": 2},
            "kie_model_id": "minimax-h3/image-to-video",
            "reference_image_input_key": "first_frame_url",
            "reference_image_input_type": "url",
            "reference_image_overflow_keys": ["last_frame_url"],
            "omit_aspect_ratio": True,
            "drop_params": ["aspect_ratio"],
        },
    ],
}


# --------------------------------------------------------------------------
# Backwards compatibility — a row without `modes` must be untouched
# --------------------------------------------------------------------------


def test_row_without_modes_resolves_to_its_api_config_unchanged():
    api_config = {
        "kie_model_id": "veo3",
        "reference_image_input_key": "imageUrls",
        "endpoint": "/api/v1/veo/generate",
    }

    merged, mode_id = resolve_mode_api_config(api_config, {"images": 3, "videos": 1, "audios": 0})

    assert mode_id is None
    assert merged is api_config


def test_none_api_config_is_passed_through():
    merged, mode_id = resolve_mode_api_config(None, {"images": 1, "videos": 0, "audios": 0})
    assert merged is None
    assert mode_id is None


def test_legacy_two_way_image_switch_still_wins_when_no_modes_declared():
    api_config = {
        "kie_model_id": "gpt-image-2-text-to-image",
        "kie_model_id_with_references": "gpt-image-2-image-to-image",
    }

    _, api_model, mode_id = resolve_generation_api_config(
        "gpt-image-2",
        api_config,
        media_type="image",
        reference_image_urls=["https://example.com/a.png"],
    )

    assert mode_id is None
    assert api_model == "gpt-image-2-image-to-image"


# --------------------------------------------------------------------------
# Predicate evaluation
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("images", "videos", "audios", "expected_mode", "expected_model"),
    [
        (0, 0, 0, None, "minimax-h3/text-to-video"),
        (1, 0, 0, "image-to-video", "minimax-h3/image-to-video"),
        (2, 0, 0, "image-to-video", "minimax-h3/image-to-video"),
        (3, 0, 0, "reference-to-video-multi-image", "minimax-h3/reference-to-video"),
        (9, 0, 0, "reference-to-video-multi-image", "minimax-h3/reference-to-video"),
        (0, 1, 0, "reference-to-video", "minimax-h3/reference-to-video"),
        (1, 1, 0, "reference-to-video", "minimax-h3/reference-to-video"),
        (2, 3, 1, "reference-to-video", "minimax-h3/reference-to-video"),
        (1, 0, 1, "reference-to-video-audio", "minimax-h3/reference-to-video"),
    ],
)
def test_attachment_shape_selects_the_mode(images, videos, audios, expected_mode, expected_model):
    counts = {"images": images, "videos": videos, "audios": audios}

    merged, mode_id = resolve_mode_api_config(MINIMAX_H3_API_CONFIG, counts)

    assert mode_id == expected_mode
    assert merged["kie_model_id"] == expected_model
    # The mode list never leaks into the config the request builder consumes.
    assert "modes" not in merged


def test_first_match_wins_and_video_outranks_image_count():
    counts = {"images": 5, "videos": 2, "audios": 0}
    _, mode_id = resolve_mode_api_config(MINIMAX_H3_API_CONFIG, counts)
    assert mode_id == "reference-to-video"


def test_mode_without_when_is_an_unconditional_catch_all():
    api_config = {"kie_model_id": "base", "modes": [{"id": "always", "kie_model_id": "fallback"}]}
    merged, mode_id = resolve_mode_api_config(api_config, {"images": 0, "videos": 0, "audios": 0})
    assert mode_id == "always"
    assert merged["kie_model_id"] == "fallback"


def test_unparseable_predicate_fails_closed_to_the_base_config():
    api_config = {
        "kie_model_id": "base",
        "modes": [
            {"id": "typo", "when": {"minPictures": 1}, "kie_model_id": "wrong"},
            {"id": "bad-value", "when": {"minImages": "many"}, "kie_model_id": "also-wrong"},
        ],
    }

    merged, mode_id = resolve_mode_api_config(api_config, {"images": 4, "videos": 0, "audios": 0})

    assert mode_id is None
    assert merged["kie_model_id"] == "base"


def test_mode_keys_layer_over_the_base_config_and_metadata_is_not_copied():
    api_config = {
        "kie_model_id": "base",
        "endpoint": "/shared",
        "reference_image_input_key": "image_urls",
        "modes": [
            {
                "id": "special",
                "label": "Special",
                "notice": "aspect ratio is ignored",
                "when": {"minImages": 1},
                "reference_image_input_key": "first_frame_url",
            }
        ],
    }

    merged, mode_id = resolve_mode_api_config(api_config, {"images": 1, "videos": 0, "audios": 0})

    assert mode_id == "special"
    assert merged["endpoint"] == "/shared"  # inherited
    assert merged["kie_model_id"] == "base"  # inherited
    assert merged["reference_image_input_key"] == "first_frame_url"  # overridden
    assert "label" not in merged and "notice" not in merged


# --------------------------------------------------------------------------
# Counting
# --------------------------------------------------------------------------


def test_blank_and_malformed_reference_entries_are_not_counted():
    counts = count_reference_inputs(
        reference_image_urls=["https://example.com/a.png", "   ", None, 42],
        reference_video_urls=[{"url": "https://example.com/a.mp4", "start": 1}, {"url": ""}],
        reference_audio_urls="https://example.com/a.mp3",
    )
    assert counts == {"images": 1, "videos": 1, "audios": 1}


# --------------------------------------------------------------------------
# End-to-end payload shape per mode
# --------------------------------------------------------------------------


@pytest.fixture
def provider() -> KieAIProvider:
    return KieAIProvider(api_key="test-key")


async def _submitted_payload(provider: KieAIProvider, **kwargs) -> tuple[str, dict]:
    """Run generate_video in submit-only mode and capture the create_task call."""
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-1"}})
    await provider.generate_video(
        "minimax-h3",
        kwargs.pop("prompt", "a cat on a beach"),
        wait_for_completion=False,
        callback_url="",
        **kwargs,
    )
    args, _ = provider.create_task.call_args
    return args[0], args[1]


@pytest.mark.asyncio
async def test_text_to_video_mode_sends_aspect_ratio_and_no_reference_keys(provider):
    api_model, payload = await _submitted_payload(
        provider,
        api_config=dict(MINIMAX_H3_API_CONFIG),
        duration=6,
        aspect_ratio="16:9",
    )

    assert api_model == "minimax-h3/text-to-video"
    assert payload["aspect_ratio"] == "16:9"
    assert payload["duration"] == 6
    assert "first_frame_url" not in payload
    assert "reference_image_urls" not in payload
    assert "reference_video_urls" not in payload


@pytest.mark.asyncio
async def test_image_to_video_mode_maps_frames_and_drops_aspect_ratio(provider):
    api_model, payload = await _submitted_payload(
        provider,
        api_config=dict(MINIMAX_H3_API_CONFIG),
        duration=8,
        aspect_ratio="9:16",
        reference_image_urls=["https://example.com/first.png", "https://example.com/last.png"],
    )

    assert api_model == "minimax-h3/image-to-video"
    assert payload["first_frame_url"] == "https://example.com/first.png"
    assert payload["last_frame_url"] == "https://example.com/last.png"
    assert payload["duration"] == 8
    # The endpoint has no aspect_ratio parameter at all.
    assert "aspect_ratio" not in payload
    assert "reference_image_urls" not in payload


@pytest.mark.asyncio
async def test_image_to_video_mode_with_a_single_frame_leaves_last_frame_unset(provider):
    _, payload = await _submitted_payload(
        provider,
        api_config=dict(MINIMAX_H3_API_CONFIG),
        reference_image_urls=["https://example.com/first.png"],
    )

    assert payload["first_frame_url"] == "https://example.com/first.png"
    assert "last_frame_url" not in payload


@pytest.mark.asyncio
async def test_reference_to_video_mode_sends_all_three_reference_arrays(provider):
    api_model, payload = await _submitted_payload(
        provider,
        api_config=dict(MINIMAX_H3_API_CONFIG),
        duration=10,
        aspect_ratio="adaptive",
        reference_image_urls=["https://example.com/a.png", "https://example.com/b.png"],
        reference_video_urls=["https://example.com/a.mp4", "https://example.com/b.mp4"],
        reference_audio_urls=["https://example.com/a.mp3"],
    )

    assert api_model == "minimax-h3/reference-to-video"
    assert payload["reference_image_urls"] == [
        "https://example.com/a.png",
        "https://example.com/b.png",
    ]
    assert payload["reference_video_urls"] == [
        "https://example.com/a.mp4",
        "https://example.com/b.mp4",
    ]
    assert payload["reference_audio_urls"] == ["https://example.com/a.mp3"]
    assert payload["aspect_ratio"] == "adaptive"
    assert "first_frame_url" not in payload


@pytest.mark.asyncio
async def test_drop_params_beats_an_extra_params_field_that_re_adds_the_key(provider):
    """`omit_aspect_ratio` runs before the extra_params merge, so a catalog
    inputFields entry can put `aspect_ratio` back. `drop_params` runs last."""
    _, payload = await _submitted_payload(
        provider,
        api_config=dict(MINIMAX_H3_API_CONFIG),
        reference_image_urls=["https://example.com/first.png"],
        extra_params={"aspect_ratio": "16:9", "duration": 12},
    )

    assert "aspect_ratio" not in payload
    assert payload["duration"] == 12


@pytest.mark.asyncio
async def test_a_video_model_without_modes_keeps_its_existing_payload(provider):
    api_model, payload = await _submitted_payload(
        provider,
        api_config={
            "kie_model_id": "happyhorse/image-to-video",
            "omit_aspect_ratio": True,
            "reference_image_input_key": "image_urls",
            "reference_image_input_type": "array",
        },
        duration=5,
        reference_image_urls=["https://example.com/a.png"],
    )

    assert api_model == "happyhorse/image-to-video"
    assert payload["image_urls"] == ["https://example.com/a.png"]
    assert "aspect_ratio" not in payload
    assert payload["duration"] == 5


@pytest.mark.asyncio
async def test_audio_attached_via_extra_params_still_selects_the_reference_mode(provider):
    """There is no studio-level reference-audio channel yet, so audio arrives as
    a catalog `audio_urls` inputField. Mode selection must still see it."""
    api_model, payload = await _submitted_payload(
        provider,
        api_config=dict(MINIMAX_H3_API_CONFIG),
        reference_image_urls=["https://example.com/a.png"],
        extra_params={"reference_audio_urls": ["https://example.com/a.mp3"]},
    )

    assert api_model == "minimax-h3/reference-to-video"
    assert payload["reference_image_urls"] == ["https://example.com/a.png"]
    assert payload["reference_audio_urls"] == ["https://example.com/a.mp3"]
    # Not the image-to-video shape.
    assert "first_frame_url" not in payload
