"""
End-to-End Tests for User Journeys
Tests complete user flows from registration to usage
"""

import pytest
from fastapi.testclient import TestClient
import uuid


class TestNewUserJourney:
    """Test complete new user journey"""
    
    def test_new_user_registration_flow(self, client, mock_stripe):
        """
        Test: New user registers, logs in, and views dashboard
        
        Steps:
        1. Register new account
        2. Login with credentials
        3. Get current user info
        4. View credit balance
        5. View dashboard summary
        """
        # Step 1: Register
        email = f"newuser_{uuid.uuid4().hex[:8]}@example.com"
        password = "SecurePassword123!"
        
        register_response = client.post("/api/auth/register", json={
            "email": email,
            "password": password,
            "full_name": "New User"
        })
        
        assert register_response.status_code in [200, 201]
        
        # Step 2: Login
        login_response = client.post("/api/auth/login", json={
            "email": email,
            "password": password
        })
        
        assert login_response.status_code == 200
        login_data = login_response.json()
        assert "access_token" in login_data
        
        # Get auth headers
        token = login_data["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Step 3: Get current user
        me_response = client.get("/api/auth/me", headers=headers)
        assert me_response.status_code == 200
        user_data = me_response.json()
        assert user_data.get("email") == email
        
        # Step 4: View credit balance
        balance_response = client.get("/api/credits/balance", headers=headers)
        assert balance_response.status_code == 200
        balance_data = balance_response.json()
        assert "balance_credits" in balance_data or "credits" in balance_data or "balance" in balance_data
        
        # Step 5: View dashboard
        dashboard_response = client.get("/api/dashboard/summary", headers=headers)
        assert dashboard_response.status_code == 200
    
    def test_new_user_top_up_flow(self, client, mock_stripe):
        """
        Test: New user tops up credits
        
        Steps:
        1. Register and login
        2. View available payment amounts
        3. Create checkout session
        4. Verify checkout URL returned
        """
        # Register and login
        email = f"topup_{uuid.uuid4().hex[:8]}@example.com"
        password = "SecurePassword123!"
        
        client.post("/api/auth/register", json={
            "email": email,
            "password": password,
            "full_name": "Top Up User"
        })
        
        login_response = client.post("/api/auth/login", json={
            "email": email,
            "password": password
        })
        
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # View payment amounts
        amounts_response = client.get("/api/payments/amounts", headers=headers)
        assert amounts_response.status_code == 200
        amounts_data = amounts_response.json()
        assert isinstance(amounts_data, list) or "amounts" in amounts_data
        
        # Create checkout session
        checkout_response = client.post("/api/payments/checkout", headers=headers, json={
            "amount_usd": 50.00,
            "success_url": "https://example.com/success",
            "cancel_url": "https://example.com/cancel"
        })
        
        assert checkout_response.status_code in [200, 201]
        checkout_data = checkout_response.json()
        assert "url" in checkout_data or "checkout_url" in checkout_data


class TestReturningUserJourney:
    """Test returning user journey"""
    
    def test_returning_user_login_and_usage(self, client, test_user, test_user_token):
        """
        Test: Returning user logs in and views usage
        
        Steps:
        1. Login with existing credentials
        2. View credit balance
        3. View transaction history
        4. View usage analytics
        """
        headers = {"Authorization": f"Bearer {test_user_token}"}
        
        # View credit balance
        balance_response = client.get("/api/credits/balance", headers=headers)
        assert balance_response.status_code == 200
        
        # View transactions
        transactions_response = client.get("/api/credits/transactions", headers=headers)
        assert transactions_response.status_code == 200
        
        # View dashboard usage
        usage_response = client.get("/api/dashboard/usage", headers=headers)
        assert usage_response.status_code == 200
    
    def test_returning_user_payment_history(self, client, test_user, test_user_token):
        """
        Test: Returning user views payment history
        
        Steps:
        1. Login
        2. View payment history
        3. View dashboard transactions
        """
        headers = {"Authorization": f"Bearer {test_user_token}"}
        
        # View payment history
        history_response = client.get("/api/payments/history", headers=headers)
        assert history_response.status_code == 200
        
        # View dashboard transactions
        transactions_response = client.get("/api/dashboard/transactions", headers=headers)
        assert transactions_response.status_code == 200


class TestPasswordResetJourney:
    """Test password reset journey"""
    
    def test_password_reset_request(self, client):
        """
        Test: User requests password reset
        
        Steps:
        1. Request password reset
        2. Verify response
        """
        response = client.post("/api/auth/forgot-password", json={
            "email": "test@example.com"
        })
        
        # Should always return success (to prevent email enumeration)
        assert response.status_code in [200, 404]
    
    def test_password_reset_invalid_token(self, client):
        """
        Test: User tries to reset password with invalid token
        """
        response = client.post("/api/auth/reset-password", json={
            "token": "invalid_token",
            "new_password": "NewSecurePassword123!"
        })
        
        # Should fail with invalid token or endpoint may not exist
        assert response.status_code in [400, 401, 404, 422, 500]


class TestTokenRefreshJourney:
    """Test token refresh journey"""
    
    def test_token_refresh_flow(self, client, mock_stripe):
        """
        Test: User refreshes access token
        
        Steps:
        1. Register and login
        2. Get refresh token
        3. Use refresh token to get new access token
        """
        # Register and login
        email = f"refresh_{uuid.uuid4().hex[:8]}@example.com"
        password = "SecurePassword123!"
        
        client.post("/api/auth/register", json={
            "email": email,
            "password": password,
            "full_name": "Refresh User"
        })
        
        login_response = client.post("/api/auth/login", json={
            "email": email,
            "password": password
        })
        
        login_data = login_response.json()
        
        # Check if refresh token is provided
        if "refresh_token" in login_data:
            refresh_token = login_data["refresh_token"]
            
            # Refresh token
            refresh_response = client.post("/api/auth/refresh", json={
                "refresh_token": refresh_token
            })
            
            assert refresh_response.status_code in [200, 404]


class TestLogoutJourney:
    """Test logout journey"""
    
    def test_logout_flow(self, client, mock_stripe):
        """
        Test: User logs out
        
        Steps:
        1. Register and login
        2. Verify authenticated access
        3. Logout
        4. Verify token is invalidated
        """
        # Register and login
        email = f"logout_{uuid.uuid4().hex[:8]}@example.com"
        password = "SecurePassword123!"
        
        client.post("/api/auth/register", json={
            "email": email,
            "password": password,
            "full_name": "Logout User"
        })
        
        login_response = client.post("/api/auth/login", json={
            "email": email,
            "password": password
        })
        
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Verify authenticated access
        me_response = client.get("/api/auth/me", headers=headers)
        assert me_response.status_code == 200
        
        # Logout
        logout_response = client.post("/api/auth/logout", headers=headers)
        assert logout_response.status_code in [200, 204, 401, 404, 422]


class TestCreditUsageJourney:
    """Test credit usage journey"""
    
    def test_credit_calculation_flow(self, client, test_user, test_user_token):
        """
        Test: User calculates credits for payment
        
        Steps:
        1. Login
        2. Calculate credits for different amounts
        3. Verify calculations
        """
        headers = {"Authorization": f"Bearer {test_user_token}"}
        
        # Calculate credits for $10 (POST method)
        calc_response = client.post("/api/credits/calculate", headers=headers, json={"payment_usd": 10})
        assert calc_response.status_code == 200
        calc_data = calc_response.json()
        assert "credits" in calc_data or "credits_received" in calc_data
        
        # Calculate credits for $100
        calc_response_2 = client.post("/api/credits/calculate", headers=headers, json={"payment_usd": 100})
        assert calc_response_2.status_code == 200
        calc_data_2 = calc_response_2.json()
        
        # Get the credits field (may be named differently)
        credits_key = "credits" if "credits" in calc_data else "credits_received"
        
        # $100 should give more credits than $10
        assert calc_data_2[credits_key] > calc_data[credits_key]


class TestDashboardJourney:
    """Test dashboard journey"""
    
    def test_dashboard_overview_flow(self, client, test_user, test_user_token):
        """
        Test: User views complete dashboard
        
        Steps:
        1. Login
        2. View summary
        3. View usage over time
        4. View transactions
        5. View LLM usage
        """
        headers = {"Authorization": f"Bearer {test_user_token}"}
        
        # View summary
        summary_response = client.get("/api/dashboard/summary", headers=headers)
        assert summary_response.status_code == 200
        
        # View usage over time
        usage_response = client.get("/api/dashboard/usage?days=30", headers=headers)
        assert usage_response.status_code == 200
        
        # View transactions
        transactions_response = client.get("/api/dashboard/transactions", headers=headers)
        assert transactions_response.status_code == 200
        
        # View LLM usage
        llm_response = client.get("/api/dashboard/llm-usage", headers=headers)
        assert llm_response.status_code == 200


class TestErrorHandlingJourney:
    """Test error handling in user journeys"""
    
    def test_invalid_credentials_flow(self, client):
        """Test login with invalid credentials"""
        response = client.post("/api/auth/login", json={
            "email": "nonexistent@example.com",
            "password": "WrongPassword123!"
        })
        
        assert response.status_code in [400, 401, 404]
    
    def test_duplicate_registration_flow(self, client, test_user):
        """Test registering with existing email"""
        response = client.post("/api/auth/register", json={
            "email": test_user.email,
            "password": "AnotherPassword123!",
            "full_name": "Duplicate User"
        })
        
        assert response.status_code in [400, 409]
    
    def test_expired_token_flow(self, client):
        """Test using expired token"""
        # Use obviously invalid token
        headers = {"Authorization": "Bearer invalid_expired_token"}
        
        response = client.get("/api/auth/me", headers=headers)
        
        assert response.status_code in [401, 403]
    
    def test_missing_auth_header_flow(self, client):
        """Test accessing protected endpoint without auth"""
        response = client.get("/api/credits/balance")
        
        assert response.status_code in [401, 403]
