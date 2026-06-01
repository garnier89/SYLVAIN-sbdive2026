"""
Iteration 39 - Admin Dashboard with Recharts Analytics
Tests: Health endpoint, Admin stats endpoint (authenticated), Admin login
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")


class TestHealthEndpoint:
    """Health check endpoint tests"""
    
    def test_health_returns_ok(self):
        """GET /api/health returns {status: ok}"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print(f"✓ Health check passed: {data}")


class TestAdminAuth:
    """Admin authentication tests"""
    
    def test_admin_login_success(self):
        """POST /api/auth/login with admin credentials returns token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data or "token" in data
        print(f"✓ Admin login successful")
        return data
    
    def test_admin_login_invalid_credentials(self):
        """POST /api/auth/login with wrong credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpassword"
        })
        assert response.status_code in [401, 400]
        print(f"✓ Invalid credentials rejected with status {response.status_code}")


class TestAdminStats:
    """Admin stats endpoint tests - requires authentication"""
    
    @pytest.fixture
    def auth_session(self):
        """Get authenticated session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        token = data.get("access_token") or data.get("token")
        if token:
            session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_admin_stats_unauthenticated(self):
        """GET /api/admin/stats without auth returns 401/403"""
        response = requests.get(f"{BASE_URL}/api/admin/stats")
        assert response.status_code in [401, 403]
        print(f"✓ Unauthenticated stats request rejected with status {response.status_code}")
    
    def test_admin_stats_authenticated(self, auth_session):
        """GET /api/admin/stats with auth returns real counts"""
        response = auth_session.get(f"{BASE_URL}/api/admin/stats")
        assert response.status_code == 200
        data = response.json()
        
        # Verify expected fields exist
        expected_fields = ['users', 'drivers', 'rides', 'orders', 'merchants']
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
            assert isinstance(data[field], (int, float)), f"Field {field} should be numeric"
        
        print(f"✓ Admin stats returned: users={data['users']}, drivers={data['drivers']}, rides={data['rides']}, orders={data['orders']}, merchants={data['merchants']}")
        return data


class TestAdminPages:
    """Test admin page endpoints exist"""
    
    @pytest.fixture
    def auth_session(self):
        """Get authenticated session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        token = data.get("access_token") or data.get("token")
        if token:
            session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_rewards_config_endpoint(self, auth_session):
        """GET /api/admin/service-config/rewards returns config"""
        response = auth_session.get(f"{BASE_URL}/api/admin/service-config/rewards")
        # May return 200 with data or 404 if not configured yet
        assert response.status_code in [200, 404]
        print(f"✓ Rewards config endpoint responded with status {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
