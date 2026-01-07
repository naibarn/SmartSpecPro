"""
Unit tests for Additional Models
"""

import pytest
from datetime import datetime
from app.models.notification import Notification
from app.models.audit_log import AuditLog

class TestNotificationModel:
    """Test Notification model"""

    def test_notification_creation(self):
        """Test creating notification"""
        notification = Notification(
            id="notif_123",
            user_id="user_123",
            type="info",
            title="Welcome",
            message="Hello World"
        )
        
        assert notification.id == "notif_123"
        assert notification.user_id == "user_123"
        assert notification.is_read is False # Default
        assert notification.created_at is not None # Default

    def test_notification_with_data(self):
        """Test notification with data"""
        data = {"link": "/dashboard", "icon": "star"}
        notification = Notification(
            id="notif_123",
            user_id="user_123",
            type="success",
            title="Done",
            message="Completed",
            data=data
        )
        
        assert notification.data == data

    def test_notification_read_status(self):
        """Test notification read status"""
        now = datetime.utcnow()
        notification = Notification(
            id="notif_123",
            user_id="user_123",
            type="info",
            title="Read Me",
            message="Content",
            is_read=True,
            read_at=now
        )
        
        assert notification.is_read is True
        assert notification.read_at == now

class TestAuditLogModel:
    """Test AuditLog model"""

    def test_audit_log_creation(self):
        """Test creating audit log"""
        log = AuditLog(
            action="login",
            user_id="user_123",
            user_email="test@example.com"
        )
        
        assert log.action == "login"
        assert log.user_id == "user_123"
        assert log.timestamp is not None
        assert log.id is not None # UUID default

    def test_audit_log_impersonation(self):
        """Test impersonation fields"""
        log = AuditLog(
            action="view_profile",
            user_id="target_user",
            impersonator_id="admin_user",
            is_impersonated="true"
        )
        
        assert log.impersonator_id == "admin_user"
        assert log.is_impersonated == "true"

    def test_audit_log_request_details(self):
        """Test request details"""
        log = AuditLog(
            action="api_call",
            method="POST",
            endpoint="/api/v1/chat",
            status_code="200",
            ip_address="127.0.0.1"
        )
        
        assert log.method == "POST"
        assert log.ip_address == "127.0.0.1"

    def test_audit_log_to_dict(self):
        """Test to_dict method"""
        now = datetime.utcnow()
        log = AuditLog(
            id="log_123",
            action="test_action",
            user_id="user_123",
            is_impersonated="true",
            details={"key": "value"},
            timestamp=now
        )
        
        data = log.to_dict()
        
        assert data["id"] == "log_123"
        assert data["action"] == "test_action"
        assert data["is_impersonated"] is True # Converted to bool
        assert data["details"] == {"key": "value"}
        assert data["timestamp"] == now.isoformat()

    def test_audit_log_repr(self):
        """Test string representation"""
        log = AuditLog(
            id="log_123",
            action="delete_user",
            user_email="admin@example.com"
        )
        
        repr_str = repr(log)
        assert "log_123" in repr_str
        assert "delete_user" in repr_str
        assert "admin@example.com" in repr_str
