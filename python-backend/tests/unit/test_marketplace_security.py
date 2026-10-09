"""Security regression tests for the current marketplace request models."""

import pytest
from pydantic import ValidationError

from app.api.v1.marketplace import CreateTemplateRequest, list_marketplace_templates
from app.core.secure_validators import SlugValidator
from app.models.marketplace_template import TemplateCategory
from app.services.marketplace_service import CREATOR_REVENUE_PERCENTAGE


def create_request(**overrides):
    payload = {
        "name": "Test Template",
        "slug": "test-template",
        "tagline": "A useful template",
        "description": "A template description long enough to satisfy the marketplace contract.",
        "category": TemplateCategory.IMAGE_GENERATION,
        "tech_stack": ["react"],
        "price_credits": 100,
        "template_file_url": "https://r2.cloudflare.com/templates/test.zip",
        "preview_images": ["https://r2.cloudflare.com/images/preview.jpg"],
    }
    payload.update(overrides)
    return CreateTemplateRequest(**payload)


@pytest.mark.parametrize(
    "url",
    [
        "https://r2.cloudflare.com/templates/test.zip",
        "https://s3.amazonaws.com/bucket/test.zip",
        "https://bucket.s3.amazonaws.com/test.zip",
        "https://storage.googleapis.com/bucket/test.zip",
    ],
)
def test_template_file_url_accepts_approved_https_storage(url):
    assert create_request(template_file_url=url).template_file_url == url


@pytest.mark.parametrize(
    ("url", "message"),
    [
        ("http://r2.cloudflare.com/templates/test.zip", "HTTPS"),
        ("https://evil.example/templates/test.zip", "not approved"),
        ("https://r2.cloudflare.com/templates/test.exe", "ZIP archive"),
        ("https://r2.cloudflare.com/templates/../test.zip", "Path traversal"),
    ],
)
def test_template_file_url_rejects_unsafe_locations(url, message):
    with pytest.raises(ValidationError, match=message):
        create_request(template_file_url=url)


@pytest.mark.parametrize("slug", ["admin", "api", "marketplace", "download"])
def test_reserved_marketplace_slugs_are_rejected(slug):
    with pytest.raises(ValueError, match="reserved"):
        SlugValidator.validate_slug(slug)


@pytest.mark.parametrize("slug", ["-leading", "trailing-", "double--hyphen", "bad_slug"])
def test_invalid_slug_shapes_are_rejected(slug):
    with pytest.raises((ValueError, ValidationError)):
        create_request(slug=slug)


def test_marketplace_request_removes_active_html_and_event_handlers():
    request = create_request(
        description=(
            "A safe description with enough characters for the marketplace request. "
            "<script>alert('x')</script><img src=x onerror=alert(1)>"
        ),
        tagline="A useful <strong>template</strong> with safe markup",
        readme_content='<a href="javascript:alert(1)" onclick="alert(2)">readme</a>',
    )

    assert "<script" not in request.description.lower()
    assert "onerror" not in request.description.lower()
    assert "<strong>template</strong>" in request.tagline
    assert "javascript:" not in request.readme_content.lower()
    assert "onclick" not in request.readme_content.lower()


@pytest.mark.parametrize(
    "url",
    ["https://evil.example/image.png", "http://r2.cloudflare.com/image.png"],
)
def test_marketplace_preview_image_rejects_unapproved_urls(url):
    with pytest.raises(ValidationError):
        create_request(preview_images=[url])


def test_marketplace_demo_video_accepts_known_platform():
    url = "https://www.youtube.com/watch?v=example123"
    assert create_request(demo_video_url=url).demo_video_url == url


def test_marketplace_demo_video_rejects_unknown_platform():
    with pytest.raises(ValidationError):
        create_request(demo_video_url="https://video.evil.example/watch/1")


def test_marketplace_search_limit_is_declared_on_endpoint():
    search_parameter = next(
        parameter for parameter in list_marketplace_templates.__signature__.parameters.values()
        if parameter.name == "search"
    )
    assert search_parameter.default.max_length == 100


def test_marketplace_revenue_share_matches_service_policy():
    assert CREATOR_REVENUE_PERCENTAGE == 85
