"""
Unit tests for Email Service
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from app.services.email_service import EmailService, get_email_service
from app.core.config import settings

class TestEmailService:
    """Test EmailService class"""
    
    @pytest.fixture
    def mock_settings(self):
        with patch("app.services.email_service.settings") as mock_settings:
            mock_settings.SMTP_HOST = "smtp.test.com"
            mock_settings.SMTP_PORT = 587
            mock_settings.SMTP_USER = "user"
            mock_settings.SMTP_PASSWORD = "password"
            mock_settings.FROM_EMAIL = "test@example.com"
            mock_settings.FROM_NAME = "Test Sender"
            mock_settings.FRONTEND_URL = "http://localhost:3000"
            yield mock_settings

    @pytest.fixture
    def email_service(self, mock_settings):
        # Re-initialize to pick up mocked settings
        return EmailService()

    @pytest.mark.asyncio
    async def test_send_email_success(self, email_service):
        """Test sending email successfully"""
        with patch("app.services.email_service.send_email_actor.send") as mock_actor:
            result = await email_service.send_email(
                to_email="recipient@example.com",
                subject="Test Subject",
                html_content="<p>Test Content</p>",
                text_content="Test Content"
            )
            
            assert result is True
            mock_actor.assert_called_once()
            
            # Verify arguments passed to actor
            call_args = mock_actor.call_args
            assert "recipient@example.com" in call_args[0]
            assert "test@example.com" in call_args[0] # From email

    @pytest.mark.asyncio
    async def test_send_email_failure(self, email_service):
        """Test sending email failure"""
        with patch("app.services.email_service.send_email_actor.send", side_effect=Exception("Queue Error")):
            result = await email_service.send_email(
                to_email="recipient@example.com",
                subject="Test Subject",
                html_content="<p>Test Content</p>"
            )
            
            assert result is False

    @pytest.mark.asyncio
    async def test_send_password_reset_email(self, email_service):
        """Test sending password reset email"""
        # Mock send_email to avoid actual sending logic
        email_service.send_email = AsyncMock(return_value=True)
        
        result = await email_service.send_password_reset_email(
            to_email="user@example.com",
            reset_token="token123",
            user_name="User"
        )
        
        assert result is True
        email_service.send_email.assert_called_once()
        
        # Verify content contains token and name
        call_kwargs = email_service.send_email.call_args.kwargs
        html_content = call_kwargs["html_content"]
        assert "token123" in html_content
        assert "User" in html_content
        assert "Reset Your Password" in call_kwargs["subject"]

    @pytest.mark.asyncio
    async def test_send_welcome_email(self, email_service):
        """Test sending welcome email"""
        email_service.send_email = AsyncMock(return_value=True)
        
        result = await email_service.send_welcome_email(
            to_email="newuser@example.com",
            user_name="New User"
        )
        
        assert result is True
        email_service.send_email.assert_called_once()
        
        call_kwargs = email_service.send_email.call_args.kwargs
        html_content = call_kwargs["html_content"]
        assert "Welcome to SmartSpec" in html_content
        assert "New User" in html_content

    @pytest.mark.asyncio
    async def test_send_payment_confirmation_email(self, email_service):
        """Test sending payment confirmation email"""
        email_service.send_email = AsyncMock(return_value=True)
        
        result = await email_service.send_payment_confirmation_email(
            to_email="payer@example.com",
            user_name="Payer",
            amount=100.50,
            credits=10000,
            payment_id="pay_123"
        )
        
        assert result is True
        email_service.send_email.assert_called_once()
        
        call_kwargs = email_service.send_email.call_args.kwargs
        html_content = call_kwargs["html_content"]
        assert "100.50" in html_content
        assert "10,000" in html_content
        assert "pay_123" in html_content
        assert "Payment Confirmed" in call_kwargs["subject"]

    @pytest.mark.asyncio
    async def test_send_low_credits_alert(self, email_service):
        """Test sending low credits alert"""
        email_service.send_email = AsyncMock(return_value=True)
        
        result = await email_service.send_low_credits_alert(
            to_email="user@example.com",
            user_name="User",
            current_balance=500,
            threshold=1000
        )
        
        assert result is True
        email_service.send_email.assert_called_once()
        
        call_kwargs = email_service.send_email.call_args.kwargs
        html_content = call_kwargs["html_content"]
        assert "500" in html_content
        assert "1,000" in html_content
        assert "Low Credits Alert" in call_kwargs["subject"]

    @pytest.mark.asyncio
    async def test_send_support_ticket_update(self, email_service):
        """Test sending support ticket update"""
        email_service.send_email = AsyncMock(return_value=True)
        
        result = await email_service.send_support_ticket_update(
            to_email="user@example.com",
            user_name="User",
            ticket_number="T-123",
            ticket_subject="Issue Help",
            update_message="We fixed it."
        )
        
        assert result is True
        email_service.send_email.assert_called_once()
        
        call_kwargs = email_service.send_email.call_args.kwargs
        html_content = call_kwargs["html_content"]
        assert "T-123" in html_content
        assert "We fixed it" in html_content
        assert "Support Ticket Update" in call_kwargs["subject"]

    def test_smtp_failed(self, email_service):
        """Test SMTP logic (blocking)"""
        msg = Mock()
        msg.as_string.return_value = "email content"
        
        with patch("smtplib.SMTP") as mock_smtp:
            instance = mock_smtp.return_value.__enter__.return_value
            instance.sendmail.side_effect = Exception("SMTP Error")
            
            try:
                email_service._send_smtp(msg, "to@example.com")
            except Exception as e:
                assert str(e) == "SMTP Error"
            
            instance.starttls.assert_called_once()
            instance.login.assert_called_once()

    def test_get_email_service_singleton(self):
        """Test singleton retrieval"""
        s1 = get_email_service()
        s2 = get_email_service()
        assert s1 is s2
        assert isinstance(s1, EmailService)
