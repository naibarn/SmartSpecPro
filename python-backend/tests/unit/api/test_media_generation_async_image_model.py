from app.api.v1.media_generation import _resolve_async_image_model
from app.llm_proxy.models import ImageGenerationRequest


def _request(
    *,
    reference_image_urls: list[str] | None,
    api_config: dict | None,
) -> ImageGenerationRequest:
    return ImageGenerationRequest(
        model="gpt-image-2-text-to-image",
        prompt="Generate an episode frame",
        reference_image_urls=reference_image_urls,
        api_config=api_config,
    )


def test_async_image_model_uses_reference_variant_when_opted_in():
    request = _request(
        reference_image_urls=["https://cdn.example.com/character.png"],
        api_config={
            "kie_model_id": "gpt-image-2-text-to-image",
            "kie_model_id_with_references": "gpt-image-2-image-to-image",
        },
    )

    assert _resolve_async_image_model(request) == "gpt-image-2-image-to-image"


def test_async_image_model_keeps_canonical_model_without_references():
    request = _request(
        reference_image_urls=None,
        api_config={
            "kie_model_id": "gpt-image-2-text-to-image",
            "kie_model_id_with_references": "gpt-image-2-image-to-image",
        },
    )

    assert _resolve_async_image_model(request) == "gpt-image-2-text-to-image"


def test_async_image_model_does_not_change_non_opt_in_models():
    request = _request(
        reference_image_urls=["https://cdn.example.com/reference.png"],
        api_config={"kie_model_id": "some-other-upstream-model"},
    )

    assert _resolve_async_image_model(request) == "gpt-image-2-text-to-image"
