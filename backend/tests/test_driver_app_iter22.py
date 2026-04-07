"""
Iteration 22 - Driver App (Chauffeur) Backend Tests
Tests for:
- Phone auth with driver role
- Driver registration (vehicle + documents)
- Driver profile
- Driver earnings
- Driver ride history
- Online toggle
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthAndAuth:
    """Basic health and auth endpoint tests"""
    
    def test_health_check(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("PASS: Health check returns ok")
    
    def test_check_phone_existing_user(self):
        """Test check-phone for existing user"""
        response = requests.post(f"{BASE_URL}/api/auth/check-phone", json={
            "phone": "+33 699887766"
        })
        assert response.status_code == 200
        data = response.json()
        assert "exists" in data
        print(f"PASS: check-phone returns exists={data['exists']}")
    
    def test_check_phone_new_user(self):
        """Test check-phone for new user"""
        response = requests.post(f"{BASE_URL}/api/auth/check-phone", json={
            "phone": f"+33 {uuid.uuid4().hex[:9]}"
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get("exists") == False
        print("PASS: check-phone returns exists=false for new number")
    
    def test_check_phone_empty(self):
        """Test check-phone with empty phone"""
        response = requests.post(f"{BASE_URL}/api/auth/check-phone", json={
            "phone": ""
        })
        assert response.status_code == 400
        print("PASS: check-phone returns 400 for empty phone")


class TestDriverRegistration:
    """Test driver registration flow with role=driver"""
    
    @pytest.fixture
    def new_driver_phone(self):
        """Generate unique phone for test driver"""
        return f"+33 6{uuid.uuid4().hex[:8]}"
    
    def test_phone_register_with_driver_role(self, new_driver_phone):
        """Test registering a new user with driver role"""
        response = requests.post(f"{BASE_URL}/api/auth/phone-register", json={
            "phone": new_driver_phone,
            "password": "TestDriver123!",
            "name": "Test Driver",
            "role": "driver"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["role"] == "driver"
        assert data["user"]["phone"] == new_driver_phone
        print(f"PASS: Driver registered with role=driver, phone={new_driver_phone}")
        return data
    
    def test_phone_register_duplicate_phone(self):
        """Test registering with existing phone fails"""
        response = requests.post(f"{BASE_URL}/api/auth/phone-register", json={
            "phone": "+33 699887766",
            "password": "Test1234!",
            "name": "Duplicate Test"
        })
        assert response.status_code == 400
        print("PASS: Duplicate phone registration returns 400")
    
    def test_phone_login_existing_driver(self):
        """Test login with existing driver credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/phone-login", json={
            "phone": "+33 699887766",
            "password": "Test1234!"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        print(f"PASS: Driver login successful, role={data['user'].get('role')}")
        return data


class TestDriverProfile:
    """Test driver profile endpoints"""
    
    @pytest.fixture
    def driver_session(self):
        """Create a new driver and return session with token"""
        phone = f"+33 6{uuid.uuid4().hex[:8]}"
        session = requests.Session()
        
        # Register as driver
        reg_response = session.post(f"{BASE_URL}/api/auth/phone-register", json={
            "phone": phone,
            "password": "TestDriver123!",
            "name": "Profile Test Driver",
            "role": "driver"
        })
        assert reg_response.status_code == 200
        data = reg_response.json()
        token = data["access_token"]
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session, data["user"]
    
    def test_driver_profile_not_found_before_registration(self, driver_session):
        """Test driver profile returns 404 before vehicle registration"""
        session, user = driver_session
        response = session.get(f"{BASE_URL}/api/drivers/profile")
        # Should return 404 because driver hasn't registered vehicle yet
        assert response.status_code == 404
        print("PASS: Driver profile returns 404 before vehicle registration")
    
    def test_driver_register_vehicle(self, driver_session):
        """Test driver vehicle registration"""
        session, user = driver_session
        response = session.post(f"{BASE_URL}/api/drivers/register", json={
            "vehicle_type": "car",
            "vehicle_number": "AB-123-CD",
            "vehicle_model": "Toyota Camry 2022",
            "license_number": "12AB34567"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["vehicle_type"] == "car"
        assert data["vehicle_number"] == "AB-123-CD"
        assert data["vehicle_model"] == "Toyota Camry 2022"
        assert data["license_number"] == "12AB34567"
        assert data["status"] == "pending"
        assert data["is_online"] == False
        print("PASS: Driver vehicle registration successful")
        return data
    
    def test_driver_profile_after_registration(self, driver_session):
        """Test driver profile after vehicle registration"""
        session, user = driver_session
        
        # First register vehicle
        session.post(f"{BASE_URL}/api/drivers/register", json={
            "vehicle_type": "motorcycle",
            "vehicle_number": "XY-789-ZZ",
            "vehicle_model": "Honda CB500",
            "license_number": "99ZZ88777"
        })
        
        # Now get profile
        response = session.get(f"{BASE_URL}/api/drivers/profile")
        assert response.status_code == 200
        data = response.json()
        assert data["vehicle_type"] == "motorcycle"
        assert "rating" in data
        assert "total_trips" in data
        assert "earnings" in data
        print("PASS: Driver profile returns correct data after registration")
    
    def test_driver_already_registered(self, driver_session):
        """Test duplicate driver registration fails"""
        session, user = driver_session
        
        # First registration
        session.post(f"{BASE_URL}/api/drivers/register", json={
            "vehicle_type": "car",
            "vehicle_number": "AB-123-CD",
            "vehicle_model": "Toyota Camry",
            "license_number": "12AB34567"
        })
        
        # Second registration should fail
        response = session.post(f"{BASE_URL}/api/drivers/register", json={
            "vehicle_type": "bicycle",
            "vehicle_number": "BIKE-001",
            "vehicle_model": "Mountain Bike",
            "license_number": "N/A"
        })
        assert response.status_code == 400
        print("PASS: Duplicate driver registration returns 400")


class TestDriverEarnings:
    """Test driver earnings endpoint"""
    
    @pytest.fixture
    def registered_driver_session(self):
        """Create and register a driver"""
        phone = f"+33 6{uuid.uuid4().hex[:8]}"
        session = requests.Session()
        
        # Register as driver
        reg_response = session.post(f"{BASE_URL}/api/auth/phone-register", json={
            "phone": phone,
            "password": "TestDriver123!",
            "name": "Earnings Test Driver",
            "role": "driver"
        })
        data = reg_response.json()
        token = data["access_token"]
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Register vehicle
        session.post(f"{BASE_URL}/api/drivers/register", json={
            "vehicle_type": "car",
            "vehicle_number": f"TEST-{uuid.uuid4().hex[:4]}",
            "vehicle_model": "Test Car",
            "license_number": f"LIC-{uuid.uuid4().hex[:6]}"
        })
        
        return session
    
    def test_driver_earnings_endpoint(self, registered_driver_session):
        """Test driver earnings endpoint returns correct structure"""
        session = registered_driver_session
        response = session.get(f"{BASE_URL}/api/drivers/earnings")
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        assert "today" in data
        assert "week" in data
        assert "month" in data
        assert "total" in data
        assert "today_trips" in data
        assert "week_trips" in data
        assert "total_trips" in data
        assert "rating" in data
        assert "recent_rides" in data
        
        # Check types
        assert isinstance(data["today"], (int, float))
        assert isinstance(data["week"], (int, float))
        assert isinstance(data["month"], (int, float))
        assert isinstance(data["total"], (int, float))
        assert isinstance(data["recent_rides"], list)
        
        print(f"PASS: Driver earnings endpoint returns correct structure")
        print(f"  - Today: {data['today']}€, Week: {data['week']}€, Month: {data['month']}€")
        print(f"  - Total trips: {data['total_trips']}, Rating: {data['rating']}")


class TestDriverRideHistory:
    """Test driver ride history endpoint"""
    
    @pytest.fixture
    def registered_driver_session(self):
        """Create and register a driver"""
        phone = f"+33 6{uuid.uuid4().hex[:8]}"
        session = requests.Session()
        
        # Register as driver
        reg_response = session.post(f"{BASE_URL}/api/auth/phone-register", json={
            "phone": phone,
            "password": "TestDriver123!",
            "name": "History Test Driver",
            "role": "driver"
        })
        data = reg_response.json()
        token = data["access_token"]
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Register vehicle
        session.post(f"{BASE_URL}/api/drivers/register", json={
            "vehicle_type": "car",
            "vehicle_number": f"HIST-{uuid.uuid4().hex[:4]}",
            "vehicle_model": "History Test Car",
            "license_number": f"HIS-{uuid.uuid4().hex[:6]}"
        })
        
        return session
    
    def test_driver_ride_history_endpoint(self, registered_driver_session):
        """Test driver ride history endpoint returns correct structure"""
        session = registered_driver_session
        response = session.get(f"{BASE_URL}/api/drivers/ride-history")
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        assert "rides" in data
        assert isinstance(data["rides"], list)
        
        print(f"PASS: Driver ride history endpoint returns correct structure")
        print(f"  - Number of rides: {len(data['rides'])}")


class TestDriverOnlineToggle:
    """Test driver online/offline toggle"""
    
    @pytest.fixture
    def registered_driver_session(self):
        """Create and register a driver"""
        phone = f"+33 6{uuid.uuid4().hex[:8]}"
        session = requests.Session()
        
        # Register as driver
        reg_response = session.post(f"{BASE_URL}/api/auth/phone-register", json={
            "phone": phone,
            "password": "TestDriver123!",
            "name": "Toggle Test Driver",
            "role": "driver"
        })
        data = reg_response.json()
        token = data["access_token"]
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Register vehicle
        session.post(f"{BASE_URL}/api/drivers/register", json={
            "vehicle_type": "car",
            "vehicle_number": f"TOG-{uuid.uuid4().hex[:4]}",
            "vehicle_model": "Toggle Test Car",
            "license_number": f"TOG-{uuid.uuid4().hex[:6]}"
        })
        
        return session
    
    def test_toggle_online_requires_approval(self, registered_driver_session):
        """Test that toggle online fails for pending drivers"""
        session = registered_driver_session
        response = session.post(f"{BASE_URL}/api/drivers/toggle-online")
        # Should fail because driver status is 'pending', not 'approved'
        assert response.status_code == 400
        data = response.json()
        assert "not approved" in data.get("detail", "").lower()
        print("PASS: Toggle online fails for pending (unapproved) drivers")


class TestDriverLocation:
    """Test driver location update"""
    
    @pytest.fixture
    def registered_driver_session(self):
        """Create and register a driver"""
        phone = f"+33 6{uuid.uuid4().hex[:8]}"
        session = requests.Session()
        
        # Register as driver
        reg_response = session.post(f"{BASE_URL}/api/auth/phone-register", json={
            "phone": phone,
            "password": "TestDriver123!",
            "name": "Location Test Driver",
            "role": "driver"
        })
        data = reg_response.json()
        token = data["access_token"]
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Register vehicle
        session.post(f"{BASE_URL}/api/drivers/register", json={
            "vehicle_type": "car",
            "vehicle_number": f"LOC-{uuid.uuid4().hex[:4]}",
            "vehicle_model": "Location Test Car",
            "license_number": f"LOC-{uuid.uuid4().hex[:6]}"
        })
        
        return session
    
    def test_update_driver_location(self, registered_driver_session):
        """Test driver location update endpoint"""
        session = registered_driver_session
        response = session.post(f"{BASE_URL}/api/drivers/location", json={
            "lat": 48.8566,
            "lng": 2.3522
        })
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print("PASS: Driver location update successful")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
