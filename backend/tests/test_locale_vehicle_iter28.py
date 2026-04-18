"""
Iteration 28 Backend Tests - Locale/Currency and Vehicle Types
Tests for:
1. GET /api/config/vehicle-types - 10 vehicle types (sb, confort, luxe, moto, pool, suv, electric, van, accessible, airport)
2. Existing APIs still working (health, video-consult, bidding, intercity, parking, giftcards)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestVehicleTypesAPI:
    """Tests for GET /api/config/vehicle-types endpoint"""
    
    def test_vehicle_types_returns_10_types(self):
        """Verify endpoint returns exactly 10 vehicle types"""
        response = requests.get(f"{BASE_URL}/api/config/vehicle-types")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) == 10, f"Expected 10 vehicle types, got {len(data)}"
    
    def test_vehicle_types_slugs(self):
        """Verify all expected vehicle type slugs are present"""
        response = requests.get(f"{BASE_URL}/api/config/vehicle-types")
        assert response.status_code == 200
        
        data = response.json()
        slugs = [v['slug'] for v in data]
        
        expected_slugs = ['sb', 'confort', 'luxe', 'moto', 'pool', 'suv', 'electric', 'van', 'accessible', 'airport']
        for slug in expected_slugs:
            assert slug in slugs, f"Missing vehicle type slug: {slug}"
    
    def test_vehicle_types_structure(self):
        """Verify each vehicle type has required fields"""
        response = requests.get(f"{BASE_URL}/api/config/vehicle-types")
        assert response.status_code == 200
        
        data = response.json()
        required_fields = ['slug', 'name_fr', 'person_capacity', 'min_fare', 'base_fare', 'price_per_km', 'price_per_min', 'icon_type']
        
        for vehicle in data:
            for field in required_fields:
                assert field in vehicle, f"Vehicle {vehicle.get('slug', 'unknown')} missing field: {field}"
    
    def test_vehicle_types_airport_fixed_fare(self):
        """Verify airport type has fixed fare"""
        response = requests.get(f"{BASE_URL}/api/config/vehicle-types")
        assert response.status_code == 200
        
        data = response.json()
        airport = next((v for v in data if v['slug'] == 'airport'), None)
        
        assert airport is not None, "Airport vehicle type not found"
        assert airport['fare_type'] == 'Fixed', f"Airport should have Fixed fare type, got {airport.get('fare_type')}"
        assert airport['fixed_fare'] == 55.0, f"Airport fixed fare should be 55.0, got {airport.get('fixed_fare')}"


class TestExistingAPIs:
    """Tests to verify existing APIs still work"""
    
    def test_health_endpoint(self):
        """Verify health endpoint returns ok"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'ok', f"Health status should be 'ok', got {data.get('status')}"
    
    def test_video_consult_providers(self):
        """Verify video consult providers endpoint works"""
        response = requests.get(f"{BASE_URL}/api/video-consult/providers")
        assert response.status_code == 200
        
        data = response.json()
        assert 'providers' in data, "Response should have 'providers' key"
        assert len(data['providers']) > 0, "Should have at least one provider"
    
    def test_bidding_categories(self):
        """Verify bidding categories endpoint works"""
        response = requests.get(f"{BASE_URL}/api/bidding/categories")
        assert response.status_code == 200
        
        data = response.json()
        assert 'categories' in data, "Response should have 'categories' key"
        assert len(data['categories']) > 0, "Should have at least one category"
    
    def test_intercity_routes(self):
        """Verify intercity routes endpoint works"""
        response = requests.get(f"{BASE_URL}/api/intercity/routes")
        assert response.status_code == 200
        
        data = response.json()
        assert 'routes' in data, "Response should have 'routes' key"
        assert len(data['routes']) >= 6, f"Should have at least 6 routes, got {len(data['routes'])}"
    
    def test_parking_spots(self):
        """Verify parking spots endpoint works"""
        response = requests.get(f"{BASE_URL}/api/parking/spots")
        assert response.status_code == 200
        
        data = response.json()
        assert 'spots' in data, "Response should have 'spots' key"
        assert len(data['spots']) >= 4, f"Should have at least 4 spots, got {len(data['spots'])}"
    
    def test_giftcards_templates(self):
        """Verify giftcards templates endpoint works"""
        response = requests.get(f"{BASE_URL}/api/giftcards/templates")
        assert response.status_code == 200
        
        data = response.json()
        assert 'templates' in data, "Response should have 'templates' key"
        assert len(data['templates']) >= 5, f"Should have at least 5 templates, got {len(data['templates'])}"


class TestAuthLogin:
    """Test authentication for frontend testing"""
    
    def test_login_with_test_user(self):
        """Verify test user can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test2@example.com",
            "password": "TestPass123!"
        })
        assert response.status_code == 200, f"Login failed with status {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'user' in data, "Response should have 'user' key"
        assert data['user']['email'] == 'test2@example.com', "User email should match"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
