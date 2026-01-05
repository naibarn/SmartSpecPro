"""
Load Testing Script using Locust
Tests system performance under load
"""

from locust import HttpUser, task, between
import random
import uuid
import json


class SmartSpecUser(HttpUser):
    """Simulates a SmartSpec user"""
    
    wait_time = between(1, 3)  # Wait 1-3 seconds between tasks
    
    def on_start(self):
        """Register and login when user starts"""
        self.email = f"load_test_{uuid.uuid4()}@example.com"
        self.password = "LoadTest123!"
        
        # Register
        response = self.client.post("/api/v1/auth/register", json={
            "email": self.email,
            "password": self.password,
            "name": "Load Test User"
        })
        
        if response.status_code == 201:
            data = response.json()
            self.token = data["access_token"]
            self.user_id = data["user"]["id"]
            
            # Set auth header for all subsequent requests
            self.client.headers["Authorization"] = f"Bearer {self.token}"
        else:
            print(f"Registration failed: {response.status_code}")
    
    @task(10)
    def get_credit_balance(self):
        """Get credit balance (high frequency)"""
        self.client.get("/api/v1/credits/balance")
    
    @task(5)
    def get_credit_history(self):
        """Get credit history (medium frequency)"""
        self.client.get("/api/v1/credits/history?limit=20")
    
    @task(8)
    def chat_completion(self):
        """Make chat completion request (high frequency)"""
        messages = [
            {"role": "user", "content": "Hello"},
            {"role": "user", "content": "What is 2+2?"},
            {"role": "user", "content": "Tell me a joke"},
            {"role": "user", "content": "Explain AI"},
        ]
        
        self.client.post("/api/v1/llm/chat", json={
            "messages": [random.choice(messages)],
            "model": "gpt-3.5-turbo"
        })
    
    @task(3)
    def streaming_chat(self):
        """Make streaming chat request (medium frequency)"""
        self.client.post("/api/v1/llm/stream", json={
            "messages": [{"role": "user", "content": "Write a short story"}],
            "model": "gpt-3.5-turbo"
        })
    
    @task(2)
    def get_analytics_summary(self):
        """Get analytics summary (low frequency)"""
        days = random.choice([7, 14, 30])
        self.client.get(f"/api/v1/analytics/summary?days={days}")
    
    @task(2)
    def get_analytics_time_series(self):
        """Get analytics time series (low frequency)"""
        self.client.get("/api/v1/analytics/time-series?days=7&granularity=day")
    
    @task(1)
    def create_api_key(self):
        """Create API key (low frequency)"""
        self.client.post("/api/v1/api-keys", json={
            "name": f"Load Test Key {uuid.uuid4()}",
            "permissions": {},
            "rate_limit": 60
        })
    
    @task(2)
    def list_api_keys(self):
        """List API keys (low frequency)"""
        self.client.get("/api/v1/api-keys")
    
    @task(1)
    def create_support_ticket(self):
        """Create support ticket (low frequency)"""
        categories = ["technical", "billing", "general", "feature_request"]
        priorities = ["low", "medium", "high"]
        
        self.client.post("/api/v1/support/tickets", json={
            "subject": f"Load Test Ticket {uuid.uuid4()}",
            "description": "This is a load test ticket",
            "category": random.choice(categories),
            "priority": random.choice(priorities)
        })
    
    @task(2)
    def list_tickets(self):
        """List support tickets (low frequency)"""
        self.client.get("/api/v1/support/tickets")
    
    @task(3)
    def get_notifications(self):
        """Get notifications (medium frequency)"""
        self.client.get("/api/v1/notifications")
    
    @task(1)
    def get_rate_limit_status(self):
        """Get rate limit status (low frequency)"""
        self.client.get("/api/v1/rate-limits/status")
    
    @task(1)
    def select_model(self):
        """Select optimal model (low frequency)"""
        task_types = ["general", "coding", "creative", "analysis"]
        budget_priorities = ["cost", "balanced", "performance"]
        
        self.client.post("/api/v1/llm/select-model", json={
            "task_type": random.choice(task_types),
            "budget_priority": random.choice(budget_priorities)
        })


class AdminUser(HttpUser):
    """Simulates an admin user"""
    
    wait_time = between(2, 5)
    
    def on_start(self):
        """Login as admin"""
        # In real scenario, use actual admin credentials
        self.email = "admin@smartspec.com"
        self.password = "AdminPass123!"
        
        response = self.client.post("/api/v1/auth/login", json={
            "email": self.email,
            "password": self.password
        })
        
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.client.headers["Authorization"] = f"Bearer {self.token}"
    
    @task(5)
    def get_system_health(self):
        """Check system health"""
        self.client.get("/api/v1/health/system")
    
    @task(3)
    def get_audit_logs(self):
        """Get audit logs"""
        self.client.get("/api/v1/audit-logs?limit=50")
    
    @task(2)
    def search_audit_logs(self):
        """Search audit logs"""
        actions = ["login", "payment", "refund", "impersonation"]
        self.client.get(f"/api/v1/audit-logs?action={random.choice(actions)}")
    
    @task(1)
    def get_all_tickets(self):
        """Get all support tickets"""
        self.client.get("/api/v1/support/tickets/all")


class PaymentUser(HttpUser):
    """Simulates users making payments"""
    
    wait_time = between(5, 10)
    
    def on_start(self):
        """Register and login"""
        self.email = f"payment_test_{uuid.uuid4()}@example.com"
        self.password = "PaymentTest123!"
        
        response = self.client.post("/api/v1/auth/register", json={
            "email": self.email,
            "password": self.password,
            "name": "Payment Test User"
        })
        
        if response.status_code == 201:
            self.token = response.json()["access_token"]
            self.client.headers["Authorization"] = f"Bearer {self.token}"
    
    @task(5)
    def create_payment_intent(self):
        """Create payment intent"""
        amounts = [10.00, 25.00, 50.00, 100.00]
        amount = random.choice(amounts)
        credits = int(amount * 1000)
        
        self.client.post("/api/v1/payments/create-intent", json={
            "amount_usd": amount,
            "credits": credits
        })
    
    @task(3)
    def get_payment_history(self):
        """Get payment history"""
        self.client.get("/api/v1/payments/history")
    
    @task(1)
    def export_payments(self):
        """Export payments"""
        self.client.get("/api/v1/payments/export?format=csv")


# Load test scenarios

class QuickTest(HttpUser):
    """Quick smoke test - light load"""
    tasks = [SmartSpecUser]
    wait_time = between(1, 2)


class NormalLoad(HttpUser):
    """Normal load - typical usage"""
    tasks = [SmartSpecUser]
    wait_time = between(1, 3)


class HeavyLoad(HttpUser):
    """Heavy load - stress test"""
    tasks = [SmartSpecUser]
    wait_time = between(0.5, 1.5)


class MixedLoad(HttpUser):
    """Mixed user types"""
    tasks = {
        SmartSpecUser: 10,
        AdminUser: 1,
        PaymentUser: 2
    }
    wait_time = between(1, 3)


# Run with:
# locust -f locustfile.py --host=http://localhost:8000
# 
# Then open http://localhost:8089 to configure and start test
# 
# Example command line usage:
# locust -f locustfile.py --host=http://localhost:8000 --users 100 --spawn-rate 10 --run-time 5m --headless
