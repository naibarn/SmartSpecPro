"""
SmartSpecWeb-compatible AES-256-GCM encryption/decryption.

Encrypts/decrypts values compatible with SmartSpecWeb's crypto.ts (AES-256-GCM).
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
        raise ValueError(f"Malformed ciphertext: expected 3 parts, got {len(parts)}")

    try:
        iv = bytes.fromhex(parts[0])
        auth_tag = bytes.fromhex(parts[1])
        encrypted = bytes.fromhex(parts[2])

        key = _get_key()
        aesgcm = AESGCM(key)
        # AES-GCM expects ciphertext + auth_tag concatenated
        decrypted = aesgcm.decrypt(iv, encrypted + auth_tag, None)
        return decrypted.decode("utf-8")
    except Exception as e:
        raise ValueError(f"Decryption failed: {e}") from e


def encrypt_smartspecweb(plaintext: str) -> str:
    """
    Encrypt a value using the same AES-256-GCM format as SmartSpecWeb's encrypt().

    Returns format "iv_hex:authTag_hex:ciphertext_hex" compatible with Node.js decrypt().
    """
    if not plaintext:
        return ""

    key = _get_key()
    aesgcm = AESGCM(key)
    iv = os.urandom(12)  # 96-bit IV, same as Node.js crypto
    ct_with_tag = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)

    # AESGCM appends 16-byte auth tag to ciphertext
    ciphertext = ct_with_tag[:-16]
    auth_tag = ct_with_tag[-16:]

    return f"{iv.hex()}:{auth_tag.hex()}:{ciphertext.hex()}"


def is_encrypted(value: str) -> bool:
    """Check if a value appears to be in encrypted format (iv:tag:ciphertext).

    Validates structural properties: 3 colon-separated hex segments with
    IV = 24 hex chars (12 bytes) and auth tag = 32 hex chars (16 bytes).
    """
    if not value:
        return False
    parts = value.split(":")
    if len(parts) != 3:
        return False
    try:
        iv = bytes.fromhex(parts[0])
        auth_tag = bytes.fromhex(parts[1])
        bytes.fromhex(parts[2])  # ciphertext, any length > 0
        # AES-256-GCM: IV must be 12 bytes, auth tag must be 16 bytes
        return len(iv) == 12 and len(auth_tag) == 16 and len(parts[2]) > 0
    except ValueError:
        return False
