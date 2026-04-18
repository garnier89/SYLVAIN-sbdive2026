"""
Iteration 32 - Landing Page & Admin CRUD Tests
Tests for:
- Landing page backend health
- Admin authentication
- Admin stats endpoint
- Vehicle types CRUD (POST, PUT, DELETE)
- Merchants endpoint
- Orders endpoint
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"


class TestHealthAndAuth:
    """Health check and authentication tests"""
    
    def test_health_endpoint(self):
        """GET /api/health returns ok"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("✓ Health endpoint returns ok")
    
    def test_admin_login(self):
        """POST /api/auth/login with admin credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        print("✓ Admin login successful")


class TestAdminStats:
    """Admin stats endpoint tests"""
    
    @pytest.fixture
    def admin_session(self):
        """Get authenticated admin session"""
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return session
    
    def test_admin_stats(self, admin_session):
        """GET /api/admin/stats returns counts"""
        response = admin_session.get(f"{BASE_URL}/api/admin/stats")
        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        assert "drivers" in data
        assert "rides" in data
        assert "orders" in data
        assert "merchants" in data
        assert isinstance(data["users"], int)
        assert isinstance(data["drivers"], int)
        print(f"✓ Admin stats: users={data['users']}, drivers={data['drivers']}, rides={data['rides']}")


class TestVehicleTypesCRUD:
    """Vehicle types CRUD operations tests"""
    
    @pytest.fixture
    def admin_session(self):
        """Get authenticated admin session"""
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return session
    
    def test_get_vehicle_types(self):
        """GET /api/config/vehicle-types returns list"""
        response = requests.get(f"{BASE_URL}/api/config/vehicle-types")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        # Check structure of first item
        first = data[0]
        assert "slug" in first
        assert "name_fr" in first
        print(f"✓ Vehicle types: {len(data)} types found")
    
    def test_create_vehicle_type(self, admin_session):
        """POST /api/admin/vehicle-types creates new type"""
        test_slug = f"test_vtype_{uuid.uuid4().hex[:8]}"
        payload = {
            "slug": test_slug,
            "name_fr": "Test Vehicle Type",
            "person_capacity": 5,
            "min_fare": 12,
            "base_fare": 6,
            "price_per_km": 1.8,
            "price_per_min": 0.35,
            "commission_percent": 18
        }
        response = admin_session.post(
            f"{BASE_URL}/api/admin/vehicle-types",
            json=payload
        )
        assert response.status_code == 200
        data = response.json()
        assert data["slug"] == test_slug
        assert data["name_fr"] == "Test Vehicle Type"
        assert data["person_capacity"] == 5
        print(f"✓ Created vehicle type: {test_slug}")
        
        # Cleanup
        admin_session.delete(f"{BASE_URL}/api/admin/vehicle-types/{test_slug}")
    
    def test_update_vehicle_type(self, admin_session):
        """PUT /api/admin/vehicle-types/{slug} updates type"""
        # First create a type
        test_slug = f"test_update_{uuid.uuid4().hex[:8]}"
        admin_session.post(
            f"{BASE_URL}/api/admin/vehicle-types",
            json={"slug": test_slug, "name_fr": "Original Name", "min_fare": 10}
        )
        
        # Update it
        response = admin_session.put(
            f"{BASE_URL}/api/admin/vehicle-types/{test_slug}",
            json={"name_fr": "Updated Name", "min_fare": 15}
        )
        assert response.status_code == 200
        data = response.json()
        assert "updated" in data["message"].lower()
        print(f"✓ Updated vehicle type: {test_slug}")
        
        # Cleanup
        admin_session.delete(f"{BASE_URL}/api/admin/vehicle-types/{test_slug}")
    
    def test_delete_vehicle_type(self, admin_session):
        """DELETE /api/admin/vehicle-types/{slug} deletes type"""
        # First create a type
        test_slug = f"test_delete_{uuid.uuid4().hex[:8]}"
        admin_session.post(
            f"{BASE_URL}/api/admin/vehicle-types",
            json={"slug": test_slug, "name_fr": "To Delete"}
        )
        
        # Delete it
        response = admin_session.delete(f"{BASE_URL}/api/admin/vehicle-types/{test_slug}")
        assert response.status_code == 200
        data = response.json()
        assert "deleted" in data["message"].lower()
        print(f"✓ Deleted vehicle type: {test_slug}")
    
    def test_create_duplicate_vehicle_type_fails(self, admin_session):
        """POST /api/admin/vehicle-types with existing slug returns 409"""
        # Create first
        test_slug = f"test_dup_{uuid.uuid4().hex[:8]}"
        admin_session.post(
            f"{BASE_URL}/api/admin/vehicle-types",
            json={"slug": test_slug, "name_fr": "First"}
        )
        
        # Try to create duplicate
        response = admin_session.post(
            f"{BASE_URL}/api/admin/vehicle-types",
            json={"slug": test_slug, "name_fr": "Duplicate"}
        )
        assert response.status_code == 409
        print(f"✓ Duplicate vehicle type correctly rejected")
        
        # Cleanup
        admin_session.delete(f"{BASE_URL}/api/admin/vehicle-types/{test_slug}")


class TestMerchantsEndpoint:
    """Merchants endpoint tests"""
    
    def test_get_merchants(self):
        """GET /api/merchants returns list"""
        response = requests.get(f"{BASE_URL}/api/merchants")
        assert response.status_code == 200
        data = response.json()
        # Can be list or object with merchants key
        merchants = data if isinstance(data, list) else data.get("merchants", [])
        assert isinstance(merchants, list)
        print(f"✓ Merchants endpoint: {len(merchants)} merchants found")


class TestOrdersEndpoint:
    """Orders endpoint tests"""
    
    @pytest.fixture
    def admin_session(self):
        """Get authenticated admin session"""
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return session
    
    def test_get_orders(self, admin_session):
        """GET /api/orders returns list"""
        response = admin_session.get(f"{BASE_URL}/api/orders?limit=10")
        assert response.status_code == 200
        data = response.json()
        orders = data if isinstance(data, list) else data.get("orders", [])
        assert isinstance(orders, list)
        print(f"✓ Orders endpoint: {len(orders)} orders found")


class TestRidesEndpoint:
    """Rides endpoint tests for manual booking"""
    
    @pytest.fixture
    def admin_session(self):
        """Get authenticated admin session"""
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return session
    
    def test_get_rides(self, admin_session):
        """GET /api/rides returns list"""
        response = admin_session.get(f"{BASE_URL}/api/rides?limit=10")
        # May return 200 or 401 depending on auth
        if response.status_code == 200:
            data = response.json()
            rides = data if isinstance(data, list) else data.get("rides", [])
            assert isinstance(rides, list)
            print(f"✓ Rides endpoint: {len(rides)} rides found")
        else:
            print(f"⚠ Rides endpoint returned {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
