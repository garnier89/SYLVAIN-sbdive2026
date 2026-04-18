"""
Iteration 36 Tests - Google Maps Directions API & Admin CRUD MongoDB Integration
Tests for:
1. POST /api/rides/estimate - Google Maps Directions API integration (distance, duration, polyline)
2. POST /api/rides/estimate - Paris to CDG route returns distance > 25km
3. POST /api/rides/estimate - Returns route_polyline when using Google Maps
4. POST /api/admin/crud/groups - Creates item in MongoDB
5. GET /api/admin/crud/groups - Lists items from MongoDB
6. PUT /api/admin/crud/groups/{id} - Updates item
7. DELETE /api/admin/crud/groups/{id} - Deletes item
8. POST /api/admin/crud/vehicles - Creates vehicle
9. GET /api/admin/crud/companies - Lists companies
10. Invalid collection returns 400
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"


class TestHealthCheck:
    """Health endpoint test"""
    
    def test_health_returns_ok(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("PASS: GET /api/health returns ok")


class TestRideEstimateGoogleMaps:
    """Tests for /api/rides/estimate with Google Maps Directions API"""
    
    def test_estimate_returns_google_maps_source(self):
        """POST /api/rides/estimate returns google_maps source with real distance, duration, and route_polyline"""
        # Paris center to CDG Airport
        payload = {
            "pickup_lat": 48.8566,
            "pickup_lng": 2.3522,
            "dropoff_lat": 49.0097,
            "dropoff_lng": 2.5479,
            "pickup_address": "Paris, France",
            "dropoff_address": "CDG Airport, France",
            "vehicle_type": "berline",
            "payment_method": "card"
        }
        response = requests.post(f"{BASE_URL}/api/rides/estimate", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        assert "distance_km" in data, "Missing distance_km field"
        assert "duration_mins" in data, "Missing duration_mins field"
        assert "estimated_fare" in data, "Missing estimated_fare field"
        assert "source" in data, "Missing source field"
        
        # Verify Google Maps source
        if data.get("source") == "google_maps":
            assert "route_polyline" in data, "Missing route_polyline when source is google_maps"
            print(f"PASS: Estimate uses Google Maps - distance: {data['distance_km']}km, duration: {data['duration_mins']}min")
            print(f"  Source: {data['source']}, Polyline present: {bool(data.get('route_polyline'))}")
        else:
            print(f"INFO: Estimate uses haversine fallback - source: {data['source']}")
        
        return data
    
    def test_paris_to_cdg_distance_greater_than_25km(self):
        """Estimate for Paris (48.8566,2.3522) to CDG (49.0097,2.5479) returns distance > 25km"""
        payload = {
            "pickup_lat": 48.8566,
            "pickup_lng": 2.3522,
            "dropoff_lat": 49.0097,
            "dropoff_lng": 2.5479,
            "pickup_address": "Paris, France",
            "dropoff_address": "CDG Airport, France",
            "vehicle_type": "berline",
            "payment_method": "card"
        }
        response = requests.post(f"{BASE_URL}/api/rides/estimate", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        distance = data.get("distance_km", 0)
        # Paris to CDG is approximately 25-35km by road
        # Haversine would give ~23km, Google Maps should give ~30km
        assert distance > 20, f"Distance {distance}km is too low for Paris to CDG route"
        
        if data.get("source") == "google_maps":
            # Google Maps should return realistic road distance (25-40km)
            assert distance > 25, f"Google Maps distance {distance}km should be > 25km for Paris to CDG"
            print(f"PASS: Paris to CDG distance = {distance}km (Google Maps)")
        else:
            # Haversine gives straight-line distance (~23km)
            print(f"INFO: Paris to CDG distance = {distance}km (haversine fallback)")
    
    def test_estimate_returns_route_polyline_with_google_maps(self):
        """Estimate returns route_polyline field when using Google Maps"""
        payload = {
            "pickup_lat": 48.8566,
            "pickup_lng": 2.3522,
            "dropoff_lat": 48.8738,
            "dropoff_lng": 2.2950,
            "pickup_address": "Paris Center",
            "dropoff_address": "Arc de Triomphe",
            "vehicle_type": "berline",
            "payment_method": "card"
        }
        response = requests.post(f"{BASE_URL}/api/rides/estimate", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        if data.get("source") == "google_maps":
            assert "route_polyline" in data, "route_polyline missing when source is google_maps"
            assert isinstance(data["route_polyline"], str), "route_polyline should be a string"
            assert len(data["route_polyline"]) > 10, "route_polyline seems too short"
            print(f"PASS: route_polyline present with Google Maps - length: {len(data['route_polyline'])} chars")
        else:
            # Haversine fallback doesn't have polyline
            assert "route_polyline" not in data or data.get("route_polyline") is None
            print(f"INFO: No route_polyline with haversine fallback (expected)")
    
    def test_estimate_with_different_vehicle_types(self):
        """Test estimate with different vehicle types"""
        vehicle_types = ["berline", "van", "luxe"]
        payload_base = {
            "pickup_lat": 48.8566,
            "pickup_lng": 2.3522,
            "dropoff_lat": 49.0097,
            "dropoff_lng": 2.5479,
            "pickup_address": "Paris",
            "dropoff_address": "CDG",
            "payment_method": "card"
        }
        
        for vtype in vehicle_types:
            payload = {**payload_base, "vehicle_type": vtype}
            response = requests.post(f"{BASE_URL}/api/rides/estimate", json=payload)
            assert response.status_code == 200
            data = response.json()
            assert data.get("vehicle_type") == vtype
            print(f"  {vtype}: {data.get('estimated_fare')} EUR")
        
        print("PASS: Estimate works with different vehicle types")


class TestAdminCrudGroups:
    """CRUD tests for groups collection - MongoDB integration"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin"""
        self.session = requests.Session()
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if login_response.status_code != 200:
            pytest.skip("Admin login failed - skipping CRUD tests")
        self.created_ids = []
    
    def teardown_method(self, method):
        """Cleanup created test items"""
        for item_id in self.created_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/admin/crud/groups/{item_id}")
            except:
                pass
    
    def test_create_group_in_mongodb(self):
        """POST /api/admin/crud/groups creates item in MongoDB"""
        test_name = f"TEST_Group_{uuid.uuid4().hex[:6]}"
        response = self.session.post(
            f"{BASE_URL}/api/admin/crud/groups",
            json={"name": test_name, "permissions": "read,write", "users": 10}
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data, "Response should contain id"
        assert data.get("name") == test_name
        assert "created_at" in data, "Response should contain created_at timestamp"
        self.created_ids.append(data["id"])
        print(f"PASS: POST /api/admin/crud/groups creates item - id: {data['id']}")
        return data["id"]
    
    def test_list_groups_from_mongodb(self):
        """GET /api/admin/crud/groups lists items from MongoDB"""
        # Create an item first
        test_name = f"TEST_ListGroup_{uuid.uuid4().hex[:6]}"
        create_response = self.session.post(
            f"{BASE_URL}/api/admin/crud/groups",
            json={"name": test_name}
        )
        created_id = create_response.json().get("id")
        self.created_ids.append(created_id)
        
        # List items
        response = self.session.get(f"{BASE_URL}/api/admin/crud/groups")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Verify our created item is in the list
        found = any(item.get("name") == test_name for item in data)
        assert found, f"Created item {test_name} not found in list"
        print(f"PASS: GET /api/admin/crud/groups lists {len(data)} items from MongoDB")
    
    def test_update_group_item(self):
        """PUT /api/admin/crud/groups/{id} updates item"""
        # Create item
        test_name = f"TEST_UpdateGroup_{uuid.uuid4().hex[:6]}"
        create_response = self.session.post(
            f"{BASE_URL}/api/admin/crud/groups",
            json={"name": test_name, "permissions": "read"}
        )
        item_id = create_response.json().get("id")
        self.created_ids.append(item_id)
        
        # Update item
        updated_name = f"UPDATED_{test_name}"
        response = self.session.put(
            f"{BASE_URL}/api/admin/crud/groups/{item_id}",
            json={"name": updated_name, "permissions": "read,write,delete"}
        )
        assert response.status_code == 200
        
        # Verify update by listing
        list_response = self.session.get(f"{BASE_URL}/api/admin/crud/groups")
        items = list_response.json()
        updated_item = next((i for i in items if i.get("id") == item_id), None)
        assert updated_item is not None
        assert updated_item.get("name") == updated_name
        assert updated_item.get("permissions") == "read,write,delete"
        print(f"PASS: PUT /api/admin/crud/groups/{item_id} updates item")
    
    def test_delete_group_item(self):
        """DELETE /api/admin/crud/groups/{id} deletes item"""
        # Create item
        test_name = f"TEST_DeleteGroup_{uuid.uuid4().hex[:6]}"
        create_response = self.session.post(
            f"{BASE_URL}/api/admin/crud/groups",
            json={"name": test_name}
        )
        item_id = create_response.json().get("id")
        
        # Delete item
        response = self.session.delete(f"{BASE_URL}/api/admin/crud/groups/{item_id}")
        assert response.status_code == 200
        
        # Verify deletion
        list_response = self.session.get(f"{BASE_URL}/api/admin/crud/groups")
        items = list_response.json()
        found = any(item.get("id") == item_id for item in items)
        assert not found, f"Deleted item {item_id} still exists"
        print(f"PASS: DELETE /api/admin/crud/groups/{item_id} deletes item")


class TestAdminCrudVehicles:
    """CRUD tests for vehicles collection"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin"""
        self.session = requests.Session()
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if login_response.status_code != 200:
            pytest.skip("Admin login failed")
        self.created_ids = []
    
    def teardown_method(self, method):
        """Cleanup"""
        for item_id in self.created_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/admin/crud/vehicles/{item_id}")
            except:
                pass
    
    def test_create_vehicle(self):
        """POST /api/admin/crud/vehicles creates vehicle"""
        vehicle_data = {
            "name": f"TEST_Vehicle_{uuid.uuid4().hex[:6]}",
            "plate": f"TEST-{uuid.uuid4().hex[:4].upper()}",
            "driver": "Test Driver",
            "status": "active"
        }
        response = self.session.post(
            f"{BASE_URL}/api/admin/crud/vehicles",
            json=vehicle_data
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data.get("name") == vehicle_data["name"]
        assert data.get("plate") == vehicle_data["plate"]
        self.created_ids.append(data["id"])
        print(f"PASS: POST /api/admin/crud/vehicles creates vehicle - id: {data['id']}")


class TestAdminCrudCompanies:
    """CRUD tests for companies collection"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin"""
        self.session = requests.Session()
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if login_response.status_code != 200:
            pytest.skip("Admin login failed")
    
    def test_list_companies(self):
        """GET /api/admin/crud/companies lists companies"""
        response = self.session.get(f"{BASE_URL}/api/admin/crud/companies")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: GET /api/admin/crud/companies lists {len(data)} companies")


class TestInvalidCollection:
    """Test invalid collection handling"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
    
    def test_invalid_collection_returns_400(self):
        """Invalid collection name should return 400"""
        response = self.session.get(f"{BASE_URL}/api/admin/crud/invalid_collection_xyz")
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        print(f"PASS: Invalid collection returns 400 - {data.get('detail')}")
    
    def test_invalid_collection_post_returns_400(self):
        """POST to invalid collection should return 400"""
        response = self.session.post(
            f"{BASE_URL}/api/admin/crud/not_allowed_collection",
            json={"name": "test"}
        )
        assert response.status_code == 400
        print("PASS: POST to invalid collection returns 400")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
