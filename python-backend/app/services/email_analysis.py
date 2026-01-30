"""
Email analysis and normalization for duplicate account detection.
"""

import hashlib
import re
from dataclasses import dataclass

DISPOSABLE_DOMAINS = frozenset([
    "mailinator.com", "guerrillamail.com", "tempmail.com", "throwaway.email",
    "yopmail.com", "sharklasers.com", "guerrillamailblock.com", "grr.la",
    "dispostable.com", "trashmail.com", "fakeinbox.com", "mailnesia.com",
    "maildrop.cc", "discard.email", "mailsac.com", "temp-mail.org",
    "getnada.com", "mohmal.com", "burnermail.io", "tempail.com",
    "10minutemail.com", "minutemail.com", "emailondeck.com",
    "crazymailing.com", "harakirimail.com", "tmail.ws",
    "mailcatch.com", "tempr.email", "bupmail.com",
    "tempinbox.com", "mytemp.email", "tmpmail.net",
])

GMAIL_DOMAINS = frozenset(["gmail.com", "googlemail.com"])


@dataclass
class EmailAnalysis:
    original: str
    normalized: str
    domain: str
    is_disposable: bool
    is_plus_alias: bool
    is_dot_variant: bool


def normalize_email(email: str) -> str:
    email = email.strip().lower()
    local, domain = email.rsplit("@", 1)

    if domain in GMAIL_DOMAINS:
        domain = "gmail.com"
        local = local.split("+")[0]
        local = local.replace(".", "")

    return f"{local}@{domain}"


def analyze_email(email: str) -> EmailAnalysis:
    original = email.strip().lower()
    local, domain = original.rsplit("@", 1)
    normalized = normalize_email(original)

    is_plus_alias = "+" in local
    is_dot_variant = (
        domain in GMAIL_DOMAINS and "." in local.split("+")[0]
    )
    is_disposable = domain in DISPOSABLE_DOMAINS

    return EmailAnalysis(
        original=original,
        normalized=normalized,
        domain=domain,
        is_disposable=is_disposable,
        is_plus_alias=is_plus_alias,
        is_dot_variant=is_dot_variant,
    )
