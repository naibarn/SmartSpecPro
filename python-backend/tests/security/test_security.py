"""
Integration Tests for Security Module
Phase 3: SaaS Readiness
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import sys
sys.path.insert(0, '/home/ubuntu/SmartSpecPro/python-backend')

from app.security.secrets_manager import (
    SecretsManager,
    Secret,
    SecretType,
    SecretScope,
)
from app.security.encryption import (
    EncryptionService,
    EncryptedData,
    EncryptionAlgorithm,
)
from app.security.audit_logger import (
    AuditLogger,
    AuditEvent,
    AuditAction,
    AuditSeverity,
)


class TestSecretsManager:
    """Tests for SecretsManager."""
    
    @pytest.fixture
    def manager(self):
        """Create secrets manager instance."""
        return SecretsManager(encryption_key="test-key-for-testing")
    
    @pytest.mark.asyncio
    async def test_create_secret(self, manager):
        """Test creating a secret."""
        secret = await manager.create_secret(
            name="api-key",
            value="sk-test-12345",
            secret_type=SecretType.API_KEY,
            tenant_id="tenant-123",
        )
        
        assert secret.name == "api-key"
        assert secret.secret_type == SecretType.API_KEY
        assert secret.encrypted_value != "sk-test-12345"  # Should be encrypted
    
    @pytest.mark.asyncio
    async def test_get_secret(self, manager):
        """Test getting a secret."""
        created = await manager.create_secret(
            name="get-test",
            value="secret-value",
            tenant_id="tenant-get",
        )
        
        fetched = await manager.get_secret(secret_id=created.secret_id)
        
        assert fetched is not None
        assert fetched.name == "get-test"
    
    @pytest.mark.asyncio
    async def test_get_secret_value(self, manager):
        """Test getting decrypted secret value."""
        original_value = "my-super-secret-value"
        
        await manager.create_secret(
            name="decrypt-test",
            value=original_value,
            tenant_id="tenant-decrypt",
        )
        
        decrypted = await manager.get_secret_value(
            name="decrypt-test",
            tenant_id="tenant-decrypt",
        )
        
        assert decrypted == original_value
    
    @pytest.mark.asyncio
    async def test_update_secret(self, manager):
        """Test updating a secret."""
        secret = await manager.create_secret(
            name="update-test",
            value="old-value",
            tenant_id="tenant-update",
        )
        
        updated = await manager.update_secret(
            secret.secret_id,
            description="Updated description",
        )
        
        assert updated.description == "Updated description"
    
    @pytest.mark.asyncio
    async def test_rotate_secret(self, manager):
        """Test rotating a secret."""
        secret = await manager.create_secret(
            name="rotate-test",
            value="old-value",
            tenant_id="tenant-rotate",
            rotation_enabled=True,
        )
        
        old_hash = secret.value_hash
        
        rotated = await manager.rotate_secret(
            secret.secret_id,
            new_value="new-value",
        )
        
        assert rotated.value_hash != old_hash
        assert rotated.last_rotated_at is not None
    
    @pytest.mark.asyncio
    async def test_delete_secret(self, manager):
        """Test deleting a secret."""
        secret = await manager.create_secret(
            name="delete-test",
            value="to-delete",
            tenant_id="tenant-delete",
        )
        
        result = await manager.delete_secret(secret.secret_id)
        assert result is True
        
        fetched = await manager.get_secret(secret_id=secret.secret_id)
        assert fetched is None
    
    @pytest.mark.asyncio
    async def test_list_secrets(self, manager):
        """Test listing secrets."""
        for i in range(3):
            await manager.create_secret(
                name=f"list-test-{i}",
                value=f"value-{i}",
                tenant_id="tenant-list",
            )
        
        secrets = await manager.list_secrets(tenant_id="tenant-list")
        
        assert len(secrets) >= 3
    
    @pytest.mark.asyncio
    async def test_secret_expiration(self, manager):
        """Test secret expiration."""
        # Create expired secret
        secret = await manager.create_secret(
            name="expired-test",
            value="expired",
            tenant_id="tenant-expired",
            expires_at=datetime.utcnow() - timedelta(hours=1),
        )
        
        assert secret.is_expired() is True
        
        # Should not be returned
        fetched = await manager.get_secret(secret_id=secret.secret_id)
        assert fetched is None
    
    @pytest.mark.asyncio
    async def test_check_rotations(self, manager):
        """Test checking secrets needing rotation."""
        # Create secret that needs rotation
        secret = await manager.create_secret(
            name="rotation-check",
            value="needs-rotation",
            tenant_id="tenant-rotation",
            rotation_enabled=True,
            rotation_interval_days=0,  # Needs immediate rotation
        )
        
        # Manually set last_rotated_at to past
        secret.last_rotated_at = datetime.utcnow() - timedelta(days=1)
        
        needs_rotation = await manager.check_rotations()
        
        assert len(needs_rotation) >= 1


class TestEncryptionService:
    """Tests for EncryptionService."""
    
    @pytest.fixture
    def service(self):
        """Create encryption service instance."""
        return EncryptionService(master_key="test-master-key")
    
    def test_encrypt_decrypt(self, service):
        """Test basic encryption and decryption."""
        plaintext = "Hello, World!"
        
        encrypted = service.encrypt(plaintext)
        decrypted = service.decrypt(encrypted)
        
        assert decrypted == plaintext
        assert encrypted.ciphertext != plaintext.encode()
    
    def test_encrypt_string(self, service):
        """Test string encryption."""
        plaintext = "Secret message"
        
        encoded = service.encrypt_string(plaintext)
        decrypted = service.decrypt_string(encoded)
        
        assert decrypted == plaintext
        assert encoded != plaintext
    
    def test_encrypt_dict(self, service):
        """Test dictionary encryption."""
        data = {
            "username": "admin",
            "password": "secret123",
            "email": "admin@test.com",
        }
        
        encrypted = service.encrypt_dict(data, fields=["password"])
        
        assert encrypted["username"] == "admin"  # Not encrypted
        assert encrypted["password"] != "secret123"  # Encrypted
    
    def test_decrypt_dict(self, service):
        """Test dictionary decryption."""
        data = {
            "username": "admin",
            "password": "secret123",
        }
        
        encrypted = service.encrypt_dict(data, fields=["password"])
        decrypted = service.decrypt_dict(encrypted, fields=["password"])
        
        assert decrypted["password"] == "secret123"
    
    def test_hash(self, service):
        """Test hashing."""
        data = "password123"
        
        hash1 = service.hash(data)
        hash2 = service.hash(data)
        
        assert hash1 == hash2
        assert hash1 != data
    
    def test_verify_hash(self, service):
        """Test hash verification."""
        data = "password123"
        hash_value = service.hash(data)
        
        assert service.verify_hash(data, hash_value) is True
        assert service.verify_hash("wrong", hash_value) is False
    
    def test_generate_data_key(self, service):
        """Test data key generation."""
        plaintext_key, encrypted_key = service.generate_data_key()
        
        assert len(plaintext_key) == 32
        assert encrypted_key.ciphertext is not None
    
    def test_decrypt_data_key(self, service):
        """Test data key decryption."""
        plaintext_key, encrypted_key = service.generate_data_key()
        
        decrypted_key = service.decrypt_data_key(encrypted_key)
        
        assert decrypted_key == plaintext_key


class TestAuditLogger:
    """Tests for AuditLogger."""
    
    @pytest.fixture
    def logger(self):
        """Create audit logger instance."""
        return AuditLogger()
    
    @pytest.mark.asyncio
    async def test_log_event(self, logger):
        """Test logging an event."""
        event = await logger.log(
            action=AuditAction.LOGIN,
            actor_id="user-123",
            actor_email="user@test.com",
            description="User logged in",
        )
        
        assert event.action == AuditAction.LOGIN
        assert event.actor_id == "user-123"
        assert event.success is True
    
    @pytest.mark.asyncio
    async def test_log_failed_event(self, logger):
        """Test logging a failed event."""
        event = await logger.log(
            action=AuditAction.LOGIN_FAILED,
            actor_email="attacker@test.com",
            actor_ip="192.168.1.100",
            success=False,
            error_message="Invalid credentials",
        )
        
        assert event.success is False
        assert event.severity == AuditSeverity.WARNING
    
    @pytest.mark.asyncio
    async def test_query_events(self, logger):
        """Test querying events."""
        # Log multiple events
        for i in range(5):
            await logger.log(
                action=AuditAction.DATA_READ,
                actor_id="user-query",
                tenant_id="tenant-query",
            )
        
        events = await logger.query(
            actor_id="user-query",
            tenant_id="tenant-query",
        )
        
        assert len(events) >= 5
    
    @pytest.mark.asyncio
    async def test_query_by_action(self, logger):
        """Test querying by action type."""
        await logger.log(action=AuditAction.SECRET_CREATE, actor_id="user-1")
        await logger.log(action=AuditAction.SECRET_READ, actor_id="user-1")
        await logger.log(action=AuditAction.SECRET_CREATE, actor_id="user-2")
        
        events = await logger.query(action=AuditAction.SECRET_CREATE)
        
        assert all(e.action == AuditAction.SECRET_CREATE for e in events)
    
    @pytest.mark.asyncio
    async def test_get_actor_activity(self, logger):
        """Test getting actor activity."""
        for i in range(3):
            await logger.log(
                action=AuditAction.DATA_READ,
                actor_id="active-user",
            )
        
        activity = await logger.get_actor_activity("active-user")
        
        assert len(activity) >= 3
    
    @pytest.mark.asyncio
    async def test_get_security_alerts(self, logger):
        """Test getting security alerts."""
        await logger.log(
            action=AuditAction.LOGIN_FAILED,
            actor_id="suspicious",
            severity=AuditSeverity.WARNING,
        )
        
        await logger.log(
            action=AuditAction.SECURITY_ALERT,
            actor_id="system",
            severity=AuditSeverity.CRITICAL,
        )
        
        alerts = await logger.get_security_alerts()
        
        assert len(alerts) >= 1
    
    @pytest.mark.asyncio
    async def test_get_failed_logins(self, logger):
        """Test getting failed logins."""
        for i in range(3):
            await logger.log(
                action=AuditAction.LOGIN_FAILED,
                actor_email=f"attacker{i}@test.com",
                actor_ip="10.0.0.1",
            )
        
        failed = await logger.get_failed_logins(hours=1)
        
        assert len(failed) >= 3
    
    def test_get_stats(self, logger):
        """Test getting statistics."""
        stats = logger.get_stats()
        
        assert "total_events" in stats
        assert "by_action" in stats
        assert "by_severity" in stats


class TestAuditEvent:
    """Tests for AuditEvent model."""
    
    def test_event_creation(self):
        """Test creating an event."""
        event = AuditEvent(
            action=AuditAction.DATA_CREATE,
            actor_id="user-123",
            target_type="project",
            target_id="proj-456",
        )
        
        assert event.action == AuditAction.DATA_CREATE
        assert event.actor_id == "user-123"
    
    def test_event_to_dict(self):
        """Test event serialization."""
        event = AuditEvent(
            action=AuditAction.LOGIN,
            actor_id="user-123",
        )
        
        data = event.to_dict()
        
        assert data["action"] == "login"
        assert data["actor_id"] == "user-123"
        assert "event_id" in data
    
    def test_event_to_json(self):
        """Test event JSON serialization."""
        event = AuditEvent(
            action=AuditAction.LOGIN,
            actor_id="user-123",
        )
        
        json_str = event.to_json()
        
        assert "login" in json_str
        assert "user-123" in json_str


# Test __init__.py
class TestSecurityModuleInit:
    """Tests for security module initialization."""
    
    def test_security_init(self):
        """Test security module init."""
        from app.security import (
            SecretsManager,
            EncryptionService,
            AuditLogger,
            get_secrets_manager,
            get_encryption_service,
            get_audit_logger,
        )
        
        assert SecretsManager is not None
        assert EncryptionService is not None
        assert AuditLogger is not None
    
    def test_get_global_instances(self):
        """Test getting global instances."""
        from app.security import (
            get_secrets_manager,
            get_encryption_service,
            get_audit_logger,
        )
        
        sm = get_secrets_manager()
        es = get_encryption_service()
        al = get_audit_logger()
        
        assert sm is not None
        assert es is not None
        assert al is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
