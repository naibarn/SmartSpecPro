"""
SmartSpecWeb-compatible AES-256-GCM decryption.

Decrypts values encrypted by SmartSpecWeb's crypto.ts (AES-256-GCM).
Format: iv_hex:authTag_hex:ciphertext_hex
Key derivation: SHA-256 of LLM_ENCRYPTION_KEY env var.
"""

import hashlib
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _get_key() -> bytes:
    key_str = os.getenv("LLM_ENCRYPTION_KEY", "")
    if not key_str:
        raise ValueError("LLM_ENCRYPTION_KEY environment variable is not set")
    return hashlib.sha256(key_str.encode()).digest()


def decrypt_smartspecweb(ciphertext: str) -> str:
    """
    Decrypt a value encrypted by SmartSpecWeb's encrypt() function.

    Args:
        ciphertext: Format "iv_hex:authTag_hex:encrypted_hex"

    Returns:
        Decrypted plaintext string
    """
    if not ciphertext:
        return ""

    parts = ciphertext.split(":")
    if len(parts) != 3:
        return ""

    try:
        iv = bytes.fromhex(parts[0])
        auth_tag = bytes.fromhex(parts[1])
        encrypted = bytes.fromhex(parts[2])

        key = _get_key()
        aesgcm = AESGCM(key)
        # AES-GCM expects ciphertext + auth_tag concatenated
        decrypted = aesgcm.decrypt(iv, encrypted + auth_tag, None)
        return decrypted.decode("utf-8")
    except Exception:
        return ""
