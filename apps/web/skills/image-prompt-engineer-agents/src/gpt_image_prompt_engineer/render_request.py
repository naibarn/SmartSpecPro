from .deliverables import reference_paths


def build_render_request(normalized: dict, prompt: str) -> dict:
    """Build model-free render parameters.

    The application/API caller supplies the image model externally, e.g. gpt-image-2.
    This skill intentionally does not set, infer, validate, or return a model name.
    """
    image_api = {
        "prompt": prompt,
        "size": normalized["render_size"],
        "quality": normalized["quality"],
        "output_format": normalized["output_format"],
        "background": normalized["api_background"],
        "moderation": normalized.get("moderation", "auto"),
        "n": normalized.get("n", 1),
    }
    refs = reference_paths(normalized)
    if refs:
        image_api["input_images"] = refs
    if normalized.get("mask_image_path"):
        image_api["mask_image"] = normalized["mask_image_path"]
    if normalized.get("output_compression") is not None and normalized["output_format"] in ("jpeg", "webp"):
        image_api["output_compression"] = normalized["output_compression"]

    tool_config = {
        "type": "image_generation",
        "size": normalized["render_size"],
        "quality": normalized["quality"],
        "format": normalized["output_format"],
        "background": normalized["api_background"],
    }
    if normalized.get("output_compression") is not None and normalized["output_format"] in ("jpeg", "webp"):
        tool_config["compression"] = normalized["output_compression"]
    if normalized.get("render_action") in ("auto", "generate", "edit"):
        tool_config["action"] = normalized.get("render_action", "auto")

    responses_tool = {
        "input": prompt,
        "tools": [tool_config],
        "tool_choice": {"type": "image_generation"},
    }
    if refs:
        responses_tool["input_images"] = refs
    if normalized.get("mask_image_path"):
        responses_tool["mask_image"] = normalized["mask_image_path"]
    return {
        "api": normalized.get("render_api", "image_api"),
        "image_api": image_api,
        "responses_tool": responses_tool,
        "external_renderer_required": True,
        "external_renderer_note": "The API caller supplies the rendering engine outside this skill; current deployment uses gpt-image-2.",
    }
