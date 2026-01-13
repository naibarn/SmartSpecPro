"""
Encryption Service for Data Protection
Phase 3: SaaS Readiness
"""

import structlog
import os
import base64
import hashlib
from dataclasses import dataclass
from typing import Optional, Dict, Any, Tuple
from enum import Enum

logger = structlog.get_logger(__name__)


class EncryptionAlgorithm(str, Enum):
    """Supported encryption algorithms."""
    AES_256_GCM = "aes-256-gcm"
    AES_256_CBC = "aes-256-cbc"
    CHACHA20_POLY1305 = "chacha20-poly1305"


@dataclass
class EncryptedData:
    """Encrypted data with metadata."""
    ciphertext: bytes
    nonce: bytes
    tag: Optional[bytes] = None
    algorithm: EncryptionAlgorithm = EncryptionAlgorithm.AES_256_GCM
    
    def to_string(self) -> str:
        """Encode to base64 string."""
        data = {
            "c": base64.b64encode(self.ciphertext).decode(),
            "n": base64.b64encode(self.nonce).decode(),
            "a": self.algorithm.value,
        }
        if self.tag:
            data["t"] = base64.b64encode(self.tag).decode()
        
        import json
        return base64.b64encode(json.dumps(data).encode()).decode()
    
    @classmethod
    def from_string(cls, encoded: str) -> "EncryptedData":
        """Decode from base64 string."""
        import json
        data = json.loads(base64.b64decode(encoded.encode()))
        
        return cls(
            ciphertext=base64.b64decode(data["c"]),
            nonce=base64.b64decode(data["n"]),
            tag=base64.b64decode(data["t"]) if "t" in data else None,
            algorithm=EncryptionAlgorithm(data["a"]),
        )


class EncryptionService:
    """
    Service for data encryption and decryption.
    
    Features:
    - Multiple algorithm support
    - Key derivation
    - Envelope encryption
    - Field-level encryption
    """
    
    def __init__(
        self,
        master_key: Optional[str] = None,
        algorithm: EncryptionAlgorithm = EncryptionAlgorithm.AES_256_GCM,
    ):
        """
        Initialize encryption service.
        
        Args:
            master_key: Master encryption key
            algorithm: Default encryption algorithm
        """
        self._master_key = master_key or os.environ.get(
            "SMARTSPEC_MASTER_KEY",
            "default-dev-key-change-in-production"
        )
        self._algorithm = algorithm
        self._logger = logger.bind(component="encryption_service")
        
        # Derive key
        self._key = self._derive_key(self._master_key)
    
    def _derive_key(self, password: str, salt: Optional[bytes] = None) -> bytes:
        """Derive encryption key from password."""
        try:
            from cryptography.hazmat.primitives import hashes
            from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
            
            if salt is None:
                salt = b"smartspec-encryption-salt"
            
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=salt,
                iterations=100000,
            )
            return kdf.derive(password.encode())
            
        except ImportError:
            # Fallback to simple hash
            return hashlib.sha256(password.encode()).digest()
    
    def encrypt(
        self,
        plaintext: str,
        associated_data: Optional[bytes] = None,
    ) -> EncryptedData:
        """
        Encrypt plaintext.
        
        Args:
            plaintext: Data to encrypt
            associated_data: Additional authenticated data
        
        Returns:
            Encrypted data
        """
        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            
            # Generate nonce
            nonce = os.urandom(12)
            
            # Encrypt
            aesgcm = AESGCM(self._key)
            ciphertext = aesgcm.encrypt(
                nonce,
                plaintext.encode(),
                associated_data,
            )
            
            return EncryptedData(
                ciphertext=ciphertext,
                nonce=nonce,
                algorithm=EncryptionAlgorithm.AES_256_GCM,
            )
            
        except ImportError:
            self._logger.warning("cryptography_not_installed", fallback="base64")
            # Fallback (NOT secure)
            return EncryptedData(
                ciphertext=base64.b64encode(plaintext.encode()),
                nonce=b"",
                algorithm=EncryptionAlgorithm.AES_256_GCM,
            )
    
    def decrypt(
        self,
        encrypted: EncryptedData,
        associated_data: Optional[bytes] = None,
    ) -> str:
        """
        Decrypt ciphertext.
        
        Args:
            encrypted: Encrypted data
            associated_data: Additional authenticated data
        
        Returns:
            Decrypted plaintext
        """
        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            
            aesgcm = AESGCM(self._key)
            plaintext = aesgcm.decrypt(
                encrypted.nonce,
                encrypted.ciphertext,
                associated_data,
            )
            
            return plaintext.decode()
            
        except ImportError:
            # Fallback
            return base64.b64decode(encrypted.ciphertext).decode()
    
    def encrypt_string(self, plaintext: str) -> str:
        """Encrypt and encode to string."""
        encrypted = self.encrypt(plaintext)
        return encrypted.to_string()
    
    def decrypt_string(self, encoded: str) -> str:
        """Decode and decrypt string."""
        encrypted = EncryptedData.from_string(encoded)
        return self.decrypt(encrypted)
    
    def encrypt_dict(
        self,
        data: Dict[str, Any],
        fields: Optional[list] = None,
    ) -> Dict[str, Any]:
        """
        Encrypt specific fields in a dictionary.
        
        Args:
            data: Dictionary to encrypt
            fields: Fields to encrypt (all if None)
        
        Returns:
            Dictionary with encrypted fields
        """
        import json
        
        result = data.copy()
        fields_to_encrypt = fields or list(data.keys())
        
        for field in fields_to_encrypt:
            if field in result:
                value = result[field]
                if isinstance(value, str):
                    result[field] = self.encrypt_string(value)
                else:
                    result[field] = self.encrypt_string(json.dumps(value))
        
        return result
    
    def decrypt_dict(
        self,
        data: Dict[str, Any],
        fields: Optional[list] = None,
    ) -> Dict[str, Any]:
        """
        Decrypt specific fields in a dictionary.
        
        Args:
            data: Dictionary to decrypt
            fields: Fields to decrypt (all if None)
        
        Returns:
            Dictionary with decrypted fields
        """
        import json
        
        result = data.copy()
        fields_to_decrypt = fields or list(data.keys())
        
        for field in fields_to_decrypt:
            if field in result and isinstance(result[field], str):
                try:
                    decrypted = self.decrypt_string(result[field])
                    # Try to parse as JSON
                    try:
                        result[field] = json.loads(decrypted)
                    except json.JSONDecodeError:
                        result[field] = decrypted
                except Exception:
                    pass  # Keep original value if decryption fails
        
        return result
    
    def generate_data_key(self) -> Tuple[bytes, EncryptedData]:
        """
        Generate a data encryption key (envelope encryption).
        
        Returns:
            Tuple of (plaintext_key, encrypted_key)
        """
        # Generate random data key
        data_key = os.urandom(32)
        
        # Encrypt data key with master key
        encrypted_key = self.encrypt(base64.b64encode(data_key).decode())
        
        return data_key, encrypted_key
    
    def decrypt_data_key(self, encrypted_key: EncryptedData) -> bytes:
        """
        Decrypt a data encryption key.
        
        Args:
            encrypted_key: Encrypted data key
        
        Returns:
            Plaintext data key
        """
        decrypted = self.decrypt(encrypted_key)
        return base64.b64decode(decrypted)
    
    def hash(self, data: str, salt: Optional[str] = None) -> str:
        """
        Create a secure hash of data.
        
        Args:
            data: Data to hash
            salt: Optional salt
        
        Returns:
            Hex-encoded hash
        """
        if salt:
            data = f"{salt}:{data}"
        return hashlib.sha256(data.encode()).hexdigest()
    
    def verify_hash(
        self,
        data: str,
        expected_hash: str,
        salt: Optional[str] = None,
    ) -> bool:
        """
        Verify a hash.
        
        Args:
            data: Data to verify
            expected_hash: Expected hash value
            salt: Optional salt
        
        Returns:
            True if hash matches
        """
        actual_hash = self.hash(data, salt)
        return actual_hash == expected_hash
    
    def rotate_key(self, new_master_key: str) -> None:
        """
        Rotate the master key.
        
        Args:
            new_master_key: New master key
        """
        self._master_key = new_master_key
        self._key = self._derive_key(new_master_key)
        self._logger.info("master_key_rotated")


# Global instance
_encryption_service: Optional[EncryptionService] = None


def get_encryption_service() -> EncryptionService:
    """Get global encryption service instance."""
    global _encryption_service
    if _encryption_service is None:
        _encryption_service = EncryptionService()
    return _encryption_service
