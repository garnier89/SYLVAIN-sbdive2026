"""
Iteration 40 - V3Cube Dashboard Tests
Tests for:
- GET /api/admin/analytics - ride_status, earnings, drivers, recent_rides, scheduled_bookings
- GET /api/admin/stats - still works
- MongoDB aggregation for ride status counts
- Earnings total from completed rides sum
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAdminAnalytics:
    """Tests for /api/admin/analytics endpoint with MongoDB aggregation"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@superapp.com",
            "password": os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.token = login_resp.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_analytics_endpoint_returns_200(self):
        """GET /api/admin/analytics returns 200 with auth"""
        resp = self.session.get(f"{BASE_URL}/api/admin/analytics")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: /api/admin/analytics returns 200")
    
    def test_analytics_has_ride_status(self):
        """Analytics response contains ride_status with in_progress, completed, cancelled"""
        resp = self.session.get(f"{BASE_URL}/api/admin/analytics")
        data = resp.json()
        
        assert "ride_status" in data, "Missing ride_status in response"
        ride_status = data["ride_status"]
        
        assert "in_progress" in ride_status, "Missing in_progress in ride_status"
        assert "completed" in ride_status, "Missing completed in ride_status"
        assert "cancelled" in ride_status, "Missing cancelled in ride_status"
        assert "pending" in ride_status, "Missing pending in ride_status"
        
        # Verify counts are integers
        assert isinstance(ride_status["in_progress"], int), "in_progress should be int"
        assert isinstance(ride_status["completed"], int), "completed should be int"
        assert isinstance(ride_status["cancelled"], int), "cancelled should be int"
        
        print(f"PASS: ride_status = {ride_status}")
    
    def test_analytics_has_earnings(self):
        """Analytics response contains earnings with total from completed rides"""
        resp = self.session.get(f"{BASE_URL}/api/admin/analytics")
        data = resp.json()
        
        assert "earnings" in data, "Missing earnings in response"
        earnings = data["earnings"]
        
        assert "total" in earnings, "Missing total in earnings"
        assert "commission" in earnings, "Missing commission in earnings"
        assert "outstanding" in earnings, "Missing outstanding in earnings"
        assert "org_outstanding" in earnings, "Missing org_outstanding in earnings"
        
        # Total should be a number (float or int)
        assert isinstance(earnings["total"], (int, float)), "total should be numeric"
        
        print(f"PASS: earnings = {earnings}")
    
    def test_analytics_has_drivers(self):
        """Analytics response contains drivers with active and total counts"""
        resp = self.session.get(f"{BASE_URL}/api/admin/analytics")
        data = resp.json()
        
        assert "drivers" in data, "Missing drivers in response"
        drivers = data["drivers"]
        
        assert "active" in drivers, "Missing active in drivers"
        assert "total" in drivers, "Missing total in drivers"
        
        assert isinstance(drivers["active"], int), "active should be int"
        assert isinstance(drivers["total"], int), "total should be int"
        assert drivers["active"] <= drivers["total"], "active should be <= total"
        
        print(f"PASS: drivers = {drivers}")
    
    def test_analytics_has_recent_rides(self):
        """Analytics response contains recent_rides array from DB"""
        resp = self.session.get(f"{BASE_URL}/api/admin/analytics")
        data = resp.json()
        
        assert "recent_rides" in data, "Missing recent_rides in response"
        recent_rides = data["recent_rides"]
        
        assert isinstance(recent_rides, list), "recent_rides should be a list"
        
        # If there are rides, verify structure
        if len(recent_rides) > 0:
            ride = recent_rides[0]
            assert "id" in ride, "Ride should have id"
            assert "status" in ride, "Ride should have status"
            print(f"PASS: recent_rides has {len(recent_rides)} rides, first ride id: {ride.get('id')}")
        else:
            print("PASS: recent_rides is empty (no rides in DB)")
    
    def test_analytics_has_scheduled_bookings(self):
        """Analytics response contains scheduled_bookings array"""
        resp = self.session.get(f"{BASE_URL}/api/admin/analytics")
        data = resp.json()
        
        assert "scheduled_bookings" in data, "Missing scheduled_bookings in response"
        scheduled = data["scheduled_bookings"]
        
        assert isinstance(scheduled, list), "scheduled_bookings should be a list"
        print(f"PASS: scheduled_bookings has {len(scheduled)} bookings")
    
    def test_analytics_has_completed_rides_count(self):
        """Analytics response contains completed_rides_count"""
        resp = self.session.get(f"{BASE_URL}/api/admin/analytics")
        data = resp.json()
        
        assert "completed_rides_count" in data, "Missing completed_rides_count in response"
        assert isinstance(data["completed_rides_count"], int), "completed_rides_count should be int"
        
        # Should match ride_status.completed
        assert data["completed_rides_count"] == data["ride_status"]["completed"], \
            "completed_rides_count should match ride_status.completed"
        
        print(f"PASS: completed_rides_count = {data['completed_rides_count']}")
    
    def test_analytics_without_auth_returns_401(self):
        """GET /api/admin/analytics without auth returns 401"""
        resp = requests.get(f"{BASE_URL}/api/admin/analytics")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print("PASS: /api/admin/analytics without auth returns 401")


class TestAdminStats:
    """Tests for /api/admin/stats endpoint (should still work)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@superapp.com",
            "password": os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.token = login_resp.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_stats_endpoint_returns_200(self):
        """GET /api/admin/stats returns 200 with auth"""
        resp = self.session.get(f"{BASE_URL}/api/admin/stats")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: /api/admin/stats returns 200")
    
    def test_stats_has_all_counts(self):
        """Stats response contains users, drivers, rides, orders, merchants counts"""
        resp = self.session.get(f"{BASE_URL}/api/admin/stats")
        data = resp.json()
        
        required_fields = ["users", "drivers", "rides", "orders", "merchants"]
        for field in required_fields:
            assert field in data, f"Missing {field} in stats response"
            assert isinstance(data[field], int), f"{field} should be int"
        
        print(f"PASS: stats = {data}")
    
    def test_stats_without_auth_returns_401(self):
        """GET /api/admin/stats without auth returns 401"""
        resp = requests.get(f"{BASE_URL}/api/admin/stats")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print("PASS: /api/admin/stats without auth returns 401")


class TestHealthEndpoint:
    """Basic health check"""
    
    def test_health_returns_ok(self):
        """GET /api/health returns status ok"""
        resp = requests.get(f"{BASE_URL}/api/health")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert data.get("status") == "ok", f"Expected status ok, got {data}"
        print("PASS: /api/health returns ok")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
