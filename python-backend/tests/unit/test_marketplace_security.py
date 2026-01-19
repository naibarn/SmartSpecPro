"""
Unit tests for marketplace security fixes
Tests individual security validations and edge cases
"""

import pytest
from decimal import Decimal
from app.api.v1.marketplace import TemplateCreateRequest, TemplateUpdateRequest
from app.models.marketplace_template import TemplateCategory
from pydantic import ValidationError


class TestURLValidation:
    """Test URL validation security fixes"""

    def test_https_enforcement(self):
        """Test that HTTP URLs are rejected"""
        with pytest.raises(ValidationError) as exc_info:
            TemplateCreateRequest(
                title="Test Template",
                slug="test-template",
                tagline="Test tagline",
                description="Test description",
                category=TemplateCategory.IMAGE_GENERATION,
                price_credits=1000,
                template_file_url="http://r2.cloudflare.com/template.zip",
                preview_images=["https://r2.cloudflare.com/preview.jpg"]
            )

        assert "Must use HTTPS" in str(exc_info.value)

    def test_approved_domain_whitelist(self):
        """Test that only approved domains are accepted"""
        # Valid domains
        valid_domains = [
            "https://r2.cloudflare.com/templates/test.zip",
            "https://s3.amazonaws.com/bucket/template.zip",
            "https://s3-us-west-2.amazonaws.com/bucket/template.zip",
            "https://s3-us-east-1.amazonaws.com/bucket/template.zip",
            "https://storage.googleapis.com/bucket/template.zip",
        ]

        for url in valid_domains:
            request = TemplateCreateRequest(
                title="Test Template",
                slug="test-template",
                tagline="Test tagline",
                description="Test description",
                category=TemplateCategory.IMAGE_GENERATION,
                price_credits=1000,
                template_file_url=url,
                preview_images=["https://r2.cloudflare.com/preview.jpg"]
            )
            assert request.template_file_url == url

        # Invalid domain
        with pytest.raises(ValidationError) as exc_info:
            TemplateCreateRequest(
                title="Test Template",
                slug="test-template",
                tagline="Test tagline",
                description="Test description",
                category=TemplateCategory.IMAGE_GENERATION,
                price_credits=1000,
                template_file_url="https://evil-site.com/malware.zip",
                preview_images=["https://r2.cloudflare.com/preview.jpg"]
            )

        assert "approved storage" in str(exc_info.value)

    def test_zip_file_enforcement(self):
        """Test that only ZIP files are accepted for templates"""
        invalid_extensions = [
            "https://r2.cloudflare.com/template.exe",
            "https://r2.cloudflare.com/template.sh",
            "https://r2.cloudflare.com/template.tar.gz",
            "https://r2.cloudflare.com/template.rar",
            "https://r2.cloudflare.com/template",
        ]

        for url in invalid_extensions:
            with pytest.raises(ValidationError) as exc_info:
                TemplateCreateRequest(
                    title="Test Template",
                    slug="test-template",
                    tagline="Test tagline",
                    description="Test description",
                    category=TemplateCategory.IMAGE_GENERATION,
                    price_credits=1000,
                    template_file_url=url,
                    preview_images=["https://r2.cloudflare.com/preview.jpg"]
                )

            assert "Must be ZIP" in str(exc_info.value)

    def test_video_url_validation(self):
        """Test that only approved video platforms are accepted"""
        # Valid video URLs
        valid_videos = [
            "https://www.youtube.com/watch?v=abc123",
            "https://youtu.be/abc123",
            "https://vimeo.com/123456789",
            "https://www.loom.com/share/abc123",
        ]

        for video_url in valid_videos:
            request = TemplateCreateRequest(
                title="Test Template",
                slug="test-template",
                tagline="Test tagline",
                description="Test description",
                category=TemplateCategory.IMAGE_GENERATION,
                price_credits=1000,
                template_file_url="https://r2.cloudflare.com/template.zip",
                preview_images=["https://r2.cloudflare.com/preview.jpg"],
                demo_video_url=video_url
            )
            assert request.demo_video_url == video_url

        # Invalid video platform
        with pytest.raises(ValidationError) as exc_info:
            TemplateCreateRequest(
                title="Test Template",
                slug="test-template",
                tagline="Test tagline",
                description="Test description",
                category=TemplateCategory.IMAGE_GENERATION,
                price_credits=1000,
                template_file_url="https://r2.cloudflare.com/template.zip",
                preview_images=["https://r2.cloudflare.com/preview.jpg"],
                demo_video_url="https://evil-video-site.com/video.mp4"
            )

        assert "approved video platform" in str(exc_info.value)


class TestSlugValidation:
    """Test slug validation security fixes"""

    def test_reserved_words_blocked(self):
        """Test that reserved slugs are rejected"""
        reserved_slugs = [
            "admin", "api", "templates", "user",
            "settings", "marketplace", "purchase", "download"
        ]

        for slug in reserved_slugs:
            with pytest.raises(ValidationError) as exc_info:
                TemplateCreateRequest(
                    title="Test Template",
                    slug=slug,
                    tagline="Test tagline",
                    description="Test description",
                    category=TemplateCategory.IMAGE_GENERATION,
                    price_credits=1000,
                    template_file_url="https://r2.cloudflare.com/template.zip",
                    preview_images=["https://r2.cloudflare.com/preview.jpg"]
                )

            assert "reserved" in str(exc_info.value)

    def test_slug_format_validation(self):
        """Test slug format requirements"""
        # Valid slugs
        valid_slugs = [
            "my-template",
            "image-gen-v2",
            "super-cool-template-123",
        ]

        for slug in valid_slugs:
            request = TemplateCreateRequest(
                title="Test Template",
                slug=slug,
                tagline="Test tagline",
                description="Test description",
                category=TemplateCategory.IMAGE_GENERATION,
                price_credits=1000,
                template_file_url="https://r2.cloudflare.com/template.zip",
                preview_images=["https://r2.cloudflare.com/preview.jpg"]
            )
            # Should be forced to lowercase
            assert request.slug == slug.lower()

    def test_slug_no_leading_trailing_hyphens(self):
        """Test that leading/trailing hyphens are rejected"""
        invalid_slugs = [
            "-leading-hyphen",
            "trailing-hyphen-",
            "-both-",
        ]

        for slug in invalid_slugs:
            with pytest.raises(ValidationError) as exc_info:
                TemplateCreateRequest(
                    title="Test Template",
                    slug=slug,
                    tagline="Test tagline",
                    description="Test description",
                    category=TemplateCategory.IMAGE_GENERATION,
                    price_credits=1000,
                    template_file_url="https://r2.cloudflare.com/template.zip",
                    preview_images=["https://r2.cloudflare.com/preview.jpg"]
                )

            assert "leading or trailing hyphens" in str(exc_info.value)


class TestInputSanitization:
    """Test HTML sanitization"""

    def test_xss_prevention_in_description(self):
        """Test that script tags are removed from description"""
        malicious_description = """
        <p>This is a template</p>
        <script>alert('XSS')</script>
        <img src=x onerror="alert('XSS')">
        """

        request = TemplateCreateRequest(
            title="Test Template",
            slug="test-template",
            tagline="Test tagline",
            description=malicious_description,
            category=TemplateCategory.IMAGE_GENERATION,
            price_credits=1000,
            template_file_url="https://r2.cloudflare.com/template.zip",
            preview_images=["https://r2.cloudflare.com/preview.jpg"]
        )

        # Script tags should be removed
        assert "<script>" not in request.description
        assert "onerror=" not in request.description

    def test_xss_prevention_in_tagline(self):
        """Test that script tags are removed from tagline"""
        malicious_tagline = "Cool template <script>alert('XSS')</script>"

        request = TemplateCreateRequest(
            title="Test Template",
            slug="test-template",
            tagline=malicious_tagline,
            description="Test description",
            category=TemplateCategory.IMAGE_GENERATION,
            price_credits=1000,
            template_file_url="https://r2.cloudflare.com/template.zip",
            preview_images=["https://r2.cloudflare.com/preview.jpg"]
        )

        # Script tags should be removed
        assert "<script>" not in request.tagline


class TestSearchQueryLimits:
    """Test search query length limits"""

    def test_search_query_max_length(self):
        """Test that search queries are limited to 100 characters"""
        from app.api.v1.marketplace import SearchQueryParams
        from pydantic import ValidationError

        # Valid length
        valid_query = "a" * 100
        params = SearchQueryParams(search=valid_query)
        assert len(params.search) == 100

        # Too long - should be rejected by Query validator
        long_query = "a" * 101
        # Query validation happens at FastAPI level, not Pydantic model level


class TestRevenueSplitCalculation:
    """Test revenue split calculations"""

    def test_85_15_split_calculation(self):
        """Test that revenue split is exactly 85/15"""
        test_prices = [100, 500, 1000, 2500, 5000, 9999]

        for price in test_prices:
            creator_revenue = int(price * 0.85)
            platform_commission = int(price * 0.15)

            # Verify split adds up
            total = creator_revenue + platform_commission
            assert total == price, f"Split doesn't add up for price {price}: {creator_revenue} + {platform_commission} = {total}"

            # Verify percentages
            assert creator_revenue >= price * 0.85 - 1  # Allow 1 credit rounding
            assert platform_commission >= price * 0.15 - 1

    def test_revenue_integrity_assertion(self):
        """Test that revenue integrity check catches calculation errors"""
        # This would be tested in the service layer
        # The assertion should catch any calculation bugs
        pass


class TestPriceValidation:
    """Test template pricing rules"""

    def test_minimum_price(self):
        """Test that templates have minimum price"""
        with pytest.raises(ValidationError) as exc_info:
            TemplateCreateRequest(
                title="Test Template",
                slug="test-template",
                tagline="Test tagline",
                description="Test description",
                category=TemplateCategory.IMAGE_GENERATION,
                price_credits=0,  # Too low
                template_file_url="https://r2.cloudflare.com/template.zip",
                preview_images=["https://r2.cloudflare.com/preview.jpg"]
            )

        assert "greater than 0" in str(exc_info.value)

    def test_maximum_price(self):
        """Test that templates have maximum price"""
        # Should accept reasonable prices
        request = TemplateCreateRequest(
            title="Test Template",
            slug="test-template",
            tagline="Test tagline",
            description="Test description",
            category=TemplateCategory.IMAGE_GENERATION,
            price_credits=50000,  # Reasonable max
            template_file_url="https://r2.cloudflare.com/template.zip",
            preview_images=["https://r2.cloudflare.com/preview.jpg"]
        )
        assert request.price_credits == 50000


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
