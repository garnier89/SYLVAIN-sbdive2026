"""
Iteration 41 - Testing Rewards Page and Dashboard Live Clock
Tests:
1. Backend: GET /api/health returns ok
2. Backend: PUT /api/admin/service-config/rewards saves tier settings
3. Backend: GET /api/admin/analytics returns real data
4. Frontend: Dashboard shows live clock with date and timezone
5. Frontend: Dashboard has period selector (Aujourd'hui/Semaine/Mois)
6. Frontend: Dashboard has 5 KPI cards with real data
7. Frontend: /admin/rewards loads with Reports and Settings tabs
8. Frontend: Rewards Settings tab shows accordion tiers (Silver/Gold/Platinum)
9. Frontend: Rewards Reports tab shows table with Level/Trip/Acceptance Rate columns
10. Frontend: Sidebar has 'Manage Rewards' section with Reports and Settings links
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthEndpoint:
    """Health check endpoint tests"""
    
    def test_health_returns_ok(self):
        """GET /api/health returns {status: ok}"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("PASS: GET /api/health returns {status: ok}")


class TestRewardsServiceConfig:
    """Rewards service config endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@superapp.com",
            "password": "SuperAdmin123!"
        })
        if response.status_code == 200:
            return response.cookies.get("access_token") or response.json().get("access_token")
        pytest.skip("Admin login failed")
    
    @pytest.fixture
    def auth_session(self, auth_token):
        """Session with auth cookies"""
        session = requests.Session()
        session.cookies.set("access_token", auth_token)
        return session
    
    def test_get_rewards_config_without_auth(self):
        """GET /api/admin/service-config/rewards without auth returns 401"""
        response = requests.get(f"{BASE_URL}/api/admin/service-config/rewards")
        assert response.status_code == 401
        print("PASS: GET /api/admin/service-config/rewards without auth returns 401")
    
    def test_get_rewards_config_with_auth(self, auth_session):
        """GET /api/admin/service-config/rewards with auth returns 200"""
        response = auth_session.get(f"{BASE_URL}/api/admin/service-config/rewards")
        assert response.status_code == 200
        data = response.json()
        assert "service_key" in data or "settings" in data
        print(f"PASS: GET /api/admin/service-config/rewards returns 200 with data: {data}")
    
    def test_put_rewards_config_saves_tiers(self, auth_session):
        """PUT /api/admin/service-config/rewards saves tier settings"""
        test_tiers = {
            "settings": {
                "tiers": [
                    {"id": "t1", "level": "Silver", "status": "Active", "min_trips": 10, "ratings": 4.0, "cancellation_rate": 30, "acceptance_rate": 70, "reward_amount": 50},
                    {"id": "t2", "level": "Gold", "status": "Active", "min_trips": 25, "ratings": 4.5, "cancellation_rate": 20, "acceptance_rate": 80, "reward_amount": 100},
                    {"id": "t3", "level": "Platinum", "status": "Active", "min_trips": 50, "ratings": 4.7, "cancellation_rate": 10, "acceptance_rate": 90, "reward_amount": 200},
                ],
                "campaign": "User rewards"
            }
        }
        response = auth_session.put(
            f"{BASE_URL}/api/admin/service-config/rewards",
            json=test_tiers
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"PASS: PUT /api/admin/service-config/rewards saves tiers - {data}")
        
        # Verify saved data
        get_response = auth_session.get(f"{BASE_URL}/api/admin/service-config/rewards")
        assert get_response.status_code == 200
        saved_data = get_response.json()
        assert "settings" in saved_data
        assert "tiers" in saved_data["settings"]
        assert len(saved_data["settings"]["tiers"]) == 3
        print(f"PASS: Verified saved tiers count: {len(saved_data['settings']['tiers'])}")


class TestAnalyticsEndpoint:
    """Analytics endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@superapp.com",
            "password": "SuperAdmin123!"
        })
        if response.status_code == 200:
            return response.cookies.get("access_token") or response.json().get("access_token")
        pytest.skip("Admin login failed")
    
    @pytest.fixture
    def auth_session(self, auth_token):
        """Session with auth cookies"""
        session = requests.Session()
        session.cookies.set("access_token", auth_token)
        return session
    
    def test_analytics_without_auth(self):
        """GET /api/admin/analytics without auth returns 401"""
        response = requests.get(f"{BASE_URL}/api/admin/analytics")
        assert response.status_code == 401
        print("PASS: GET /api/admin/analytics without auth returns 401")
    
    def test_analytics_returns_real_data(self, auth_session):
        """GET /api/admin/analytics returns real data structure"""
        response = auth_session.get(f"{BASE_URL}/api/admin/analytics")
        assert response.status_code == 200
        data = response.json()
        
        # Verify ride_status structure
        assert "ride_status" in data
        assert "in_progress" in data["ride_status"]
        assert "completed" in data["ride_status"]
        assert "cancelled" in data["ride_status"]
        print(f"PASS: Analytics has ride_status: {data['ride_status']}")
        
        # Verify earnings structure
        assert "earnings" in data
        assert "total" in data["earnings"]
        print(f"PASS: Analytics has earnings: {data['earnings']}")
        
        # Verify drivers structure
        assert "drivers" in data
        assert "active" in data["drivers"]
        assert "total" in data["drivers"]
        print(f"PASS: Analytics has drivers: {data['drivers']}")
        
        # Verify recent_rides
        assert "recent_rides" in data
        print(f"PASS: Analytics has recent_rides count: {len(data['recent_rides'])}")


class TestAdminStats:
    """Admin stats endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@superapp.com",
            "password": "SuperAdmin123!"
        })
        if response.status_code == 200:
            return response.cookies.get("access_token") or response.json().get("access_token")
        pytest.skip("Admin login failed")
    
    @pytest.fixture
    def auth_session(self, auth_token):
        """Session with auth cookies"""
        session = requests.Session()
        session.cookies.set("access_token", auth_token)
        return session
    
    def test_stats_returns_counts(self, auth_session):
        """GET /api/admin/stats returns user/driver/ride counts"""
        response = auth_session.get(f"{BASE_URL}/api/admin/stats")
        assert response.status_code == 200
        data = response.json()
        
        assert "users" in data
        assert "drivers" in data
        assert "rides" in data
        assert "orders" in data
        assert "merchants" in data
        print(f"PASS: Stats returns counts - users:{data['users']}, drivers:{data['drivers']}, rides:{data['rides']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
