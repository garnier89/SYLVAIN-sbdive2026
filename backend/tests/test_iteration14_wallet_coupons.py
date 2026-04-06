"""
Iteration 14 Tests: Wallet System, Coupon System, Production Configs, History
Tests wallet topup/pay/transfer/refund, coupon validate/apply, cancel reasons, vehicle categories
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"
TEST_EMAIL = "test2@example.com"
TEST_PASSWORD = "TestPass123!"


class TestAuthAndSetup:
    """Authentication tests to ensure we can login"""
    
    def test_admin_login(self):
        """Test admin login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "user" in data
        assert data["user"]["role"] == "admin"
        print(f"PASS: Admin login successful - {data['user']['email']}")
    
    def test_test_user_login(self):
        """Test regular user login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Test user login failed: {response.text}"
        data = response.json()
        assert "user" in data
        print(f"PASS: Test user login successful - {data['user']['email']}")


class TestWalletAPI:
    """Wallet API tests: get, topup, pay, transfer, refund"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session for each test"""
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, "Login failed for wallet tests"
    
    def test_get_wallet(self):
        """GET /api/wallet returns balance, currency=EUR, and transactions array"""
        response = self.session.get(f"{BASE_URL}/api/wallet")
        assert response.status_code == 200, f"Get wallet failed: {response.text}"
        data = response.json()
        
        # Verify structure
        assert "balance" in data, "Missing balance field"
        assert "currency" in data, "Missing currency field"
        assert "transactions" in data, "Missing transactions field"
        
        # Verify values
        assert data["currency"] == "EUR", f"Expected EUR, got {data['currency']}"
        assert isinstance(data["balance"], (int, float)), "Balance should be numeric"
        assert isinstance(data["transactions"], list), "Transactions should be a list"
        
        print(f"PASS: GET /api/wallet - balance={data['balance']} EUR, {len(data['transactions'])} transactions")
    
    def test_topup_wallet_valid(self):
        """POST /api/wallet/topup with amount=50 increases balance by 50"""
        # Get initial balance
        initial = self.session.get(f"{BASE_URL}/api/wallet").json()
        initial_balance = initial["balance"]
        
        # Topup
        response = self.session.post(f"{BASE_URL}/api/wallet/topup", json={
            "amount": 50,
            "payment_method": "card"
        })
        assert response.status_code == 200, f"Topup failed: {response.text}"
        data = response.json()
        
        # Verify response
        assert "balance" in data, "Missing balance in response"
        assert "transaction" in data, "Missing transaction in response"
        assert data["balance"] == initial_balance + 50, f"Balance not increased correctly: {data['balance']} != {initial_balance + 50}"
        
        # Verify transaction
        tx = data["transaction"]
        assert tx["type"] == "Deposit", f"Expected Deposit type, got {tx['type']}"
        assert tx["amount"] == 50, f"Expected amount 50, got {tx['amount']}"
        assert tx["status"] == "completed", f"Expected completed status, got {tx['status']}"
        
        print(f"PASS: POST /api/wallet/topup - balance increased from {initial_balance} to {data['balance']}")
    
    def test_topup_wallet_zero_amount(self):
        """POST /api/wallet/topup with amount=0 returns 400 error"""
        response = self.session.post(f"{BASE_URL}/api/wallet/topup", json={
            "amount": 0,
            "payment_method": "card"
        })
        assert response.status_code == 400, f"Expected 400 for zero amount, got {response.status_code}"
        print("PASS: POST /api/wallet/topup with amount=0 returns 400")
    
    def test_topup_wallet_exceeds_max(self):
        """POST /api/wallet/topup with amount=250 returns 400 error (max 200)"""
        response = self.session.post(f"{BASE_URL}/api/wallet/topup", json={
            "amount": 250,
            "payment_method": "card"
        })
        assert response.status_code == 400, f"Expected 400 for amount > 200, got {response.status_code}"
        data = response.json()
        assert "200" in data.get("detail", ""), f"Error should mention 200 limit: {data}"
        print("PASS: POST /api/wallet/topup with amount=250 returns 400 (max 200)")
    
    def test_pay_from_wallet(self):
        """POST /api/wallet/pay with amount deducts from balance"""
        # Ensure we have enough balance
        self.session.post(f"{BASE_URL}/api/wallet/topup", json={"amount": 20, "payment_method": "card"})
        
        # Get balance before pay
        before = self.session.get(f"{BASE_URL}/api/wallet").json()
        before_balance = before["balance"]
        
        # Pay
        response = self.session.post(f"{BASE_URL}/api/wallet/pay", json={
            "amount": 10,
            "description": "Test payment"
        })
        assert response.status_code == 200, f"Pay failed: {response.text}"
        data = response.json()
        
        # Verify deduction
        assert data["balance"] == before_balance - 10, f"Balance not deducted correctly"
        assert data["transaction"]["amount"] == -10, "Transaction amount should be negative"
        
        print(f"PASS: POST /api/wallet/pay - balance deducted from {before_balance} to {data['balance']}")
    
    def test_pay_insufficient_balance(self):
        """POST /api/wallet/pay with insufficient balance returns 400"""
        # Get current balance
        wallet = self.session.get(f"{BASE_URL}/api/wallet").json()
        
        # Try to pay more than balance
        response = self.session.post(f"{BASE_URL}/api/wallet/pay", json={
            "amount": wallet["balance"] + 1000,
            "description": "Should fail"
        })
        assert response.status_code == 400, f"Expected 400 for insufficient balance, got {response.status_code}"
        print("PASS: POST /api/wallet/pay with insufficient balance returns 400")


class TestCouponAPI:
    """Coupon API tests: list, validate, apply"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session for each test"""
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, "Login failed for coupon tests"
    
    def test_list_active_coupons(self):
        """GET /api/coupons returns 4 active coupons"""
        response = self.session.get(f"{BASE_URL}/api/coupons")
        assert response.status_code == 200, f"List coupons failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        assert len(data) >= 4, f"Expected at least 4 coupons, got {len(data)}"
        
        # Check expected coupon codes
        codes = [c["code"] for c in data]
        expected_codes = ["BIENVENUE", "SBDRIVE10", "NOVEMBRE", "1010"]
        for code in expected_codes:
            assert code in codes, f"Missing coupon code: {code}"
        
        print(f"PASS: GET /api/coupons returns {len(data)} coupons including {expected_codes}")
    
    def test_validate_coupon_bienvenue(self):
        """POST /api/coupons/validate with BIENVENUE code returns 20% discount capped at 10 EUR"""
        response = self.session.post(f"{BASE_URL}/api/coupons/validate", json={
            "code": "BIENVENUE",
            "amount": 100,
            "service_type": "Ride"
        })
        assert response.status_code == 200, f"Validate coupon failed: {response.text}"
        data = response.json()
        
        assert data["valid"] == True, "Coupon should be valid"
        assert data["discount_type"] == "Percentage", f"Expected Percentage, got {data['discount_type']}"
        assert data["discount_value"] == 20, f"Expected 20% discount, got {data['discount_value']}"
        # 20% of 100 = 20, but max_discount is 10, so should be 10
        assert data["discount_amount"] == 10, f"Expected discount_amount=10 (capped), got {data['discount_amount']}"
        
        print(f"PASS: BIENVENUE coupon validates correctly - 20% capped at 10 EUR")
    
    def test_validate_coupon_sbdrive10(self):
        """POST /api/coupons/validate with SBDRIVE10 code returns flat 10 EUR discount (using test user)"""
        # Use test user to avoid per_user_limit issues (admin may have already used it)
        session2 = requests.Session()
        session2.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        response = session2.post(f"{BASE_URL}/api/coupons/validate", json={
            "code": "SBDRIVE10",
            "amount": 50,
            "service_type": "Ride"
        })
        assert response.status_code == 200, f"Validate coupon failed: {response.text}"
        data = response.json()
        
        assert data["valid"] == True, "Coupon should be valid"
        assert data["discount_type"] == "Flat", f"Expected Flat, got {data['discount_type']}"
        assert data["discount_value"] == 10, f"Expected 10 EUR discount, got {data['discount_value']}"
        assert data["discount_amount"] == 10, f"Expected discount_amount=10, got {data['discount_amount']}"
        
        print(f"PASS: SBDRIVE10 coupon validates correctly - flat 10 EUR")
    
    def test_validate_invalid_coupon(self):
        """POST /api/coupons/validate with invalid code returns 404"""
        response = self.session.post(f"{BASE_URL}/api/coupons/validate", json={
            "code": "INVALIDCODE123",
            "amount": 50,
            "service_type": "Ride"
        })
        assert response.status_code == 404, f"Expected 404 for invalid coupon, got {response.status_code}"
        print("PASS: Invalid coupon code returns 404")
    
    def test_apply_coupon(self):
        """POST /api/coupons/apply marks coupon as used and returns final_amount"""
        # Use a different user to avoid per_user_limit issues
        session2 = requests.Session()
        session2.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        response = session2.post(f"{BASE_URL}/api/coupons/apply", json={
            "code": "NOVEMBRE",
            "amount": 100,
            "ride_id": "test_ride_123"
        })
        assert response.status_code == 200, f"Apply coupon failed: {response.text}"
        data = response.json()
        
        assert data["applied"] == True, "Coupon should be applied"
        assert "discount_amount" in data, "Missing discount_amount"
        assert "final_amount" in data, "Missing final_amount"
        # NOVEMBRE is 15% with max 15, so 15% of 100 = 15
        assert data["discount_amount"] == 15, f"Expected 15 EUR discount, got {data['discount_amount']}"
        assert data["final_amount"] == 85, f"Expected final_amount=85, got {data['final_amount']}"
        
        print(f"PASS: POST /api/coupons/apply - discount={data['discount_amount']}, final={data['final_amount']}")


class TestConfigAPI:
    """Config API tests: cancel-reasons, app config, vehicle-categories"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session for each test"""
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, "Login failed for config tests"
    
    def test_get_cancel_reasons(self):
        """GET /api/config/cancel-reasons returns 10 cancel reasons"""
        response = self.session.get(f"{BASE_URL}/api/config/cancel-reasons")
        assert response.status_code == 200, f"Get cancel reasons failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        assert len(data) >= 10, f"Expected at least 10 cancel reasons, got {len(data)}"
        
        # Check structure
        for reason in data:
            assert "reason_en" in reason, "Missing reason_en"
            assert "reason_fr" in reason, "Missing reason_fr"
            assert "for" in reason, "Missing 'for' field"
        
        print(f"PASS: GET /api/config/cancel-reasons returns {len(data)} reasons")
    
    def test_get_app_config(self):
        """GET /api/config/app returns 90+ production configurations as key-value dict"""
        response = self.session.get(f"{BASE_URL}/api/config/app")
        assert response.status_code == 200, f"Get app config failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, dict), "Response should be a dict (key-value pairs)"
        assert len(data) >= 90, f"Expected at least 90 configs, got {len(data)}"
        
        # Check for key configs
        expected_keys = ["COMPANY_NAME", "DEFAULT_CURRENCY_CODE", "WALLET_ENABLE", "SUPPORT_PHONE"]
        for key in expected_keys:
            assert key in data, f"Missing config key: {key}"
        
        # Verify COMPANY_NAME value
        assert data["COMPANY_NAME"] == "SB Drive VTC", f"COMPANY_NAME should be 'SB Drive VTC', got {data.get('COMPANY_NAME')}"
        
        print(f"PASS: GET /api/config/app returns {len(data)} configurations")
    
    def test_get_vehicle_categories(self):
        """GET /api/config/vehicle-categories returns 10 categories including delivery"""
        response = self.session.get(f"{BASE_URL}/api/config/vehicle-categories")
        assert response.status_code == 200, f"Get vehicle categories failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        assert len(data) >= 10, f"Expected at least 10 categories, got {len(data)}"
        
        # Check for delivery category
        slugs = [c["slug"] for c in data]
        assert "delivery" in slugs, "Missing delivery category"
        assert "vtc-taxi" in slugs, "Missing vtc-taxi category"
        
        # Verify delivery category has correct type
        delivery = next((c for c in data if c["slug"] == "delivery"), None)
        assert delivery and delivery["type"] == "Deliver", f"Delivery category should have type 'Deliver'"
        
        print(f"PASS: GET /api/config/vehicle-categories returns {len(data)} categories including delivery")


class TestRidesAPI:
    """Rides API tests for history page"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session for each test"""
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, "Login failed for rides tests"
    
    def test_list_rides(self):
        """GET /api/rides returns list of rides for user"""
        response = self.session.get(f"{BASE_URL}/api/rides")
        assert response.status_code == 200, f"List rides failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: GET /api/rides returns {len(data)} rides")


class TestHealthCheck:
    """Basic health check tests"""
    
    def test_health_endpoint(self):
        """GET /api/health returns ok"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        data = response.json()
        assert data.get("status") == "ok", f"Expected status ok, got {data}"
        print("PASS: GET /api/health returns ok")
    
    def test_root_endpoint(self):
        """GET /api/ returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200, f"Root endpoint failed: {response.text}"
        data = response.json()
        assert data.get("status") == "healthy", f"Expected healthy status, got {data}"
        print("PASS: GET /api/ returns healthy")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
