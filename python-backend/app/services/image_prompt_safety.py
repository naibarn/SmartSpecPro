"""Validation for the application-side image prompt safety gate.

The web application performs the LLM-backed rewrite.  Python remains a
defense-in-depth boundary: an image request may reach a provider only when it
contains a trusted, persisted safety decision marker.
"""

from collections.abc import Mapping
from typing import Any

PROMPT_SAFETY_EXTRA_PARAM = "__prompt_safety"
PROMPT_SAFETY_SKILL_ID = "image-prompt-safety-rewriter"
PROMPT_SAFETY_MODES = {"standard", "vertical_drama_managed"}


def validate_image_prompt_safety(extra_params: Mapping[str, Any] | None) -> dict[str, Any]:
    """Return the validated marker or raise ``ValueError``.

    This intentionally does not attempt to reproduce the LLM rewrite in the
    worker.  Missing or malformed markers fail closed instead of allowing an
    unreviewed prompt to reach an external image provider.
    """

    marker = extra_params.get(PROMPT_SAFETY_EXTRA_PARAM) if extra_params else None
    if not isinstance(marker, Mapping):
        raise ValueError("Image prompt safety review is required before provider submission.")
    if marker.get("checked") is not True:
        raise ValueError("Image prompt safety review marker is invalid.")
    if marker.get("skillId") != PROMPT_SAFETY_SKILL_ID:
        raise ValueError("Image prompt safety review skill is invalid.")
    if marker.get("mode") not in PROMPT_SAFETY_MODES:
        raise ValueError("Image prompt safety review mode is invalid.")
    if marker.get("blocked") is True:
        raise ValueError("Image prompt was blocked by the image safety skill.")
    return dict(marker)
