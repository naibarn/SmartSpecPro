"""
Email Service
Handles sending emails for various purposes
"""

import smtplib
import dramatiq
from app.background_tasks import redis_broker
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Optional, Dict, Any
from datetime import datetime
import structlog

from app.core.config import settings

logger = structlog.get_logger()


class EmailService:
    """Service for sending emails"""
    
    def __init__(self):
        self.smtp_host = getattr(settings, 'SMTP_HOST', 'smtp.gmail.com')
        self.smtp_port = getattr(settings, 'SMTP_PORT', 587)
        self.smtp_user = getattr(settings, 'SMTP_USER', '')
        self.smtp_password = getattr(settings, 'SMTP_PASSWORD', '')
        self.from_email = getattr(settings, 'FROM_EMAIL', 'noreply@smartspec.com')
        self.from_name = getattr(settings, 'FROM_NAME', 'SmartSpec')
    
    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """
        Send email
        
        Args:
            to_email: Recipient email
            subject: Email subject
            html_content: HTML content
            text_content: Plain text content (optional)
        
        Returns:
            True if sent successfully
        """
        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email
            
            # Add text content
            if text_content:
                part1 = MIMEText(text_content, 'plain')
                msg.attach(part1)
            
            # Add HTML content
            part2 = MIMEText(html_content, 'html')
            msg.attach(part2)
            
            # Send email in thread pool to avoid blocking
            # R7.2: Send email in the background using Dramatiq
            send_email_actor.send(msg.as_string(), self.from_email, to_email)
            
            logger.info(
                "email_sent",
                to=to_email,
                subject=subject
            )
            
            return True
            
        except Exception as e:
            logger.error(
                "email_send_failed",
                to=to_email,
                subject=subject,
                error=str(e)
            )
            return False
    
    def _send_smtp(self, msg: MIMEMultipart, to_email: str):
        """Send email via SMTP (blocking operation)"""
        with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
            server.starttls()
            if self.smtp_user and self.smtp_password:
                server.login(self.smtp_user, self.smtp_password)
            server.sendmail(self.from_email, to_email, msg.as_string())
    
    # ============================================================
    # Template Methods
    # ============================================================
    
    async def send_password_reset_email(
        self,
        to_email: str,
        reset_token: str,
        user_name: Optional[str] = None
    ) -> bool:
        """
        Send password reset email
        
        Args:
            to_email: User email
            reset_token: Password reset token
            user_name: User name (optional)
        
        Returns:
            True if sent successfully
        """
        # Build reset URL
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"
        
        # HTML content
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background-color: #4F46E5; color: white; padding: 20px; text-align: center; }}
                .content {{ background-color: #f9fafb; padding: 30px; }}
                .button {{ 
                    display: inline-block; 
                    padding: 12px 24px; 
                    background-color: #4F46E5; 
                    color: white; 
                    text-decoration: none; 
                    border-radius: 6px;
                    margin: 20px 0;
                }}
                .footer {{ text-align: center; padding: 20px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>SmartSpec</h1>
                </div>
                <div class="content">
                    <h2>Password Reset Request</h2>
                    <p>Hello{' ' + user_name if user_name else ''},</p>
                    <p>We received a request to reset your password. Click the button below to reset it:</p>
                    <p style="text-align: center;">
                        <a href="{reset_url}" class="button">Reset Password</a>
                    </p>
                    <p>Or copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; color: #666;">{reset_url}</p>
                    <p><strong>This link will expire in 1 hour.</strong></p>
                    <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
                </div>
                <div class="footer">
                    <p>&copy; {datetime.now().year} SmartSpec. All rights reserved.</p>
                    <p>This is an automated email, please do not reply.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Plain text content
        text_content = f"""
        Password Reset Request
        
        Hello{' ' + user_name if user_name else ''},
        
        We received a request to reset your password. Click the link below to reset it:
        
        {reset_url}
        
        This link will expire in 1 hour.
        
        If you didn't request a password reset, please ignore this email or contact support if you have concerns.
        
        © {datetime.now().year} SmartSpec. All rights reserved.
        """
        
        return await self.send_email(
            to_email=to_email,
            subject="Reset Your Password - SmartSpec",
            html_content=html_content,
            text_content=text_content
        )
    
    async def send_welcome_email(
        self,
        to_email: str,
        user_name: str
    ) -> bool:
        """
        Send welcome email to new users
        
        Args:
            to_email: User email
            user_name: User name
        
        Returns:
            True if sent successfully
        """
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background-color: #4F46E5; color: white; padding: 20px; text-align: center; }}
                .content {{ background-color: #f9fafb; padding: 30px; }}
                .button {{ 
                    display: inline-block; 
                    padding: 12px 24px; 
                    background-color: #4F46E5; 
                    color: white; 
                    text-decoration: none; 
                    border-radius: 6px;
                    margin: 20px 0;
                }}
                .footer {{ text-align: center; padding: 20px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Welcome to SmartSpec!</h1>
                </div>
                <div class="content">
                    <h2>Hello {user_name}!</h2>
                    <p>Thank you for joining SmartSpec. We're excited to have you on board!</p>
                    <p>With SmartSpec, you can:</p>
                    <ul>
                        <li>Access multiple LLM providers through a single API</li>
                        <li>Automatic model selection based on your needs</li>
                        <li>Cost optimization and usage analytics</li>
                        <li>Content moderation and safety features</li>
                    </ul>
                    <p style="text-align: center;">
                        <a href="{settings.FRONTEND_URL}/dashboard" class="button">Go to Dashboard</a>
                    </p>
                    <p>If you have any questions, feel free to reach out to our support team.</p>
                </div>
                <div class="footer">
                    <p>&copy; {datetime.now().year} SmartSpec. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_content = f"""
        Welcome to SmartSpec!
        
        Hello {user_name}!
        
        Thank you for joining SmartSpec. We're excited to have you on board!
        
        With SmartSpec, you can:
        - Access multiple LLM providers through a single API
        - Automatic model selection based on your needs
        - Cost optimization and usage analytics
        - Content moderation and safety features
        
        Visit your dashboard: {settings.FRONTEND_URL}/dashboard
        
        If you have any questions, feel free to reach out to our support team.
        
        © {datetime.now().year} SmartSpec. All rights reserved.
        """
        
        return await self.send_email(
            to_email=to_email,
            subject="Welcome to SmartSpec!",
            html_content=html_content,
            text_content=text_content
        )
    
    async def send_payment_confirmation_email(
        self,
        to_email: str,
        user_name: str,
        amount: float,
        credits: int,
        payment_id: str
    ) -> bool:
        """
        Send payment confirmation email
        
        Args:
            to_email: User email
            user_name: User name
            amount: Payment amount in USD
            credits: Credits purchased
            payment_id: Payment ID
        
        Returns:
            True if sent successfully
        """
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background-color: #10B981; color: white; padding: 20px; text-align: center; }}
                .content {{ background-color: #f9fafb; padding: 30px; }}
                .details {{ background-color: white; padding: 20px; border-radius: 6px; margin: 20px 0; }}
                .footer {{ text-align: center; padding: 20px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>✓ Payment Confirmed</h1>
                </div>
                <div class="content">
                    <h2>Thank you, {user_name}!</h2>
                    <p>Your payment has been successfully processed.</p>
                    <div class="details">
                        <h3>Payment Details</h3>
                        <p><strong>Amount:</strong> ${amount:.2f} USD</p>
                        <p><strong>Credits:</strong> {credits:,}</p>
                        <p><strong>Payment ID:</strong> {payment_id}</p>
                        <p><strong>Date:</strong> {datetime.now().strftime('%B %d, %Y at %I:%M %p')}</p>
                    </div>
                    <p>Your credits have been added to your account and are ready to use.</p>
                    <p>View your transaction history in your dashboard.</p>
                </div>
                <div class="footer">
                    <p>&copy; {datetime.now().year} SmartSpec. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_content = f"""
        Payment Confirmed
        
        Thank you, {user_name}!
        
        Your payment has been successfully processed.
        
        Payment Details:
        - Amount: ${amount:.2f} USD
        - Credits: {credits:,}
        - Payment ID: {payment_id}
        - Date: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}
        
        Your credits have been added to your account and are ready to use.
        
        © {datetime.now().year} SmartSpec. All rights reserved.
        """
        
        return await self.send_email(
            to_email=to_email,
            subject="Payment Confirmed - SmartSpec",
            html_content=html_content,
            text_content=text_content
        )
    
    async def send_low_credits_alert(
        self,
        to_email: str,
        user_name: str,
        current_balance: int,
        threshold: int
    ) -> bool:
        """
        Send low credits alert email
        
        Args:
            to_email: User email
            user_name: User name
            current_balance: Current credit balance
            threshold: Alert threshold
        
        Returns:
            True if sent successfully
        """
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background-color: #F59E0B; color: white; padding: 20px; text-align: center; }}
                .content {{ background-color: #f9fafb; padding: 30px; }}
                .button {{ 
                    display: inline-block; 
                    padding: 12px 24px; 
                    background-color: #4F46E5; 
                    color: white; 
                    text-decoration: none; 
                    border-radius: 6px;
                    margin: 20px 0;
                }}
                .footer {{ text-align: center; padding: 20px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>⚠️ Low Credits Alert</h1>
                </div>
                <div class="content">
                    <h2>Hello {user_name},</h2>
                    <p>Your credit balance is running low.</p>
                    <p><strong>Current Balance:</strong> {current_balance:,} credits</p>
                    <p><strong>Alert Threshold:</strong> {threshold:,} credits</p>
                    <p>To avoid service interruption, please add more credits to your account.</p>
                    <p style="text-align: center;">
                        <a href="{settings.FRONTEND_URL}/billing" class="button">Add Credits</a>
                    </p>
                </div>
                <div class="footer">
                    <p>&copy; {datetime.now().year} SmartSpec. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_content = f"""
        Low Credits Alert
        
        Hello {user_name},
        
        Your credit balance is running low.
        
        Current Balance: {current_balance:,} credits
        Alert Threshold: {threshold:,} credits
        
        To avoid service interruption, please add more credits to your account.
        
        Add credits: {settings.FRONTEND_URL}/billing
        
        © {datetime.now().year} SmartSpec. All rights reserved.
        """
        
        return await self.send_email(
            to_email=to_email,
            subject="Low Credits Alert - SmartSpec",
            html_content=html_content,
            text_content=text_content
        )
    
    async def send_support_ticket_update(
        self,
        to_email: str,
        user_name: str,
        ticket_number: str,
        ticket_subject: str,
        update_message: str
    ) -> bool:
        """
        Send support ticket update email
        
        Args:
            to_email: User email
            user_name: User name
            ticket_number: Ticket number
            ticket_subject: Ticket subject
            update_message: Update message
        
        Returns:
            True if sent successfully
        """
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background-color: #4F46E5; color: white; padding: 20px; text-align: center; }}
                .content {{ background-color: #f9fafb; padding: 30px; }}
                .message {{ background-color: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #4F46E5; }}
                .button {{ 
                    display: inline-block; 
                    padding: 12px 24px; 
                    background-color: #4F46E5; 
                    color: white; 
                    text-decoration: none; 
                    border-radius: 6px;
                    margin: 20px 0;
                }}
                .footer {{ text-align: center; padding: 20px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Support Ticket Update</h1>
                </div>
                <div class="content">
                    <h2>Hello {user_name},</h2>
                    <p>There's an update on your support ticket:</p>
                    <p><strong>Ticket #{ticket_number}:</strong> {ticket_subject}</p>
                    <div class="message">
                        <p>{update_message}</p>
                    </div>
                    <p style="text-align: center;">
                        <a href="{settings.FRONTEND_URL}/support/tickets/{ticket_number}" class="button">View Ticket</a>
                    </p>
                </div>
                <div class="footer">
                    <p>&copy; {datetime.now().year} SmartSpec. All rights reserved.</p>
                    <p>Reply directly to this email to add to the ticket.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_content = f"""
        Support Ticket Update
        
        Hello {user_name},
        
        There's an update on your support ticket:
        
        Ticket #{ticket_number}: {ticket_subject}
        
        Update:
        {update_message}
        
        View ticket: {settings.FRONTEND_URL}/support/tickets/{ticket_number}
        
        © {datetime.now().year} SmartSpec. All rights reserved.
        Reply directly to this email to add to the ticket.
        """
        
        return await self.send_email(
            to_email=to_email,
            subject=f"Support Ticket Update - #{ticket_number}",
            html_content=html_content,
            text_content=text_content
        )


# Singleton instance
_email_service = None


def get_email_service() -> EmailService:
    """Get email service singleton"""
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
    return _email_service


# R7.3: Dramatiq actor for sending emails asynchronously
@dramatiq.actor(broker=redis_broker, max_retries=5, time_limit=30000)
def send_email_actor(message_str: str, from_email: str, to_email: str):
    """Dramatiq actor to send an email."""
    # Recreate the service to get config in the worker process
    email_service = EmailService()
    
    # The message is passed as a string, so we don't need to recreate it
    # This is a simplified approach. For complex MIME, might need to rebuild.
    try:
        with smtplib.SMTP(email_service.smtp_host, email_service.smtp_port) as server:
            server.starttls()
            if email_service.smtp_user and email_service.smtp_password:
                server.login(email_service.smtp_user, email_service.smtp_password)
            server.sendmail(from_email, to_email, message_str)
        logger.info("dramatiq_email_sent", to=to_email)
    except Exception as e:
        logger.error("dramatiq_email_failed", to=to_email, error=str(e))
        # The actor will be retried automatically by Dramatiq
        raise
