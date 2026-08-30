import pytest

from app.services.image_prompt_safety import validate_image_prompt_safety


def _marker(**overrides):
    marker = {
        "checked": True,
        "mode": "standard",
        "skillId": "image-prompt-safety-rewriter",
        "skillVersion": "1.0.0",
        "blocked": False,
    }
    marker.update(overrides)
    return marker


def test_accepts_checked_standard_marker():
    assert validate_image_prompt_safety({"__prompt_safety": _marker()})["checked"] is True


def test_accepts_vertical_drama_managed_marker():
    marker = _marker(mode="vertical_drama_managed")
    assert validate_image_prompt_safety({"__prompt_safety": marker})["mode"] == "vertical_drama_managed"


def test_accepts_vertical_drama_cover_marker():
    marker = _marker(
        mode="vertical_drama_cover",
        skillId="vertical-drama-episode-cover-safety-rewriter",
    )
    assert validate_image_prompt_safety({"__prompt_safety": marker})["mode"] == "vertical_drama_cover"


@pytest.mark.parametrize(
    "extra_params",
    [
        None,
        {},
        {"__prompt_safety": {"checked": False}},
        {"__prompt_safety": _marker(skillId="other-skill")},
        {"__prompt_safety": _marker(mode="unknown")},
        {
            "__prompt_safety": _marker(
                mode="vertical_drama_cover",
                skillId="image-prompt-safety-rewriter",
            )
        },
        {"__prompt_safety": _marker(blocked=True)},
    ],
)
def test_rejects_missing_or_invalid_marker(extra_params):
    with pytest.raises(ValueError):
        validate_image_prompt_safety(extra_params)
