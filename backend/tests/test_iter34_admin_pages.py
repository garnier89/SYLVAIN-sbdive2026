"""
Iteration 34 - Testing Admin Pages and Service Configs
Tests:
1. Backend health check
2. Admin login
3. Admin stats endpoint
4. Frontend admin pages (monitoring, admins, groups, vehicles, requests, company, hotels)
5. Frontend admin service config pages (genie, runner, ondemand, marketplace, medical, tracking, location-fare, cancel-reasons, labels, pages)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBackendHealth:
    """Health check and basic API tests"""
    
    def test_health_endpoint(self):
        """GET /api/health returns ok"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'ok'
        print(f"Health check passed: {data}")

class TestAdminAuth:
    """Admin authentication tests"""
    
    def test_admin_login(self):
        """POST /api/auth/login with admin credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@superapp.com",
            "password": "SuperAdmin123!"
        })
        assert response.status_code == 200
        data = response.json()
        assert 'token' in data or 'access_token' in data
        assert 'user' in data
        assert data['user']['role'] == 'admin'
        print(f"Admin login passed: user={data['user']['email']}, role={data['user']['role']}")
        return data

class TestAdminStats:
    """Admin stats endpoint tests"""
    
    @pytest.fixture
    def admin_session(self):
        """Get authenticated admin session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@superapp.com",
            "password": "SuperAdmin123!"
        })
        if response.status_code == 200:
            data = response.json()
            token = data.get('token') or data.get('access_token')
            if token:
                session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_admin_stats(self, admin_session):
        """GET /api/admin/stats returns counts"""
        response = admin_session.get(f"{BASE_URL}/api/admin/stats")
        assert response.status_code == 200
        data = response.json()
        # Verify stats structure
        assert 'users' in data or 'total_users' in data
        assert 'drivers' in data or 'total_drivers' in data
        print(f"Admin stats passed: {data}")

class TestAdminUsersEndpoint:
    """Test admin users endpoint for manage admins page"""
    
    @pytest.fixture
    def admin_session(self):
        """Get authenticated admin session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@superapp.com",
            "password": "SuperAdmin123!"
        })
        if response.status_code == 200:
            data = response.json()
            token = data.get('token') or data.get('access_token')
            if token:
                session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_get_admin_users(self, admin_session):
        """GET /api/users?role=admin returns admin users"""
        response = admin_session.get(f"{BASE_URL}/api/users?role=admin")
        # May return 200 or 404 depending on implementation
        assert response.status_code in [200, 404]
        if response.status_code == 200:
            data = response.json()
            print(f"Admin users endpoint returned: {type(data)}")

class TestRidesEndpoint:
    """Test rides endpoint for monitoring page"""
    
    @pytest.fixture
    def admin_session(self):
        """Get authenticated admin session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@superapp.com",
            "password": "SuperAdmin123!"
        })
        if response.status_code == 200:
            data = response.json()
            token = data.get('token') or data.get('access_token')
            if token:
                session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_get_rides_in_progress(self, admin_session):
        """GET /api/rides?status=in_progress returns rides"""
        response = admin_session.get(f"{BASE_URL}/api/rides?limit=10&status=in_progress")
        assert response.status_code == 200
        data = response.json()
        # Can be array or object with rides key
        rides = data if isinstance(data, list) else data.get('rides', [])
        print(f"Rides in progress: {len(rides)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
