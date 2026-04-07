"""
Admin Panel Tests - Iteration 25
Tests for admin panel UI refactor and settings persistence
- Admin authentication
- Dashboard API
- Users/Drivers/Rides/Revenue APIs
- Settings GET/PUT persistence
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials from test_credentials.md
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"


class TestAdminAuthentication:
    """Admin login and authentication tests"""
    
    def test_admin_login_success(self):
        """Test admin login with correct credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "user" in data
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful: {data['user']['email']}")
    
    def test_admin_login_wrong_password(self):
        """Test admin login with wrong password returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": "wrongpassword"}
        )
        assert response.status_code == 401
        print("✓ Wrong password correctly returns 401")


class TestAdminDashboard:
    """Admin dashboard API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session cookies"""
        self.session = requests.Session()
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, "Admin login failed"
    
    def test_dashboard_returns_kpis(self):
        """Test GET /api/admin/dashboard returns all KPIs"""
        response = self.session.get(f"{BASE_URL}/api/admin/dashboard")
        assert response.status_code == 200, f"Dashboard failed: {response.text}"
        data = response.json()
        
        # Verify all expected KPI fields
        expected_fields = ['total_users', 'total_drivers', 'active_drivers', 
                          'today_rides', 'today_revenue', 'pending_drivers', 'open_tickets']
        for field in expected_fields:
            assert field in data, f"Missing KPI field: {field}"
        
        print(f"✓ Dashboard KPIs: users={data['total_users']}, drivers={data['total_drivers']}, revenue={data['today_revenue']}")
    
    def test_dashboard_requires_admin_role(self):
        """Test dashboard endpoint requires admin authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/dashboard")
        assert response.status_code == 401
        print("✓ Dashboard correctly requires authentication")


class TestAdminUsers:
    """Admin users management API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
    
    def test_list_users(self):
        """Test GET /api/admin/users returns user list"""
        response = self.session.get(f"{BASE_URL}/api/admin/users")
        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        assert "total" in data
        assert isinstance(data["users"], list)
        print(f"✓ Users list: {data['total']} total users")
    
    def test_filter_users_by_role(self):
        """Test filtering users by role"""
        for role in ['user', 'driver', 'admin']:
            response = self.session.get(f"{BASE_URL}/api/admin/users?role={role}")
            assert response.status_code == 200
            data = response.json()
            # Verify all returned users have the correct role
            for user in data["users"]:
                assert user["role"] == role, f"User role mismatch: expected {role}, got {user['role']}"
            print(f"✓ Filter by role={role}: {len(data['users'])} users")


class TestAdminDrivers:
    """Admin drivers management API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
    
    def test_list_drivers(self):
        """Test GET /api/admin/drivers returns driver list"""
        response = self.session.get(f"{BASE_URL}/api/admin/drivers")
        assert response.status_code == 200
        data = response.json()
        assert "drivers" in data
        assert "total" in data
        print(f"✓ Drivers list: {data['total']} total drivers")
    
    def test_filter_drivers_by_status(self):
        """Test filtering drivers by status"""
        for status in ['pending', 'approved', 'rejected']:
            response = self.session.get(f"{BASE_URL}/api/admin/drivers?status={status}")
            assert response.status_code == 200
            data = response.json()
            for driver in data["drivers"]:
                assert driver["status"] == status
            print(f"✓ Filter by status={status}: {len(data['drivers'])} drivers")


class TestAdminRides:
    """Admin rides/trips management API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
    
    def test_list_rides(self):
        """Test GET /api/admin/rides returns ride list"""
        response = self.session.get(f"{BASE_URL}/api/admin/rides")
        assert response.status_code == 200
        data = response.json()
        assert "rides" in data
        assert "total" in data
        print(f"✓ Rides list: {data['total']} total rides")
    
    def test_filter_rides_by_status(self):
        """Test filtering rides by status"""
        for status in ['pending', 'completed', 'cancelled']:
            response = self.session.get(f"{BASE_URL}/api/admin/rides?status={status}")
            assert response.status_code == 200
            data = response.json()
            print(f"✓ Filter by status={status}: {len(data['rides'])} rides")


class TestAdminRevenue:
    """Admin revenue/reports API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
    
    def test_revenue_returns_breakdown(self):
        """Test GET /api/admin/revenue returns period breakdown"""
        response = self.session.get(f"{BASE_URL}/api/admin/revenue")
        assert response.status_code == 200
        data = response.json()
        
        # Verify all period breakdowns
        for period in ['today', 'week', 'month', 'all_time']:
            assert period in data, f"Missing period: {period}"
            assert 'total' in data[period]
            assert 'commission' in data[period]
            assert 'rides' in data[period]
        
        print(f"✓ Revenue breakdown: today=${data['today']['total']}, all_time=${data['all_time']['total']}")
    
    def test_revenue_commission_valid(self):
        """Test commission is always <= total"""
        response = self.session.get(f"{BASE_URL}/api/admin/revenue")
        assert response.status_code == 200
        data = response.json()
        
        for period in ['today', 'week', 'month', 'all_time']:
            assert data[period]['commission'] <= data[period]['total'], \
                f"Commission > total for {period}"
        print("✓ Commission calculations are valid")


class TestAdminSettings:
    """Admin settings persistence API tests - NEW in iteration 25"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
    
    def test_get_settings_returns_settings_object(self):
        """Test GET /api/admin/settings returns settings object"""
        response = self.session.get(f"{BASE_URL}/api/admin/settings")
        assert response.status_code == 200, f"Get settings failed: {response.text}"
        data = response.json()
        
        assert "settings" in data
        settings = data["settings"]
        assert isinstance(settings, dict)
        
        # Settings should have at least platform_name (either from DB or defaults)
        # Note: If no settings saved yet, backend returns defaults
        print(f"✓ Settings retrieved: {len(settings)} fields, platform={settings.get('platform_name', 'N/A')}")
    
    def test_update_settings_persists(self):
        """Test PUT /api/admin/settings saves and persists settings"""
        # First, get current settings
        get_response = self.session.get(f"{BASE_URL}/api/admin/settings")
        assert get_response.status_code == 200
        original_settings = get_response.json()["settings"]
        
        # Update with new values
        test_settings = {
            **original_settings,
            "platform_name": "TEST_SB_Drive_VTC_Updated",
            "commission_rate": "15",
            "min_fare": "7.5"
        }
        
        put_response = self.session.put(
            f"{BASE_URL}/api/admin/settings",
            json={"settings": test_settings}
        )
        assert put_response.status_code == 200, f"Update settings failed: {put_response.text}"
        
        # Verify the response contains updated settings
        put_data = put_response.json()
        assert "settings" in put_data
        assert put_data["settings"]["platform_name"] == "TEST_SB_Drive_VTC_Updated"
        
        # GET again to verify persistence
        verify_response = self.session.get(f"{BASE_URL}/api/admin/settings")
        assert verify_response.status_code == 200
        persisted = verify_response.json()["settings"]
        
        assert persisted["platform_name"] == "TEST_SB_Drive_VTC_Updated"
        assert persisted["commission_rate"] == "15"
        assert persisted["min_fare"] == "7.5"
        
        print("✓ Settings updated and persisted successfully")
        
        # Restore original settings
        restore_response = self.session.put(
            f"{BASE_URL}/api/admin/settings",
            json={"settings": original_settings}
        )
        assert restore_response.status_code == 200
        print("✓ Original settings restored")
    
    def test_settings_requires_admin_role(self):
        """Test settings endpoints require admin authentication"""
        # GET without auth
        response = requests.get(f"{BASE_URL}/api/admin/settings")
        assert response.status_code == 401
        
        # PUT without auth
        response = requests.put(
            f"{BASE_URL}/api/admin/settings",
            json={"settings": {"platform_name": "Test"}}
        )
        assert response.status_code == 401
        
        print("✓ Settings endpoints correctly require admin authentication")


class TestSupportTickets:
    """Admin support/reviews API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
    
    def test_list_tickets(self):
        """Test GET /api/support/tickets returns ticket list for admin"""
        response = self.session.get(f"{BASE_URL}/api/support/tickets")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Support tickets: {len(data)} tickets")


class TestDispatcherLive:
    """Dispatcher/God's View API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
    
    def test_dispatcher_live_data(self):
        """Test GET /api/dispatcher/live returns drivers and rides"""
        response = self.session.get(f"{BASE_URL}/api/dispatcher/live")
        assert response.status_code == 200
        data = response.json()
        
        assert "drivers" in data
        assert "rides" in data
        assert isinstance(data["drivers"], list)
        assert isinstance(data["rides"], list)
        
        print(f"✓ Dispatcher live: {len(data['drivers'])} drivers, {len(data['rides'])} active rides")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
