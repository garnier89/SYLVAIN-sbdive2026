"""
Iteration 37 - RideBookingPage Google Maps Migration Tests
Tests:
- Backend: POST /api/rides/estimate returns route_polyline and source=google_maps
- Backend: Estimate for Fort-de-France to Aeroport returns real route distance
- Backend: GET /api/health returns ok
- Backend: Login and authenticated endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthEndpoint:
    """Health check endpoint tests"""
    
    def test_health_returns_ok(self):
        """GET /api/health returns status ok"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("✓ Health endpoint returns ok")


class TestRideEstimateGoogleMaps:
    """Ride estimate endpoint with Google Maps integration"""
    
    def test_estimate_returns_google_maps_source(self):
        """POST /api/rides/estimate returns source=google_maps with route_polyline"""
        payload = {
            "pickup_lat": 14.6037,
            "pickup_lng": -61.0699,
            "pickup_address": "Fort-de-France, Martinique",
            "dropoff_lat": 14.5956,
            "dropoff_lng": -60.9958,
            "dropoff_address": "Aeroport Aime Cesaire, Martinique",
            "vehicle_type": "sb",
            "payment_method": "card"
        }
        response = requests.post(f"{BASE_URL}/api/rides/estimate", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        # Verify source is google_maps
        assert data.get("source") == "google_maps", f"Expected source=google_maps, got {data.get('source')}"
        print(f"✓ Estimate source: {data.get('source')}")
        
        # Verify route_polyline is present
        assert "route_polyline" in data, "route_polyline field missing"
        assert len(data["route_polyline"]) > 50, "route_polyline seems too short"
        print(f"✓ Route polyline present (length: {len(data['route_polyline'])})")
        
        # Verify distance and duration
        assert "distance_km" in data
        assert "duration_mins" in data
        assert data["distance_km"] > 5, f"Distance should be > 5km for this route, got {data['distance_km']}"
        print(f"✓ Distance: {data['distance_km']} km, Duration: {data['duration_mins']} mins")
    
    def test_estimate_fort_de_france_to_airport_real_distance(self):
        """Estimate for Fort-de-France to Aeroport returns real route distance (not straight-line)"""
        payload = {
            "pickup_lat": 14.6037,
            "pickup_lng": -61.0699,
            "pickup_address": "Fort-de-France, Martinique",
            "dropoff_lat": 14.5956,
            "dropoff_lng": -60.9958,
            "dropoff_address": "Aeroport Aime Cesaire, Martinique",
            "vehicle_type": "sb",
            "payment_method": "card"
        }
        response = requests.post(f"{BASE_URL}/api/rides/estimate", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        # Straight-line distance is ~8km, road distance should be ~10-12km
        distance = data.get("distance_km", 0)
        assert distance >= 8, f"Distance should be >= 8km (road distance), got {distance}"
        assert distance <= 20, f"Distance should be <= 20km, got {distance}"
        print(f"✓ Fort-de-France to Airport: {distance} km (real road distance)")
    
    def test_estimate_returns_fare_details(self):
        """Estimate returns fare breakdown details"""
        payload = {
            "pickup_lat": 14.6037,
            "pickup_lng": -61.0699,
            "pickup_address": "Fort-de-France",
            "dropoff_lat": 14.5956,
            "dropoff_lng": -60.9958,
            "dropoff_address": "Aeroport",
            "vehicle_type": "sb",
            "payment_method": "card"
        }
        response = requests.post(f"{BASE_URL}/api/rides/estimate", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        # Verify fare fields
        assert "estimated_fare" in data
        assert "currency" in data
        assert data["currency"] == "EUR"
        print(f"✓ Estimated fare: {data['estimated_fare']} {data['currency']}")
        
        # Verify vehicle type
        assert data.get("vehicle_type") == "sb"
        print(f"✓ Vehicle type: {data['vehicle_type']}")
    
    def test_estimate_different_vehicle_types(self):
        """Estimate works with different vehicle types"""
        payload = {
            "pickup_lat": 14.6037,
            "pickup_lng": -61.0699,
            "pickup_address": "Fort-de-France",
            "dropoff_lat": 14.5956,
            "dropoff_lng": -60.9958,
            "dropoff_address": "Aeroport",
            "payment_method": "card"
        }
        
        vehicle_types = ["sb", "confort", "luxe"]
        for vtype in vehicle_types:
            payload["vehicle_type"] = vtype
            response = requests.post(f"{BASE_URL}/api/rides/estimate", json=payload)
            assert response.status_code == 200
            data = response.json()
            assert data.get("vehicle_type") == vtype
            print(f"✓ Vehicle type {vtype}: fare = {data.get('estimated_fare')} EUR")


class TestAuthEndpoints:
    """Authentication endpoint tests"""
    
    def test_login_success(self):
        """POST /api/auth/login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@superapp.com",
            "password": "SuperAdmin123!"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data or "access_token" in data
        print("✓ Admin login successful")
    
    def test_login_invalid_credentials(self):
        """POST /api/auth/login with invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpass"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials returns 401")


class TestVehicleTypesEndpoint:
    """Vehicle types configuration endpoint"""
    
    def test_get_vehicle_types(self):
        """GET /api/config/vehicle-types returns list of vehicle types"""
        response = requests.get(f"{BASE_URL}/api/config/vehicle-types")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "Should have at least one vehicle type"
        
        # Check first vehicle type has required fields
        vtype = data[0]
        assert "slug" in vtype
        assert "name_fr" in vtype
        print(f"✓ Vehicle types: {[v.get('slug') for v in data]}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
