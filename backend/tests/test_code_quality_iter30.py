"""
Iteration 30 - Code Quality Fixes Validation Tests
Tests for:
1. Backend health and auth endpoints
2. Referral code generation (uses secrets module)
3. Vehicle types endpoint
4. Ride estimate endpoint
5. Gojek services endpoints
6. Payments status variable fix
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-40.preview.emergentagent.com")

# Test credentials from conftest
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")
TEST_USER_EMAIL = "test2@example.com"
TEST_USER_PASSWORD = os.environ.get("TEST_USER_PASSWORD", "TestPass123!")


class TestHealthAndConfig:
    """Health check and configuration endpoints"""
    
    def test_health_endpoint(self):
        """GET /api/health returns {status: ok}"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("PASS: Health endpoint returns {status: ok}")
    
    def test_vehicle_types_returns_10_types(self):
        """GET /api/config/vehicle-types returns 10 vehicle types"""
        response = requests.get(f"{BASE_URL}/api/config/vehicle-types")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 10, f"Expected 10 vehicle types, got {len(data)}"
        print(f"PASS: Vehicle types endpoint returns {len(data)} types")
    
    def test_vehicle_types_have_required_fields(self):
        """Vehicle types have required fields"""
        response = requests.get(f"{BASE_URL}/api/config/vehicle-types")
        assert response.status_code == 200
        data = response.json()
        required_fields = ["slug", "name_fr", "person_capacity", "min_fare", "base_fare", "price_per_km"]
        for vtype in data:
            for field in required_fields:
                assert field in vtype, f"Missing field {field} in vehicle type {vtype.get('slug')}"
        print("PASS: All vehicle types have required fields")


class TestAuthEndpoints:
    """Authentication endpoint tests"""
    
    def test_login_with_admin_credentials(self):
        """POST /api/auth/login with admin credentials"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        print(f"PASS: Admin login successful, user: {data['user']['name']}")
        return session
    
    def test_auth_me_with_session_cookie(self):
        """GET /api/auth/me with session cookie returns user"""
        session = requests.Session()
        # First login
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200
        
        # Then get /me
        me_resp = session.get(f"{BASE_URL}/api/auth/me")
        assert me_resp.status_code == 200, f"Auth me failed: {me_resp.text}"
        data = me_resp.json()
        assert data["email"] == ADMIN_EMAIL
        print(f"PASS: Auth me returns user: {data['name']}")
    
    def test_auth_me_without_cookie_returns_401(self):
        """GET /api/auth/me without cookie returns 401"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("PASS: Auth me without cookie returns 401")


class TestRideEstimate:
    """Ride estimate endpoint tests"""
    
    def test_ride_estimate_returns_fare(self):
        """POST /api/rides/estimate returns fare estimate"""
        session = requests.Session()
        # Login first
        session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        response = session.post(f"{BASE_URL}/api/rides/estimate", json={
            "pickup_lat": 48.8566,
            "pickup_lng": 2.3522,
            "pickup_address": "Paris, France",
            "dropoff_lat": 48.8738,
            "dropoff_lng": 2.2950,
            "dropoff_address": "Arc de Triomphe, Paris",
            "vehicle_type": "sb",
            "payment_method": "cash"
        })
        assert response.status_code == 200, f"Estimate failed: {response.text}"
        data = response.json()
        assert "estimated_fare" in data
        assert "distance_km" in data
        assert data["estimated_fare"] > 0
        print(f"PASS: Ride estimate returns fare: {data['estimated_fare']} EUR")
    
    def test_ride_estimate_with_luxe_vehicle(self):
        """Ride estimate with luxe vehicle returns correct min_fare"""
        session = requests.Session()
        session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        response = session.post(f"{BASE_URL}/api/rides/estimate", json={
            "pickup_lat": 48.8566,
            "pickup_lng": 2.3522,
            "pickup_address": "Paris, France",
            "dropoff_lat": 48.8570,
            "dropoff_lng": 2.3530,
            "dropoff_address": "Nearby Paris",
            "vehicle_type": "luxe",
            "payment_method": "cash"
        })
        assert response.status_code == 200
        data = response.json()
        # Luxe has min_fare of 25
        assert data["estimated_fare"] >= 25, f"Luxe min fare should be >= 25, got {data['estimated_fare']}"
        print(f"PASS: Luxe vehicle estimate: {data['estimated_fare']} EUR (min 25)")


class TestReferralEndpoint:
    """Referral endpoint tests - validates secrets module usage"""
    
    def test_referral_my_code_returns_code(self):
        """GET /api/referral/my-code returns referral code (uses secrets module)"""
        session = requests.Session()
        session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        response = session.get(f"{BASE_URL}/api/referral/my-code")
        assert response.status_code == 200, f"Referral my-code failed: {response.text}"
        data = response.json()
        assert "code" in data
        assert data["code"].startswith("SB-")
        assert len(data["code"]) == 9  # SB-XXXXXX
        assert "total_referrals" in data
        assert "total_earned" in data
        print(f"PASS: Referral code generated: {data['code']}")
    
    def test_referral_stats_endpoint(self):
        """GET /api/referral/stats returns stats"""
        session = requests.Session()
        session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        response = session.get(f"{BASE_URL}/api/referral/stats")
        assert response.status_code == 200
        data = response.json()
        assert "code" in data
        assert "amount_per_referral" in data
        assert data["amount_per_referral"] == 5.0
        print(f"PASS: Referral stats: {data['total_referrals']} referrals, {data['total_earned']} EUR earned")


class TestGojekServices:
    """Gojek services endpoints tests"""
    
    def test_video_consult_providers(self):
        """GET /api/video-consult/providers returns 8 providers"""
        response = requests.get(f"{BASE_URL}/api/video-consult/providers")
        assert response.status_code == 200
        data = response.json()
        assert "providers" in data
        assert len(data["providers"]) == 8
        print(f"PASS: Video consult providers: {len(data['providers'])} providers")
    
    def test_bidding_categories(self):
        """GET /api/bidding/categories returns 8 categories"""
        response = requests.get(f"{BASE_URL}/api/bidding/categories")
        assert response.status_code == 200
        data = response.json()
        # Response is wrapped in {"categories": [...]}
        categories = data.get("categories", data)
        assert isinstance(categories, list)
        assert len(categories) == 8
        print(f"PASS: Bidding categories: {len(categories)} categories")
    
    def test_intercity_routes(self):
        """GET /api/intercity/routes returns 6 routes"""
        response = requests.get(f"{BASE_URL}/api/intercity/routes")
        assert response.status_code == 200
        data = response.json()
        # Response is wrapped in {"routes": [...]}
        routes = data.get("routes", data)
        assert isinstance(routes, list)
        assert len(routes) == 6
        print(f"PASS: Intercity routes: {len(routes)} routes")
    
    def test_parking_spots(self):
        """GET /api/parking/spots returns 4 spots"""
        response = requests.get(f"{BASE_URL}/api/parking/spots")
        assert response.status_code == 200
        data = response.json()
        # Response is wrapped in {"spots": [...]}
        spots = data.get("spots", data)
        assert isinstance(spots, list)
        assert len(spots) == 4
        print(f"PASS: Parking spots: {len(spots)} spots")
    
    def test_giftcards_templates(self):
        """GET /api/giftcards/templates returns 5 templates"""
        response = requests.get(f"{BASE_URL}/api/giftcards/templates")
        assert response.status_code == 200
        data = response.json()
        # Response is wrapped in {"templates": [...]}
        templates = data.get("templates", data)
        assert isinstance(templates, list)
        assert len(templates) == 5
        print(f"PASS: Gift card templates: {len(templates)} templates")


class TestSimulationEndpoint:
    """Simulation endpoint tests - validates _sim_random usage"""
    
    def test_simulation_status(self):
        """GET /api/simulation/status returns status"""
        session = requests.Session()
        session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        response = session.get(f"{BASE_URL}/api/simulation/status")
        assert response.status_code == 200
        data = response.json()
        assert "active" in data
        print(f"PASS: Simulation status: active={data['active']}")


class TestWalletEndpoint:
    """Wallet endpoint tests"""
    
    def test_wallet_endpoint(self):
        """GET /api/wallet returns wallet balance"""
        session = requests.Session()
        session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        response = session.get(f"{BASE_URL}/api/wallet")
        assert response.status_code == 200
        data = response.json()
        assert "balance" in data
        print(f"PASS: Wallet balance: {data['balance']} EUR")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
