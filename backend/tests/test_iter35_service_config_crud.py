"""
Iteration 35 Tests - Service Config and CRUD Endpoints
Tests for:
1. GET /api/health - Health check
2. PUT /api/admin/service-config/{key} - Save service config to MongoDB
3. GET /api/admin/service-config/{key} - Retrieve service config from MongoDB
4. POST /api/admin/crud/{collection} - Create CRUD item
5. GET /api/admin/crud/{collection} - List CRUD items
6. PUT /api/admin/crud/{collection}/{id} - Update CRUD item
7. DELETE /api/admin/crud/{collection}/{id} - Delete CRUD item
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")


class TestHealthCheck:
    """Health endpoint test"""
    
    def test_health_returns_ok(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("PASS: GET /api/health returns ok")


class TestAdminServiceConfig:
    """Service config GET/PUT tests - persisted to MongoDB"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin and get session"""
        self.session = requests.Session()
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if login_response.status_code != 200:
            pytest.skip("Admin login failed - skipping service config tests")
        print(f"Admin login successful: {login_response.status_code}")
    
    def test_put_service_config_genie(self):
        """PUT /api/admin/service-config/genie saves settings to MongoDB"""
        test_settings = {
            "enabled": True,
            "base_fee": 7.5,
            "per_hour": 20,
            "commission": 25,
            "test_marker": f"test_{uuid.uuid4().hex[:8]}"
        }
        response = self.session.put(
            f"{BASE_URL}/api/admin/service-config/genie",
            json={"settings": test_settings}
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "genie" in data["message"].lower() or "saved" in data["message"].lower()
        print(f"PASS: PUT /api/admin/service-config/genie - {data}")
        # Store test_marker for verification
        self.test_marker = test_settings["test_marker"]
    
    def test_get_service_config_genie(self):
        """GET /api/admin/service-config/genie returns saved settings"""
        # First save a config
        test_marker = f"verify_{uuid.uuid4().hex[:8]}"
        save_response = self.session.put(
            f"{BASE_URL}/api/admin/service-config/genie",
            json={"settings": {"enabled": True, "base_fee": 8, "test_marker": test_marker}}
        )
        assert save_response.status_code == 200
        
        # Now retrieve it
        response = self.session.get(f"{BASE_URL}/api/admin/service-config/genie")
        assert response.status_code == 200
        data = response.json()
        assert "service_key" in data or "settings" in data
        if "settings" in data:
            assert data["settings"].get("test_marker") == test_marker
            assert data["settings"].get("enabled") == True
            assert data["settings"].get("base_fee") == 8
        print(f"PASS: GET /api/admin/service-config/genie returns saved settings - {data}")
    
    def test_service_config_persistence(self):
        """Verify config persists across requests (MongoDB storage)"""
        unique_value = f"persist_test_{uuid.uuid4().hex[:8]}"
        
        # Save config
        self.session.put(
            f"{BASE_URL}/api/admin/service-config/runner",
            json={"settings": {"unique_key": unique_value, "per_km": 1.5}}
        )
        
        # Create new session and login again
        new_session = requests.Session()
        new_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        # Retrieve with new session
        response = new_session.get(f"{BASE_URL}/api/admin/service-config/runner")
        assert response.status_code == 200
        data = response.json()
        assert data.get("settings", {}).get("unique_key") == unique_value
        print(f"PASS: Service config persists in MongoDB - {data}")


class TestAdminCrudGroups:
    """CRUD tests for groups collection"""
    
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
    
    def test_create_group_item(self):
        """POST /api/admin/crud/groups creates an item"""
        test_name = f"TEST_Group_{uuid.uuid4().hex[:6]}"
        response = self.session.post(
            f"{BASE_URL}/api/admin/crud/groups",
            json={"name": test_name, "description": "Test group for iteration 35"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data.get("name") == test_name
        self.created_ids.append(data["id"])
        print(f"PASS: POST /api/admin/crud/groups creates item - id: {data['id']}")
        return data["id"]
    
    def test_list_groups(self):
        """GET /api/admin/crud/groups lists items"""
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
        print(f"PASS: GET /api/admin/crud/groups lists {len(data)} items")
    
    def test_update_group_item(self):
        """PUT /api/admin/crud/groups/{id} updates item"""
        # Create item
        test_name = f"TEST_UpdateGroup_{uuid.uuid4().hex[:6]}"
        create_response = self.session.post(
            f"{BASE_URL}/api/admin/crud/groups",
            json={"name": test_name, "status": "active"}
        )
        item_id = create_response.json().get("id")
        self.created_ids.append(item_id)
        
        # Update item
        updated_name = f"UPDATED_{test_name}"
        response = self.session.put(
            f"{BASE_URL}/api/admin/crud/groups/{item_id}",
            json={"name": updated_name, "status": "inactive"}
        )
        assert response.status_code == 200
        
        # Verify update by listing
        list_response = self.session.get(f"{BASE_URL}/api/admin/crud/groups")
        items = list_response.json()
        updated_item = next((i for i in items if i.get("id") == item_id), None)
        assert updated_item is not None
        assert updated_item.get("name") == updated_name
        assert updated_item.get("status") == "inactive"
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
    
    def test_crud_vehicles_full_cycle(self):
        """Full CRUD cycle for vehicles collection"""
        # CREATE
        vehicle_data = {
            "plate": f"TEST-{uuid.uuid4().hex[:4].upper()}",
            "model": "Tesla Model 3",
            "year": 2024
        }
        create_response = self.session.post(
            f"{BASE_URL}/api/admin/crud/vehicles",
            json=vehicle_data
        )
        assert create_response.status_code == 200
        created = create_response.json()
        item_id = created.get("id")
        self.created_ids.append(item_id)
        print(f"CREATE vehicle: {item_id}")
        
        # READ (list)
        list_response = self.session.get(f"{BASE_URL}/api/admin/crud/vehicles")
        assert list_response.status_code == 200
        items = list_response.json()
        assert any(i.get("id") == item_id for i in items)
        print(f"READ vehicles: {len(items)} items")
        
        # UPDATE
        update_response = self.session.put(
            f"{BASE_URL}/api/admin/crud/vehicles/{item_id}",
            json={"model": "Tesla Model S", "year": 2025}
        )
        assert update_response.status_code == 200
        print(f"UPDATE vehicle: {item_id}")
        
        # DELETE
        delete_response = self.session.delete(f"{BASE_URL}/api/admin/crud/vehicles/{item_id}")
        assert delete_response.status_code == 200
        self.created_ids.remove(item_id)
        print(f"DELETE vehicle: {item_id}")
        
        print("PASS: Full CRUD cycle for vehicles collection")


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
        response = self.session.get(f"{BASE_URL}/api/admin/crud/invalid_collection")
        assert response.status_code == 400
        print("PASS: Invalid collection returns 400")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
