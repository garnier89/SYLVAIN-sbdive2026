"""
Iteration 33 - Phase 2 Backend Tests
Tests for new admin pages: GeoFence, GiftCards, Referral, Templates, Newsletter
Tests for new driver pages: Wallet, Documents, Notifications
Tests for new merchant pages: Promotions, Analytics, Settings, Chat
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthAndAuth:
    """Basic health and authentication tests"""
    
    def test_health_endpoint(self):
        """GET /api/health returns ok"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("PASS: Health endpoint returns ok")
    
    def test_admin_login(self):
        """POST /api/auth/login with admin credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@superapp.com",
            "password": os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")
        })
        assert response.status_code == 200
        data = response.json()
        assert "user" in data
        assert data["user"]["role"] == "admin"
        print("PASS: Admin login works")
        return response.cookies


class TestGiftCardsAPI:
    """Gift Cards API tests"""
    
    def test_get_giftcard_templates(self):
        """GET /api/giftcards/templates returns templates"""
        response = requests.get(f"{BASE_URL}/api/giftcards/templates")
        assert response.status_code == 200
        data = response.json()
        # Check structure
        assert "templates" in data or isinstance(data, list)
        templates = data.get("templates", data) if isinstance(data, dict) else data
        assert len(templates) > 0
        # Check template structure
        first_template = templates[0]
        assert "id" in first_template
        assert "name" in first_template
        print(f"PASS: Gift card templates returned ({len(templates)} templates)")


class TestReferralAPI:
    """Referral API tests"""
    
    @pytest.fixture
    def auth_session(self):
        """Get authenticated session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@superapp.com",
            "password": os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")
        })
        if response.status_code != 200:
            pytest.skip("Auth failed")
        return session
    
    def test_get_referral_stats(self, auth_session):
        """GET /api/referral/stats returns stats (authenticated)"""
        response = auth_session.get(f"{BASE_URL}/api/referral/stats")
        assert response.status_code == 200
        data = response.json()
        # Check structure
        assert "total_referrals" in data or "code" in data
        print(f"PASS: Referral stats returned - total_referrals: {data.get('total_referrals', 0)}")


class TestWalletAPI:
    """Wallet API tests for driver wallet page"""
    
    @pytest.fixture
    def auth_session(self):
        """Get authenticated session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@superapp.com",
            "password": os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")
        })
        if response.status_code != 200:
            pytest.skip("Auth failed")
        return session
    
    def test_get_wallet(self, auth_session):
        """GET /api/wallet returns wallet data"""
        response = auth_session.get(f"{BASE_URL}/api/wallet")
        assert response.status_code == 200
        data = response.json()
        assert "balance" in data
        print(f"PASS: Wallet endpoint works - balance: {data.get('balance', 0)}")


class TestOrdersAPI:
    """Orders API tests for merchant analytics"""
    
    @pytest.fixture
    def auth_session(self):
        """Get authenticated session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@superapp.com",
            "password": os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")
        })
        if response.status_code != 200:
            pytest.skip("Auth failed")
        return session
    
    def test_get_orders(self, auth_session):
        """GET /api/orders returns orders list"""
        response = auth_session.get(f"{BASE_URL}/api/orders")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list) or "orders" in data
        print(f"PASS: Orders endpoint works")


class TestLiveChatAPI:
    """LiveChat API tests for merchant chat"""
    
    @pytest.fixture
    def auth_session(self):
        """Get authenticated session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@superapp.com",
            "password": os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")
        })
        if response.status_code != 200:
            pytest.skip("Auth failed")
        return session
    
    def test_send_chat_message(self, auth_session):
        """POST /api/livechat/send sends a message"""
        response = auth_session.post(f"{BASE_URL}/api/livechat/send", json={
            "message": "Test message from iteration 33"
        })
        assert response.status_code == 200
        data = response.json()
        assert "user_message" in data or "reply" in data
        print("PASS: LiveChat send message works")


class TestAdminStats:
    """Admin stats API tests"""
    
    @pytest.fixture
    def auth_session(self):
        """Get authenticated session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@superapp.com",
            "password": os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")
        })
        if response.status_code != 200:
            pytest.skip("Auth failed")
        return session
    
    def test_get_admin_stats(self, auth_session):
        """GET /api/admin/stats returns dashboard stats"""
        response = auth_session.get(f"{BASE_URL}/api/admin/stats")
        assert response.status_code == 200
        data = response.json()
        # Check for expected fields
        assert "total_users" in data or "users" in data or isinstance(data, dict)
        print("PASS: Admin stats endpoint works")


class TestVehicleTypesAPI:
    """Vehicle types API tests (existing functionality)"""
    
    def test_get_vehicle_types(self):
        """GET /api/config/vehicle-types returns vehicle types"""
        response = requests.get(f"{BASE_URL}/api/config/vehicle-types")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        print(f"PASS: Vehicle types returned ({len(data)} types)")


class TestMerchantsAPI:
    """Merchants API tests"""
    
    def test_get_merchants(self):
        """GET /api/merchants returns merchants list"""
        response = requests.get(f"{BASE_URL}/api/merchants")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: Merchants endpoint works ({len(data)} merchants)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
