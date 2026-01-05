"""
Complete API Integration Tests
Tests all major API endpoints
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


class TestHealthEndpoints:
    """Test health check endpoints"""
    
    def test_health_check(self, client: TestClient):
        """Test basic health check"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        # In test environment, status may be "degraded" due to Redis/LLM not being available
        assert data["status"] in ["healthy", "degraded"]
        assert "version" in data
        assert "timestamp" in data


class TestAuthenticationEndpoints:
    """Test authentication endpoints"""
    
    def test_register_success(self, client: TestClient):
        """Test successful user registration"""
        response = client.post("/api/auth/register", json={
            "email": "newuser@example.com",
            "password": "SecurePass123!",
            "full_name": "New User"
        })
        # 201 Created is the correct status code for resource creation
        assert response.status_code in [200, 201]
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
    
    def test_register_duplicate_email(self, client: TestClient, test_user: User):
        """Test registration with duplicate email"""
        response = client.post("/api/auth/register", json={
            "email": test_user.email,
            "password": "SecurePass123!",
            "full_name": "Duplicate User"
        })
        assert response.status_code == 400
    
    def test_login_success(self, client: TestClient, test_user: User):
        """Test successful login"""
        response = client.post("/api/auth/login", json={
            "email": test_user.email,
            "password": "testpassword123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
    
    def test_login_wrong_password(self, client: TestClient, test_user: User):
        """Test login with wrong password"""
        response = client.post("/api/auth/login", json={
            "email": test_user.email,
            "password": "wrongpassword"
        })
        assert response.status_code == 401
    
    def test_get_current_user(self, client: TestClient, auth_headers: dict, test_user: User):
        """Test get current user endpoint"""
        response = client.get("/api/auth/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == test_user.email
        assert data["full_name"] == test_user.full_name


class TestCreditsEndpoints:
    """Test credits endpoints"""
    
    def test_get_balance(self, client: TestClient, auth_headers: dict, test_user: User):
        """Test get credit balance"""
        response = client.get("/api/credits/balance", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        # API returns balance_credits and balance_usd
        assert "balance_credits" in data
        assert "balance_usd" in data
        assert data["balance_credits"] == test_user.credits_balance
    
    def test_get_transactions(self, client: TestClient, auth_headers: dict):
        """Test get credit transactions"""
        response = client.get("/api/credits/transactions", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "transactions" in data
        assert isinstance(data["transactions"], list)
    
    def test_calculate_credits(self, client: TestClient, auth_headers: dict):
        """Test calculate credits from USD"""
        response = client.post("/api/credits/calculate", headers=auth_headers, json={
            "payment_usd": 100.00
        })
        assert response.status_code == 200
        data = response.json()
        assert "credits" in data
        # $100 / 1.15 * 1000 = 86956.52... rounded (may be 86956 or 86957 depending on rounding)
        assert data["credits"] in [86956, 86957]


class TestPaymentsEndpoints:
    """Test payment endpoints"""
    
    @pytest.mark.usefixtures("mock_stripe")
    def test_create_checkout(self, client: TestClient, auth_headers: dict, mock_stripe):
        """Test create Stripe checkout session"""
        response = client.post("/api/payments/checkout", headers=auth_headers, json={
            "amount_usd": 100.00,
            "success_url": "https://example.com/success",
            "cancel_url": "https://example.com/cancel"
        })
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert "url" in data
        assert "credits_to_receive" in data
    
    def test_get_payment_amounts(self, client: TestClient):
        """Test get predefined payment amounts"""
        response = client.get("/api/payments/amounts")
        assert response.status_code == 200
        data = response.json()
        assert "amounts" in data
        assert len(data["amounts"]) > 0
        # amounts is a dict with keys like 'small', 'medium', 'large', 'xlarge'
        for key, amount in data["amounts"].items():
            assert "amount_usd" in amount
            assert "credits" in amount
    
    @pytest.mark.usefixtures("mock_stripe")
    def test_get_payment_history(self, client: TestClient, auth_headers: dict):
        """Test get payment history"""
        response = client.get("/api/payments/history", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "payments" in data
        assert isinstance(data["payments"], list)


class TestDashboardEndpoints:
    """Test dashboard endpoints"""
    
    def test_get_summary(self, client: TestClient, auth_headers: dict):
        """Test get dashboard summary"""
        response = client.get("/api/dashboard/summary", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "balance" in data
        assert "stats" in data
        assert "credits" in data["balance"]
        assert "usd" in data["balance"]
    
    def test_get_usage_over_time(self, client: TestClient, auth_headers: dict):
        """Test get usage over time"""
        response = client.get("/api/dashboard/usage?days=30", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "daily_usage" in data
        assert "days" in data
        assert isinstance(data["daily_usage"], list)
    
    def test_get_transactions(self, client: TestClient, auth_headers: dict):
        """Test get recent transactions"""
        response = client.get("/api/dashboard/transactions?limit=10", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "transactions" in data
        assert "total" in data
        assert isinstance(data["transactions"], list)
    
    def test_get_llm_usage(self, client: TestClient, auth_headers: dict):
        """Test get LLM usage breakdown"""
        response = client.get("/api/dashboard/llm-usage?days=30", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "by_model" in data
        assert "by_provider" in data
        assert "by_task_type" in data


class TestAuthorizationRequired:
    """Test that protected endpoints require authorization"""
    
    def test_credits_requires_auth(self, client: TestClient):
        """Test credits endpoint requires auth"""
        response = client.get("/api/credits/balance")
        # 401 Unauthorized or 403 Forbidden are both acceptable for missing auth
        assert response.status_code in [401, 403]
    
    def test_payments_requires_auth(self, client: TestClient):
        """Test payments endpoint requires auth"""
        response = client.post("/api/payments/checkout", json={
            "amount_usd": 100.00,
            "success_url": "https://example.com/success",
            "cancel_url": "https://example.com/cancel"
        })
        # 401 Unauthorized or 403 Forbidden are both acceptable for missing auth
        assert response.status_code in [401, 403]
    
    def test_dashboard_requires_auth(self, client: TestClient):
        """Test dashboard endpoint requires auth"""
        response = client.get("/api/dashboard/summary")
        # 401 Unauthorized or 403 Forbidden are both acceptable for missing auth
        assert response.status_code in [401, 403]


class TestInputValidation:
    """Test input validation"""
    
    def test_invalid_email_format(self, client: TestClient):
        """Test registration with invalid email"""
        response = client.post("/api/auth/register", json={
            "email": "notanemail",
            "password": "SecurePass123!",
            "full_name": "Test User"
        })
        assert response.status_code == 422
    
    def test_weak_password(self, client: TestClient):
        """Test registration with weak password"""
        response = client.post("/api/auth/register", json={
            "email": "test@example.com",
            "password": "123",
            "full_name": "Test User"
        })
        assert response.status_code == 422
    
    def test_invalid_payment_amount(self, client: TestClient, auth_headers: dict):
        """Test checkout with invalid amount"""
        response = client.post("/api/payments/checkout", headers=auth_headers, json={
            "amount_usd": 1.00,  # Below minimum
            "success_url": "https://example.com/success",
            "cancel_url": "https://example.com/cancel"
        })
        # 400 Bad Request or 422 Unprocessable Entity are both acceptable for validation errors
        assert response.status_code in [400, 422]
    
    def test_invalid_days_parameter(self, client: TestClient, auth_headers: dict):
        """Test dashboard with invalid days parameter"""
        response = client.get("/api/dashboard/usage?days=500", headers=auth_headers)
        assert response.status_code == 422


class TestErrorHandling:
    """Test error handling"""
    
    def test_not_found_endpoint(self, client: TestClient):
        """Test 404 for non-existent endpoint"""
        response = client.get("/api/nonexistent")
        assert response.status_code == 404
    
    def test_method_not_allowed(self, client: TestClient):
        """Test 405 for wrong HTTP method"""
        response = client.post("/health")
        assert response.status_code == 405
    
    def test_invalid_json(self, client: TestClient):
        """Test 422 for invalid JSON"""
        response = client.post(
            "/api/auth/register",
            data="invalid json",
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 422


@pytest.mark.slow
class TestEndToEndFlows:
    """Test complete end-to-end user flows"""
    
    def test_complete_user_journey(self, client: TestClient, mock_stripe):
        """Test complete user journey from registration to payment"""
        # 1. Register
        register_response = client.post("/api/auth/register", json={
            "email": "journey@example.com",
            "password": "SecurePass123!",
            "full_name": "Journey User"
        })
        # 201 Created is the correct status code for resource creation
        assert register_response.status_code in [200, 201]
        token = register_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 2. Check balance
        balance_response = client.get("/api/credits/balance", headers=headers)
        assert balance_response.status_code == 200
        initial_balance = balance_response.json()["balance_credits"]
        
        # 3. View dashboard
        dashboard_response = client.get("/api/dashboard/summary", headers=headers)
        assert dashboard_response.status_code == 200
        
        # 4. Create payment checkout
        checkout_response = client.post("/api/payments/checkout", headers=headers, json={
            "amount_usd": 100.00,
            "success_url": "https://example.com/success",
            "cancel_url": "https://example.com/cancel"
        })
        assert checkout_response.status_code == 200
        assert "url" in checkout_response.json()
        
        # 5. View payment history
        history_response = client.get("/api/payments/history", headers=headers)
        assert history_response.status_code == 200
