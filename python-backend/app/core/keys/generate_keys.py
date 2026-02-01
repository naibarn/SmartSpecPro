#!/usr/bin/env python3
"""
Generate RS256 JWT key pair for SmartSpec Pro.

Usage:
    python -m app.core.keys.generate_keys

Keys will be written to the same directory as this script.
NEVER commit the generated .pem files to version control.
"""

import os
from pathlib import Path

KEYS_DIR = Path(__file__).parent


def generate_keys():
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization

    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    # Write private key
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    private_path = KEYS_DIR / "jwt_private_key.pem"
    private_path.write_bytes(private_pem)
    os.chmod(private_path, 0o600)

    # Write public key
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    public_path = KEYS_DIR / "jwt_public_key.pem"
    public_path.write_bytes(public_pem)
    os.chmod(public_path, 0o644)

    print(f"Generated RS256 key pair in {KEYS_DIR}")
    print(f"  Private key: {private_path} (mode 0600)")
    print(f"  Public  key: {public_path}  (mode 0644)")
    print()
    print("WARNING: Never commit .pem files to version control.")


if __name__ == "__main__":
    generate_keys()
