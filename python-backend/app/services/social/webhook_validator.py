"""Meta webhook signature validation helpers."""

from __future__ import annotations

import hashlib
import hmac


def validate_meta_webhook_signature(body: bytes, signature_header: str, app_secret: str) -> bool:
    """Validate X-Hub-Signature-256 using constant-time comparison."""
    if not body or not signature_header or not app_secret:
        return False

    signature = signature_header.strip()
    if signature.startswith("sha256="):
        signature = signature[len("sha256=") :]

    expected = hmac.new(app_secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
