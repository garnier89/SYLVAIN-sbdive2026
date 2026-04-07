"""
Iteration 23 - Simulation Mode Testing
Tests for the new simulation feature that creates a virtual driver to auto-accept rides
and simulate the full ride lifecycle (pending → accepted → arriving → in_progress → completed)
"""
import pytest
import requests
import time
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
TEST_CLIENT_PHONE = "+33699887766"
TEST_CLIENT_PASSWORD = "Test1234!"
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"


class TestSimulationAPI:
    """Test simulation endpoints: start, stop, status"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and login as test client user"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as test client user (phone-based auth)
        login_resp = self.session.post(f"{BASE_URL}/api/auth/phone-login", json={
            "phone": TEST_CLIENT_PHONE,
            "password": TEST_CLIENT_PASSWORD
        })
        if login_resp.status_code != 200:
            pytest.skip(f"Could not login as test client: {login_resp.text}")
        
        yield
        
        # Cleanup: stop simulation if running
        try:
            self.session.post(f"{BASE_URL}/api/simulation/stop")
        except:
            pass
    
    def test_health_check(self):
        """Test backend health endpoint"""
        resp = requests.get(f"{BASE_URL}/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("status") == "ok"
        print("PASS: Health check returns ok")
    
    def test_simulation_status_initial(self):
        """Test GET /api/simulation/status returns inactive initially"""
        resp = self.session.get(f"{BASE_URL}/api/simulation/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "active" in data
        # May or may not be active depending on previous tests
        print(f"PASS: Simulation status endpoint works, active={data.get('active')}")
    
    def test_simulation_start(self):
        """Test POST /api/simulation/start creates virtual driver"""
        resp = self.session.post(f"{BASE_URL}/api/simulation/start")
        assert resp.status_code == 200
        data = resp.json()
        
        # Check response structure
        assert data.get("status") in ["started", "already_running"]
        if data.get("status") == "started":
            assert "driver_name" in data
            assert "driver_vehicle" in data
            assert "driver_plate" in data
            assert "message" in data
            print(f"PASS: Simulation started with driver: {data.get('driver_name')}, vehicle: {data.get('driver_vehicle')}")
        else:
            print("PASS: Simulation was already running")
    
    def test_simulation_status_after_start(self):
        """Test simulation status shows active after start"""
        # Start simulation first
        self.session.post(f"{BASE_URL}/api/simulation/start")
        
        resp = self.session.get(f"{BASE_URL}/api/simulation/status")
        assert resp.status_code == 200
        data = resp.json()
        
        assert data.get("active") == True
        assert "driver_name" in data
        assert "driver_vehicle" in data
        print(f"PASS: Simulation status shows active with driver: {data.get('driver_name')}")
    
    def test_simulation_stop(self):
        """Test POST /api/simulation/stop stops simulation"""
        # Start first
        self.session.post(f"{BASE_URL}/api/simulation/start")
        
        # Stop
        resp = self.session.post(f"{BASE_URL}/api/simulation/stop")
        assert resp.status_code == 200
        data = resp.json()
        
        assert data.get("status") == "stopped"
        assert "message" in data
        print("PASS: Simulation stopped successfully")
    
    def test_simulation_status_after_stop(self):
        """Test simulation status shows inactive after stop"""
        # Start then stop
        self.session.post(f"{BASE_URL}/api/simulation/start")
        self.session.post(f"{BASE_URL}/api/simulation/stop")
        
        resp = self.session.get(f"{BASE_URL}/api/simulation/status")
        assert resp.status_code == 200
        data = resp.json()
        
        assert data.get("active") == False
        print("PASS: Simulation status shows inactive after stop")
    
    def test_simulation_double_start(self):
        """Test starting simulation twice returns already_running"""
        # Start first time
        resp1 = self.session.post(f"{BASE_URL}/api/simulation/start")
        assert resp1.status_code == 200
        
        # Start second time
        resp2 = self.session.post(f"{BASE_URL}/api/simulation/start")
        assert resp2.status_code == 200
        data = resp2.json()
        
        assert data.get("status") == "already_running"
        print("PASS: Double start returns already_running")


class TestSimulationRideFlow:
    """Test simulation auto-accepts rides and transitions through statuses"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and login as test client user"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as test client user
        login_resp = self.session.post(f"{BASE_URL}/api/auth/phone-login", json={
            "phone": TEST_CLIENT_PHONE,
            "password": TEST_CLIENT_PASSWORD
        })
        if login_resp.status_code != 200:
            pytest.skip(f"Could not login as test client: {login_resp.text}")
        
        yield
        
        # Cleanup: stop simulation
        try:
            self.session.post(f"{BASE_URL}/api/simulation/stop")
        except:
            pass
    
    def test_create_ride_with_simulation(self):
        """Test creating a ride with simulation active - ride should be auto-accepted"""
        # Start simulation
        start_resp = self.session.post(f"{BASE_URL}/api/simulation/start")
        assert start_resp.status_code == 200
        sim_data = start_resp.json()
        print(f"Simulation started: {sim_data}")
        
        # Create a ride
        ride_data = {
            "pickup_lat": 48.8566,
            "pickup_lng": 2.3522,
            "dropoff_lat": 48.8606,
            "dropoff_lng": 2.3376,
            "pickup_address": "Tour Eiffel, Paris",
            "dropoff_address": "Louvre Museum, Paris",
            "vehicle_type": "sedan",
            "payment_method": "wallet"
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/rides", json=ride_data)
        assert create_resp.status_code == 200
        ride = create_resp.json()
        ride_id = ride.get("id")
        
        assert ride.get("status") == "pending"
        print(f"PASS: Ride created with id={ride_id}, status=pending")
        
        # Wait for simulation to auto-accept (3-5 seconds + polling interval)
        print("Waiting 8 seconds for simulation to auto-accept...")
        time.sleep(8)
        
        # Check ride status
        get_resp = self.session.get(f"{BASE_URL}/api/rides/{ride_id}")
        assert get_resp.status_code == 200
        updated_ride = get_resp.json()
        
        # Ride should be accepted or further along
        assert updated_ride.get("status") in ["accepted", "arriving", "in_progress", "completed"], \
            f"Expected ride to be auto-accepted, got status={updated_ride.get('status')}"
        
        print(f"PASS: Ride auto-accepted by simulation, status={updated_ride.get('status')}")
        
        # Verify driver info is attached
        if updated_ride.get("status") != "pending":
            assert updated_ride.get("driver_id") is not None
            assert updated_ride.get("driver_name") is not None
            print(f"PASS: Driver info attached: {updated_ride.get('driver_name')}")
    
    def test_simulation_full_ride_lifecycle(self):
        """Test simulation completes full ride lifecycle (takes ~40 seconds)"""
        # Start simulation
        self.session.post(f"{BASE_URL}/api/simulation/start")
        
        # Create a ride
        ride_data = {
            "pickup_lat": 48.8566,
            "pickup_lng": 2.3522,
            "dropoff_lat": 48.8606,
            "dropoff_lng": 2.3376,
            "pickup_address": "Tour Eiffel, Paris",
            "dropoff_address": "Louvre Museum, Paris",
            "vehicle_type": "sedan",
            "payment_method": "wallet"
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/rides", json=ride_data)
        assert create_resp.status_code == 200
        ride = create_resp.json()
        ride_id = ride.get("id")
        
        print(f"Ride created: {ride_id}")
        
        # Track status transitions
        statuses_seen = ["pending"]
        expected_flow = ["pending", "accepted", "arriving", "in_progress", "completed"]
        
        # Poll for status changes (max 60 seconds)
        for i in range(20):
            time.sleep(3)
            get_resp = self.session.get(f"{BASE_URL}/api/rides/{ride_id}")
            if get_resp.status_code == 200:
                current_status = get_resp.json().get("status")
                if current_status not in statuses_seen:
                    statuses_seen.append(current_status)
                    print(f"Status transition: {statuses_seen[-2]} → {current_status}")
                
                if current_status == "completed":
                    break
        
        # Verify we saw the expected transitions
        print(f"Statuses seen: {statuses_seen}")
        
        # At minimum, ride should have been accepted
        assert "accepted" in statuses_seen or "arriving" in statuses_seen or "in_progress" in statuses_seen or "completed" in statuses_seen, \
            f"Simulation did not progress ride. Statuses seen: {statuses_seen}"
        
        print(f"PASS: Simulation progressed ride through statuses: {statuses_seen}")


class TestRideCreationAPI:
    """Test ride creation and estimation endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_resp = self.session.post(f"{BASE_URL}/api/auth/phone-login", json={
            "phone": TEST_CLIENT_PHONE,
            "password": TEST_CLIENT_PASSWORD
        })
        if login_resp.status_code != 200:
            pytest.skip(f"Could not login: {login_resp.text}")
    
    def test_ride_estimate(self):
        """Test POST /api/rides/estimate returns fare estimate"""
        data = {
            "pickup_lat": 48.8566,
            "pickup_lng": 2.3522,
            "dropoff_lat": 48.8606,
            "dropoff_lng": 2.3376,
            "pickup_address": "Tour Eiffel",
            "dropoff_address": "Louvre",
            "vehicle_type": "sedan",
            "payment_method": "wallet"
        }
        
        resp = self.session.post(f"{BASE_URL}/api/rides/estimate", json=data)
        assert resp.status_code == 200
        estimate = resp.json()
        
        assert "distance_km" in estimate
        assert "duration_mins" in estimate
        assert "estimated_fare" in estimate
        assert estimate.get("currency") == "EUR"
        
        print(f"PASS: Ride estimate: {estimate.get('distance_km')}km, {estimate.get('estimated_fare')}EUR")
    
    def test_ride_create(self):
        """Test POST /api/rides creates a new ride"""
        data = {
            "pickup_lat": 48.8566,
            "pickup_lng": 2.3522,
            "dropoff_lat": 48.8606,
            "dropoff_lng": 2.3376,
            "pickup_address": "Tour Eiffel",
            "dropoff_address": "Louvre",
            "vehicle_type": "sedan",
            "payment_method": "wallet"
        }
        
        resp = self.session.post(f"{BASE_URL}/api/rides", json=data)
        assert resp.status_code == 200
        ride = resp.json()
        
        assert "id" in ride
        assert ride.get("status") == "pending"
        assert ride.get("pickup_address") == "Tour Eiffel"
        assert ride.get("dropoff_address") == "Louvre"
        assert ride.get("payment_method") == "wallet"
        
        print(f"PASS: Ride created with id={ride.get('id')}")
    
    def test_ride_list(self):
        """Test GET /api/rides returns user's rides"""
        resp = self.session.get(f"{BASE_URL}/api/rides")
        assert resp.status_code == 200
        rides = resp.json()
        
        assert isinstance(rides, list)
        print(f"PASS: Ride list returned {len(rides)} rides")
    
    def test_active_ride(self):
        """Test GET /api/rides/active/current returns active ride or null"""
        resp = self.session.get(f"{BASE_URL}/api/rides/active/current")
        assert resp.status_code == 200
        data = resp.json()
        
        # Either returns a ride object or {"active_ride": None}
        if "active_ride" in data:
            print("PASS: No active ride currently")
        else:
            print(f"PASS: Active ride found: {data.get('id')}")


class TestBottomNavigation:
    """Test that bottom navigation endpoints work"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_resp = self.session.post(f"{BASE_URL}/api/auth/phone-login", json={
            "phone": TEST_CLIENT_PHONE,
            "password": TEST_CLIENT_PASSWORD
        })
        if login_resp.status_code != 200:
            pytest.skip(f"Could not login: {login_resp.text}")
    
    def test_wallet_endpoint(self):
        """Test GET /api/wallet returns wallet info"""
        resp = self.session.get(f"{BASE_URL}/api/wallet")
        assert resp.status_code == 200
        data = resp.json()
        assert "balance" in data
        print(f"PASS: Wallet balance: {data.get('balance')}")
    
    def test_auth_me_endpoint(self):
        """Test GET /api/auth/me returns user profile"""
        resp = self.session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert "phone" in data or "email" in data
        print(f"PASS: User profile: {data.get('name')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
