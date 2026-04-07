"""
Iteration 19 - Stripe Payment Integration Tests
Tests for wallet topup via Stripe checkout sessions
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test user credentials from iteration 18
TEST_PHONE = "+33 6 12 34 56 78"
TEST_PASSWORD = "TestUser123!"


class TestStripePaymentEndpoints:
    """Test Stripe payment checkout and status endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        
    def get_auth_token(self):
        """Authenticate and get token"""
        if self.token:
            return self.token
            
        # Step 1: Phone check (endpoint is check-phone not phone-check)
        phone_res = self.session.post(f"{BASE_URL}/api/auth/check-phone", json={
            "phone": TEST_PHONE
        })
        assert phone_res.status_code == 200, f"Phone check failed: {phone_res.text}"
        
        # Step 2: Phone login
        login_res = self.session.post(f"{BASE_URL}/api/auth/phone-login", json={
            "phone": TEST_PHONE,
            "password": TEST_PASSWORD
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        
        data = login_res.json()
        self.token = data.get("access_token")  # Response uses access_token not token
        assert self.token, "No access_token in login response"
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        return self.token
    
    # ===== POST /api/payments/checkout Tests =====
    
    def test_checkout_valid_package_10(self):
        """POST /api/payments/checkout with package_id=10 returns Stripe URL"""
        self.get_auth_token()
        
        res = self.session.post(f"{BASE_URL}/api/payments/checkout", json={
            "package_id": "10",
            "origin_url": "https://superapp-integration.preview.emergentagent.com"
        })
        
        assert res.status_code == 200, f"Checkout failed: {res.text}"
        data = res.json()
        
        # Verify response structure
        assert "url" in data, "Missing 'url' in response"
        assert "session_id" in data, "Missing 'session_id' in response"
        
        # Verify Stripe URL format
        assert data["url"].startswith("https://checkout.stripe.com/"), f"Invalid Stripe URL: {data['url']}"
        assert len(data["session_id"]) > 0, "Empty session_id"
        
        print(f"✓ Checkout created: session_id={data['session_id'][:20]}...")
        
        # Store session_id for status test
        self.__class__.test_session_id = data["session_id"]
    
    def test_checkout_valid_package_20(self):
        """POST /api/payments/checkout with package_id=20 returns Stripe URL"""
        self.get_auth_token()
        
        res = self.session.post(f"{BASE_URL}/api/payments/checkout", json={
            "package_id": "20",
            "origin_url": "https://superapp-integration.preview.emergentagent.com"
        })
        
        assert res.status_code == 200, f"Checkout failed: {res.text}"
        data = res.json()
        assert "url" in data
        assert "session_id" in data
        print(f"✓ Package 20 EUR checkout created")
    
    def test_checkout_valid_package_50(self):
        """POST /api/payments/checkout with package_id=50 returns Stripe URL"""
        self.get_auth_token()
        
        res = self.session.post(f"{BASE_URL}/api/payments/checkout", json={
            "package_id": "50",
            "origin_url": "https://superapp-integration.preview.emergentagent.com"
        })
        
        assert res.status_code == 200, f"Checkout failed: {res.text}"
        data = res.json()
        assert "url" in data
        assert "session_id" in data
        print(f"✓ Package 50 EUR checkout created")
    
    def test_checkout_valid_package_100(self):
        """POST /api/payments/checkout with package_id=100 returns Stripe URL"""
        self.get_auth_token()
        
        res = self.session.post(f"{BASE_URL}/api/payments/checkout", json={
            "package_id": "100",
            "origin_url": "https://superapp-integration.preview.emergentagent.com"
        })
        
        assert res.status_code == 200, f"Checkout failed: {res.text}"
        data = res.json()
        assert "url" in data
        assert "session_id" in data
        print(f"✓ Package 100 EUR checkout created")
    
    def test_checkout_invalid_package_returns_400(self):
        """POST /api/payments/checkout with invalid package_id returns 400"""
        self.get_auth_token()
        
        res = self.session.post(f"{BASE_URL}/api/payments/checkout", json={
            "package_id": "999",
            "origin_url": "https://superapp-integration.preview.emergentagent.com"
        })
        
        assert res.status_code == 400, f"Expected 400, got {res.status_code}: {res.text}"
        data = res.json()
        assert "detail" in data
        print(f"✓ Invalid package correctly rejected: {data['detail']}")
    
    def test_checkout_missing_origin_url_returns_400(self):
        """POST /api/payments/checkout without origin_url returns 400"""
        self.get_auth_token()
        
        res = self.session.post(f"{BASE_URL}/api/payments/checkout", json={
            "package_id": "10"
        })
        
        assert res.status_code == 400, f"Expected 400, got {res.status_code}: {res.text}"
        print(f"✓ Missing origin_url correctly rejected")
    
    def test_checkout_unauthenticated_returns_401(self):
        """POST /api/payments/checkout without auth returns 401"""
        # Use fresh session without auth
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        res = session.post(f"{BASE_URL}/api/payments/checkout", json={
            "package_id": "10",
            "origin_url": "https://superapp-integration.preview.emergentagent.com"
        })
        
        assert res.status_code == 401, f"Expected 401, got {res.status_code}: {res.text}"
        print(f"✓ Unauthenticated request correctly rejected")
    
    # ===== GET /api/payments/status Tests =====
    
    def test_payment_status_valid_session(self):
        """GET /api/payments/status/{session_id} returns payment status"""
        self.get_auth_token()
        
        # First create a checkout session
        checkout_res = self.session.post(f"{BASE_URL}/api/payments/checkout", json={
            "package_id": "10",
            "origin_url": "https://superapp-integration.preview.emergentagent.com"
        })
        assert checkout_res.status_code == 200
        session_id = checkout_res.json()["session_id"]
        
        # Now check status
        status_res = self.session.get(f"{BASE_URL}/api/payments/status/{session_id}")
        
        assert status_res.status_code == 200, f"Status check failed: {status_res.text}"
        data = status_res.json()
        
        # Verify response structure
        assert "status" in data, "Missing 'status' in response"
        assert "payment_status" in data, "Missing 'payment_status' in response"
        assert "amount" in data, "Missing 'amount' in response"
        assert "currency" in data, "Missing 'currency' in response"
        
        # Verify values
        assert data["amount"] == 10.0, f"Expected amount 10.0, got {data['amount']}"
        assert data["currency"] == "EUR", f"Expected EUR, got {data['currency']}"
        
        print(f"✓ Payment status: {data['payment_status']}, amount: {data['amount']} {data['currency']}")
    
    def test_payment_status_invalid_session_returns_404(self):
        """GET /api/payments/status with invalid session_id returns 404"""
        self.get_auth_token()
        
        res = self.session.get(f"{BASE_URL}/api/payments/status/invalid_session_12345")
        
        assert res.status_code == 404, f"Expected 404, got {res.status_code}: {res.text}"
        print(f"✓ Invalid session_id correctly returns 404")
    
    def test_payment_status_unauthenticated_returns_401(self):
        """GET /api/payments/status without auth returns 401"""
        session = requests.Session()
        
        res = session.get(f"{BASE_URL}/api/payments/status/some_session_id")
        
        assert res.status_code == 401, f"Expected 401, got {res.status_code}: {res.text}"
        print(f"✓ Unauthenticated status check correctly rejected")


class TestStripeWebhook:
    """Test Stripe webhook endpoint exists"""
    
    def test_webhook_endpoint_exists(self):
        """POST /api/webhook/stripe endpoint exists and responds"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Send empty body - should fail signature validation but endpoint should exist
        res = session.post(f"{BASE_URL}/api/webhook/stripe", data=b"")
        
        # Webhook should return error for invalid signature, not 404
        assert res.status_code != 404, "Webhook endpoint not found"
        
        # Should return some response (likely error due to missing signature)
        data = res.json()
        print(f"✓ Webhook endpoint exists, response: {data}")


class TestPaymentTransactionCreation:
    """Test that checkout creates pending payment_transaction in DB"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        
    def get_auth_token(self):
        if self.token:
            return self.token
            
        phone_res = self.session.post(f"{BASE_URL}/api/auth/check-phone", json={
            "phone": TEST_PHONE
        })
        assert phone_res.status_code == 200
        
        login_res = self.session.post(f"{BASE_URL}/api/auth/phone-login", json={
            "phone": TEST_PHONE,
            "password": TEST_PASSWORD
        })
        assert login_res.status_code == 200
        
        data = login_res.json()
        self.token = data.get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        return self.token
    
    def test_checkout_creates_pending_transaction(self):
        """Checkout creates pending payment_transaction that can be queried via status"""
        self.get_auth_token()
        
        # Create checkout
        checkout_res = self.session.post(f"{BASE_URL}/api/payments/checkout", json={
            "package_id": "50",
            "origin_url": "https://superapp-integration.preview.emergentagent.com"
        })
        assert checkout_res.status_code == 200
        session_id = checkout_res.json()["session_id"]
        
        # Query status - this proves transaction was created
        status_res = self.session.get(f"{BASE_URL}/api/payments/status/{session_id}")
        assert status_res.status_code == 200, "Transaction not found - checkout didn't create it"
        
        data = status_res.json()
        # New transaction should be pending
        assert data["payment_status"] in ["pending", "unpaid"], f"Expected pending status, got {data['payment_status']}"
        assert data["amount"] == 50.0
        
        print(f"✓ Checkout created pending transaction: status={data['payment_status']}, amount={data['amount']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
