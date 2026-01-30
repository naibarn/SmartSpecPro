"""
Secure Validators for File URLs and Input
Fixes High Priority Security Issue #6
"""

from urllib.parse import urlparse
from typing import List, Optional
import re
import structlog

logger = structlog.get_logger(__name__)


class SecureURLValidator:
    """
    Secure URL validation with exact domain matching

    SECURITY FIXES:
    - Uses exact domain matching (not 'in' check)
    - Validates HTTPS protocol
    - Checks file extensions
    - Prevents SSRF attacks
    - Validates video platforms
    """

    # Approved storage domains (exact match or subdomain)
    APPROVED_STORAGE_DOMAINS = {
        'r2.cloudflare.com',
        's3.amazonaws.com',
        's3-us-west-2.amazonaws.com',
        's3-us-east-1.amazonaws.com',
        's3.us-east-1.amazonaws.com',
        's3-ap-southeast-1.amazonaws.com',
        'storage.googleapis.com',
        'storage.cloud.google.com',
    }

    # Approved video platforms
    APPROVED_VIDEO_DOMAINS = {
        'youtube.com',
        'www.youtube.com',
        'youtu.be',
        'vimeo.com',
        'www.vimeo.com',
        'loom.com',
        'www.loom.com',
    }

    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB

    @classmethod
    def validate_storage_url(
        cls,
        url: str,
        allowed_extensions: List[str],
        require_zip: bool = False
    ) -> str:
        """
        Validate storage URL for file uploads

        Args:
            url: URL to validate
            allowed_extensions: List of allowed file extensions (e.g., ['.zip', '.tar'])
            require_zip: If True, only .zip files are allowed

        Returns:
            Validated URL

        Raises:
            ValueError: If URL is invalid or insecure
        """
        # Parse URL
        try:
            parsed = urlparse(url)
        except Exception as e:
            raise ValueError(f"Invalid URL format: {str(e)}")

        # Check protocol
        if parsed.scheme != 'https':
            raise ValueError("File URL must use HTTPS protocol for security")

        # Get hostname
        hostname = parsed.hostname
        if not hostname:
            raise ValueError("Invalid hostname in URL")

        # Exact domain matching or subdomain check
        domain_approved = False
        for approved_domain in cls.APPROVED_STORAGE_DOMAINS:
            if hostname == approved_domain:
                # Exact match
                domain_approved = True
                break
            elif hostname.endswith('.' + approved_domain):
                # Subdomain match (e.g., bucket.s3.amazonaws.com)
                domain_approved = True
                break

        if not domain_approved:
            logger.warning(
                "unapproved_storage_domain",
                hostname=hostname,
                url=url[:100]
            )
            raise ValueError(
                f"Storage domain '{hostname}' is not approved. "
                f"Approved domains: {', '.join(sorted(cls.APPROVED_STORAGE_DOMAINS))}"
            )

        # Check file extension
        path = parsed.path.lower()

        if require_zip:
            if not path.endswith('.zip'):
                raise ValueError("File must be a ZIP archive (.zip)")
        else:
            if not any(path.endswith(ext.lower()) for ext in allowed_extensions):
                raise ValueError(
                    f"File extension not allowed. "
                    f"Allowed extensions: {', '.join(allowed_extensions)}"
                )

        # Check for suspicious patterns
        if '..' in parsed.path:
            raise ValueError("Path traversal detected in URL")

        if parsed.path.startswith('//'):
            raise ValueError("Invalid path in URL")

        logger.debug(
            "storage_url_validated",
            hostname=hostname,
            path=parsed.path[:100]
        )

        return url

    @classmethod
    def validate_video_url(cls, url: str) -> str:
        """
        Validate video URL from approved platforms

        Args:
            url: Video URL to validate

        Returns:
            Validated URL

        Raises:
            ValueError: If URL is not from approved video platform
        """
        # Parse URL
        try:
            parsed = urlparse(url)
        except Exception as e:
            raise ValueError(f"Invalid video URL format: {str(e)}")

        # Check protocol
        if parsed.scheme not in ['https', 'http']:
            raise ValueError("Video URL must use HTTP or HTTPS protocol")

        # Get hostname
        hostname = parsed.hostname
        if not hostname:
            raise ValueError("Invalid hostname in video URL")

        # Check against approved video platforms
        domain_approved = hostname in cls.APPROVED_VIDEO_DOMAINS

        if not domain_approved:
            logger.warning(
                "unapproved_video_platform",
                hostname=hostname,
                url=url[:100]
            )
            raise ValueError(
                f"Video platform '{hostname}' is not approved. "
                f"Approved platforms: YouTube, Vimeo, Loom"
            )

        logger.debug(
            "video_url_validated",
            hostname=hostname
        )

        return url

    @classmethod
    def validate_image_url(cls, url: str) -> str:
        """
        Validate image URL

        Args:
            url: Image URL to validate

        Returns:
            Validated URL

        Raises:
            ValueError: If URL is invalid
        """
        allowed_extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
        return cls.validate_storage_url(url, allowed_extensions, require_zip=False)


class PathValidator:
    """Validate file paths for path traversal attacks"""

    @staticmethod
    def validate_safe_path(path: str) -> str:
        """
        Validate path is safe (no traversal)

        Args:
            path: Path to validate

        Returns:
            Validated path

        Raises:
            ValueError: If path contains traversal
        """
        # URL-decode the path first to catch encoded traversal attempts
        from urllib.parse import unquote
        decoded = unquote(unquote(path))  # double-decode to handle %252e etc.

        # Check for path traversal in both original and decoded forms
        for p in (path, decoded):
            if '..' in p:
                raise ValueError("Path traversal detected")

        if path.startswith('/') or decoded.startswith('/'):
            raise ValueError("Absolute paths not allowed")

        # Check for suspicious patterns in decoded path
        suspicious_patterns = [
            '../',
            '..\\',
            '%2e%2e',
            '..%2f',
            '..%5c',
            '%252e',  # double-encoded
        ]

        path_lower = decoded.lower()
        for pattern in suspicious_patterns:
            if pattern in path_lower:
                raise ValueError(f"Suspicious pattern detected: {pattern}")

        return path


class SlugValidator:
    """Validate slugs for URL safety"""

    # Reserved slugs that could cause routing conflicts
    RESERVED_SLUGS = {
        'admin', 'api', 'templates', 'template',
        'user', 'users', 'settings', 'marketplace',
        'purchase', 'download', 'upload', 'new',
        'edit', 'delete', 'create', 'update',
        'login', 'logout', 'register', 'auth',
        'health', 'metrics', 'monitoring'
    }

    @classmethod
    def validate_slug(cls, slug: str) -> str:
        """
        Validate slug for URL safety

        Args:
            slug: Slug to validate

        Returns:
            Validated slug (lowercase)

        Raises:
            ValueError: If slug is invalid
        """
        if not slug:
            raise ValueError("Slug cannot be empty")

        # Force lowercase
        slug = slug.lower()

        # Check length
        if len(slug) < 3:
            raise ValueError("Slug must be at least 3 characters long")

        if len(slug) > 100:
            raise ValueError("Slug must be at most 100 characters long")

        # Check format (alphanumeric and hyphens only)
        if not re.match(r'^[a-z0-9]+(?:-[a-z0-9]+)*$', slug):
            raise ValueError(
                "Slug must contain only lowercase letters, numbers, and hyphens. "
                "Hyphens cannot be at the beginning or end, and cannot be consecutive."
            )

        # Check for leading/trailing hyphens
        if slug.startswith('-') or slug.endswith('-'):
            raise ValueError("Slug cannot start or end with a hyphen")

        # Check for consecutive hyphens
        if '--' in slug:
            raise ValueError("Slug cannot contain consecutive hyphens")

        # Check reserved words
        if slug in cls.RESERVED_SLUGS:
            raise ValueError(
                f"Slug '{slug}' is reserved and cannot be used. "
                f"Please choose a different slug."
            )

        return slug
