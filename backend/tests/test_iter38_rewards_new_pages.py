"""
Iteration 38 Tests - New Admin Pages (Rewards, Documents, Disputes, WalletRequests, Settlements)
Tests:
- GET /api/health
- PUT /api/admin/service-config/rewards (save rewards config)
- GET /api/admin/service-config/rewards (retrieve saved config)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthEndpoint:
    """Health check endpoint"""
    
    def test_health_returns_ok(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("✓ GET /api/health returns {status: ok}")


class TestRewardsConfig:
    """Rewards configuration endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin before each test"""
        self.session = requests.Session()
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@superapp.com", "password": os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")}
        )
        assert login_response.status_code == 200, f"Admin login failed: {login_response.text}"
        self.token = login_response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        print("✓ Admin login successful")
    
    def test_put_rewards_config(self):
        """Test saving rewards configuration"""
        test_config = {
            "settings": {
                "config": {
                    "enabled": True,
                    "points_per_ride": 10,
                    "points_per_euro": 1,
                    "points_per_referral": 50,
                    "points_per_review": 5,
                    "min_redeem": 100,
                    "point_value_eur": 0.01,
                    "driver_bonus_per_trip": 2,
                    "driver_weekly_target": 50,
                    "driver_weekly_bonus": 25
                },
                "tiers": [
                    {"id": "t1", "name": "Bronze", "min_points": 0, "discount_pct": 0, "color": "#CD7F32", "perks": "Acces standard"},
                    {"id": "t2", "name": "Argent", "min_points": 500, "discount_pct": 5, "color": "#C0C0C0", "perks": "5% reduction"},
                    {"id": "t3", "name": "Or", "min_points": 2000, "discount_pct": 10, "color": "#FFD700", "perks": "10% reduction"},
                    {"id": "t4", "name": "Platine", "min_points": 5000, "discount_pct": 15, "color": "#E5E4E2", "perks": "15% reduction"}
                ]
            }
        }
        
        response = self.session.put(
            f"{BASE_URL}/api/admin/service-config/rewards",
            json=test_config
        )
        assert response.status_code == 200, f"PUT rewards config failed: {response.text}"
        data = response.json()
        assert "message" in data
        print("✓ PUT /api/admin/service-config/rewards saves config successfully")
    
    def test_get_rewards_config(self):
        """Test retrieving rewards configuration"""
        response = self.session.get(f"{BASE_URL}/api/admin/service-config/rewards")
        assert response.status_code == 200, f"GET rewards config failed: {response.text}"
        data = response.json()
        
        # Verify structure
        assert "service_key" in data
        assert data["service_key"] == "rewards"
        assert "settings" in data
        
        # Verify settings contain config and tiers
        settings = data.get("settings", {})
        assert "config" in settings or settings == {}, "Settings should contain config or be empty"
        
        print("✓ GET /api/admin/service-config/rewards returns saved config")
    
    def test_rewards_config_persistence(self):
        """Test that saved config persists correctly"""
        # Save specific config
        unique_value = 42
        test_config = {
            "settings": {
                "config": {"enabled": True, "points_per_ride": unique_value},
                "tiers": [{"id": "test_tier", "name": "Test", "min_points": 0}]
            }
        }
        
        put_response = self.session.put(
            f"{BASE_URL}/api/admin/service-config/rewards",
            json=test_config
        )
        assert put_response.status_code == 200
        
        # Retrieve and verify
        get_response = self.session.get(f"{BASE_URL}/api/admin/service-config/rewards")
        assert get_response.status_code == 200
        data = get_response.json()
        
        settings = data.get("settings", {})
        config = settings.get("config", {})
        assert config.get("points_per_ride") == unique_value, f"Expected {unique_value}, got {config.get('points_per_ride')}"
        
        tiers = settings.get("tiers", [])
        assert len(tiers) >= 1
        assert tiers[0].get("id") == "test_tier"
        
        print("✓ Rewards config persists correctly (Create → GET verification)")


class TestAdminAuth:
    """Test admin authentication for protected endpoints"""
    
    def test_rewards_config_requires_auth(self):
        """Test that rewards config endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/service-config/rewards")
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Rewards config endpoint requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
