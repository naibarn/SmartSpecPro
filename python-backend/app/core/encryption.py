"""
Encryption Utilities for Sensitive Data

Provides encryption/decryption for API keys and other sensitive configuration.
Uses Fernet (symmetric encryption) from the cryptography library.
"""

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64
import os
from typing import Optional

from app.core.config import settings


class EncryptionService:
    """Service for encrypting and decrypting sensitive data"""

    def __init__(self):
        """Initialize encryption service with master key"""
        self._fernet = self._init_fernet()

    def _init_fernet(self) -> Fernet:
        """
        Initialize Fernet cipher with master key.

        Uses ENCRYPTION_MASTER_KEY from environment.
        If not set, generates a key (not recommended for production).
        """
        master_key = os.getenv("ENCRYPTION_MASTER_KEY", "")

        if not master_key:
            # Generate a key for development (NOT secure for production)
            master_key = "smartspec-dev-key-change-in-production"
            print("⚠️  WARNING: Using default encryption key. Set ENCRYPTION_MASTER_KEY in production!")

        # Derive a proper 32-byte key using PBKDF2HMAC
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"smartspec-salt",  # Fixed salt (in production, use a random salt per-installation)
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(master_key.encode()))

        return Fernet(key)

    def encrypt(self, plaintext: str) -> str:
        """
        Encrypt plaintext string.

        Args:
            plaintext: The string to encrypt (e.g., API key)

        Returns:
            Base64-encoded encrypted string
        """
        if not plaintext:
            return ""

        encrypted_bytes = self._fernet.encrypt(plaintext.encode())
        return encrypted_bytes.decode()

    def decrypt(self, ciphertext: str) -> str:
        """
        Decrypt ciphertext string.

        Args:
            ciphertext: Base64-encoded encrypted string

        Returns:
            Decrypted plaintext string

        Raises:
            cryptography.fernet.InvalidToken: If decryption fails
        """
        if not ciphertext:
            return ""

        try:
            decrypted_bytes = self._fernet.decrypt(ciphertext.encode())
            return decrypted_bytes.decode()
        except Exception as e:
            raise ValueError(f"Failed to decrypt: {str(e)}")

    def encrypt_if_not_empty(self, plaintext: Optional[str]) -> Optional[str]:
        """
        Encrypt plaintext if not empty, otherwise return None.

        Args:
            plaintext: The string to encrypt or None

        Returns:
            Encrypted string or None
        """
        if plaintext:
            return self.encrypt(plaintext)
        return None

    def decrypt_if_not_empty(self, ciphertext: Optional[str]) -> Optional[str]:
        """
        Decrypt ciphertext if not empty, otherwise return None.

        Args:
            ciphertext: Encrypted string or None

        Returns:
            Decrypted string or None
        """
        if ciphertext:
            return self.decrypt(ciphertext)
        return None


# Global encryption service instance
encryption_service = EncryptionService()
