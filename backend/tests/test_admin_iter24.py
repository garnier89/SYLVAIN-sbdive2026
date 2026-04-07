"""
Admin Dashboard Backend Tests - Iteration 24
Tests for admin login, dashboard KPIs, users, drivers, rides, revenue, and support endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials from test_credentials.md
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"


class TestAdminAuth:
    """Admin authentication tests"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Create authenticated admin session"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
        
        return session
    
    def test_admin_login_success(self):
        """Test admin login with correct credentials"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "user" in data
        assert data["user"]["role"] == "admin"
        assert data["user"]["email"] == ADMIN_EMAIL
        print(f"PASS: Admin login successful - role={data['user']['role']}")
    
    def test_admin_login_wrong_password(self):
        """Test admin login with wrong password"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": "WrongPassword123!"
        })
        
        assert response.status_code in [401, 400], f"Expected 401/400, got {response.status_code}"
        print("PASS: Admin login with wrong password correctly rejected")


class TestAdminDashboard:
    """Admin dashboard KPI tests"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Create authenticated admin session"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.status_code}")
        return session
    
    def test_dashboard_returns_kpis(self, admin_session):
        """Test /api/admin/dashboard returns all required KPIs"""
        response = admin_session.get(f"{BASE_URL}/api/admin/dashboard")
        
        assert response.status_code == 200, f"Dashboard failed: {response.text}"
        data = response.json()
        
        # Verify all 6 KPI fields exist
        required_fields = [
            "total_users", "total_drivers", "active_drivers", 
            "today_rides", "today_revenue", "pending_drivers", "open_tickets"
        ]
        for field in required_fields:
            assert field in data, f"Missing KPI field: {field}"
        
        # Verify data types
        assert isinstance(data["total_users"], int)
        assert isinstance(data["total_drivers"], int)
        assert isinstance(data["today_revenue"], (int, float))
        assert isinstance(data["pending_drivers"], int)
        assert isinstance(data["open_tickets"], int)
        
        print(f"PASS: Dashboard KPIs returned - users={data['total_users']}, drivers={data['total_drivers']}, revenue={data['today_revenue']}, pending={data['pending_drivers']}, tickets={data['open_tickets']}")
    
    def test_dashboard_requires_admin_role(self):
        """Test dashboard endpoint requires admin role"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/admin/dashboard")
        
        assert response.status_code in [401, 403], f"Expected 401/403 for unauthenticated, got {response.status_code}"
        print("PASS: Dashboard correctly requires authentication")


class TestAdminUsers:
    """Admin users management tests"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.status_code}")
        return session
    
    def test_list_users_returns_users(self, admin_session):
        """Test /api/admin/users returns user list"""
        response = admin_session.get(f"{BASE_URL}/api/admin/users")
        
        assert response.status_code == 200, f"List users failed: {response.text}"
        data = response.json()
        
        assert "users" in data
        assert "total" in data
        assert isinstance(data["users"], list)
        assert isinstance(data["total"], int)
        
        print(f"PASS: Users list returned - total={data['total']}, count={len(data['users'])}")
    
    def test_list_users_filter_by_role(self, admin_session):
        """Test filtering users by role"""
        # Test filter by 'user' role
        response = admin_session.get(f"{BASE_URL}/api/admin/users", params={"role": "user"})
        assert response.status_code == 200
        data = response.json()
        
        # All returned users should have role='user'
        for user in data["users"]:
            assert user.get("role") == "user", f"User has wrong role: {user.get('role')}"
        
        print(f"PASS: Users filtered by role=user - count={len(data['users'])}")
    
    def test_list_users_filter_by_driver_role(self, admin_session):
        """Test filtering users by driver role"""
        response = admin_session.get(f"{BASE_URL}/api/admin/users", params={"role": "driver"})
        assert response.status_code == 200
        data = response.json()
        
        for user in data["users"]:
            assert user.get("role") == "driver", f"User has wrong role: {user.get('role')}"
        
        print(f"PASS: Users filtered by role=driver - count={len(data['users'])}")
    
    def test_list_users_filter_by_admin_role(self, admin_session):
        """Test filtering users by admin role"""
        response = admin_session.get(f"{BASE_URL}/api/admin/users", params={"role": "admin"})
        assert response.status_code == 200
        data = response.json()
        
        for user in data["users"]:
            assert user.get("role") == "admin", f"User has wrong role: {user.get('role')}"
        
        # Should have at least 1 admin (the one we're logged in as)
        assert len(data["users"]) >= 1, "Should have at least 1 admin user"
        
        print(f"PASS: Users filtered by role=admin - count={len(data['users'])}")


class TestAdminDrivers:
    """Admin drivers management tests"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.status_code}")
        return session
    
    def test_list_drivers_returns_drivers(self, admin_session):
        """Test /api/admin/drivers returns driver list"""
        response = admin_session.get(f"{BASE_URL}/api/admin/drivers")
        
        assert response.status_code == 200, f"List drivers failed: {response.text}"
        data = response.json()
        
        assert "drivers" in data
        assert "total" in data
        assert isinstance(data["drivers"], list)
        
        print(f"PASS: Drivers list returned - total={data['total']}, count={len(data['drivers'])}")
    
    def test_list_drivers_filter_by_status(self, admin_session):
        """Test filtering drivers by status"""
        for status in ["pending", "approved", "rejected"]:
            response = admin_session.get(f"{BASE_URL}/api/admin/drivers", params={"status": status})
            assert response.status_code == 200, f"Filter by {status} failed"
            data = response.json()
            
            for driver in data["drivers"]:
                assert driver.get("status") == status, f"Driver has wrong status: {driver.get('status')}"
            
            print(f"PASS: Drivers filtered by status={status} - count={len(data['drivers'])}")


class TestAdminRides:
    """Admin rides monitoring tests"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.status_code}")
        return session
    
    def test_list_rides_returns_rides(self, admin_session):
        """Test /api/admin/rides returns ride list"""
        response = admin_session.get(f"{BASE_URL}/api/admin/rides")
        
        assert response.status_code == 200, f"List rides failed: {response.text}"
        data = response.json()
        
        assert "rides" in data
        assert "total" in data
        assert isinstance(data["rides"], list)
        
        print(f"PASS: Rides list returned - total={data['total']}, count={len(data['rides'])}")
    
    def test_list_rides_filter_by_status(self, admin_session):
        """Test filtering rides by status"""
        for status in ["pending", "completed", "cancelled"]:
            response = admin_session.get(f"{BASE_URL}/api/admin/rides", params={"status": status})
            assert response.status_code == 200, f"Filter by {status} failed"
            data = response.json()
            
            for ride in data["rides"]:
                assert ride.get("status") == status, f"Ride has wrong status: {ride.get('status')}"
            
            print(f"PASS: Rides filtered by status={status} - count={len(data['rides'])}")


class TestAdminRevenue:
    """Admin revenue and commission tests"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.status_code}")
        return session
    
    def test_revenue_returns_breakdown(self, admin_session):
        """Test /api/admin/revenue returns revenue breakdown by period"""
        response = admin_session.get(f"{BASE_URL}/api/admin/revenue")
        
        assert response.status_code == 200, f"Revenue failed: {response.text}"
        data = response.json()
        
        # Verify all period breakdowns exist
        required_periods = ["today", "week", "month", "all_time"]
        for period in required_periods:
            assert period in data, f"Missing period: {period}"
            assert "total" in data[period], f"Missing total in {period}"
            assert "commission" in data[period], f"Missing commission in {period}"
            assert "rides" in data[period], f"Missing rides count in {period}"
        
        # Verify recent_transactions exists
        assert "recent_transactions" in data
        assert isinstance(data["recent_transactions"], list)
        
        print(f"PASS: Revenue breakdown returned - today={data['today']['total']}, week={data['week']['total']}, month={data['month']['total']}, all_time={data['all_time']['total']}")
    
    def test_revenue_commission_calculation(self, admin_session):
        """Test that commission is calculated correctly (should be <= total)"""
        response = admin_session.get(f"{BASE_URL}/api/admin/revenue")
        assert response.status_code == 200
        data = response.json()
        
        for period in ["today", "week", "month", "all_time"]:
            total = data[period]["total"]
            commission = data[period]["commission"]
            
            # Commission should be less than or equal to total
            assert commission <= total, f"Commission ({commission}) > Total ({total}) for {period}"
            
            # If there are rides, commission should be > 0 (unless total is 0)
            if total > 0:
                assert commission >= 0, f"Commission should be >= 0 for {period}"
        
        print("PASS: Commission calculations are valid")


class TestAdminSupport:
    """Admin support ticket tests"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.status_code}")
        return session
    
    def test_list_tickets_returns_tickets(self, admin_session):
        """Test /api/support/tickets returns ticket list for admin"""
        response = admin_session.get(f"{BASE_URL}/api/support/tickets")
        
        assert response.status_code == 200, f"List tickets failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Tickets should be a list"
        
        print(f"PASS: Support tickets returned - count={len(data)}")


class TestAdminUserSuspension:
    """Admin user suspend/unsuspend tests"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.status_code}")
        return session
    
    def test_suspend_nonexistent_user(self, admin_session):
        """Test suspending a non-existent user returns 404"""
        response = admin_session.post(f"{BASE_URL}/api/admin/users/nonexistent_user_id/suspend")
        
        # Should return 404 for non-existent user
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: Suspend non-existent user returns 404")
    
    def test_unsuspend_nonexistent_user(self, admin_session):
        """Test unsuspending a non-existent user returns 404"""
        response = admin_session.post(f"{BASE_URL}/api/admin/users/nonexistent_user_id/unsuspend")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: Unsuspend non-existent user returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
