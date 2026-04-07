"""
SB Drive VTC - Backend API Tests
Tests for authentication, merchants, rides, orders, wallet, and admin endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://superapp-integration.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_USER_EMAIL = "test2@example.com"
TEST_USER_PASSWORD = "TestPass123!"
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"
MERCHANT_EMAIL = "merchant@example.com"
MERCHANT_PASSWORD = "Merchant123!"


class TestHealthCheck:
    """Health check endpoint tests"""
    
    def test_health_endpoint(self):
        """Test API health check"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        print("✓ Health check passed")


class TestAuthentication:
    """Authentication endpoint tests"""
    
    def test_login_user_success(self):
        """Test user login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_USER_EMAIL
        assert data["user"]["role"] == "user"
        print(f"✓ User login successful: {data['user']['email']}")
    
    def test_login_admin_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful: {data['user']['email']}")
    
    def test_login_merchant_success(self):
        """Test merchant login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MERCHANT_EMAIL,
            "password": MERCHANT_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "merchant"
        print(f"✓ Merchant login successful: {data['user']['email']}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials rejected correctly")
    
    def test_get_me_authenticated(self):
        """Test /auth/me endpoint with valid token"""
        # First login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        token = login_response.json()["access_token"]
        
        # Get user info
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == TEST_USER_EMAIL
        print("✓ /auth/me endpoint working")
    
    def test_get_me_unauthenticated(self):
        """Test /auth/me endpoint without token"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("✓ Unauthenticated request rejected correctly")


class TestMerchants:
    """Merchant endpoint tests"""
    
    def test_list_merchants(self):
        """Test listing all merchants"""
        response = requests.get(f"{BASE_URL}/api/merchants")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3  # Should have at least 3 seeded merchants
        print(f"✓ Listed {len(data)} merchants")
    
    def test_list_restaurants(self):
        """Test listing restaurants only"""
        response = requests.get(f"{BASE_URL}/api/merchants?store_type=restaurant")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3
        for merchant in data:
            assert merchant["store_type"] == "restaurant"
        print(f"✓ Listed {len(data)} restaurants")
    
    def test_get_merchant_by_id(self):
        """Test getting a specific merchant"""
        response = requests.get(f"{BASE_URL}/api/merchants/merchant_burger_palace")
        assert response.status_code == 200
        data = response.json()
        assert data["store_name"] == "Burger Palace"
        assert data["store_type"] == "restaurant"
        print(f"✓ Got merchant: {data['store_name']}")
    
    def test_get_merchant_products(self):
        """Test getting products for a merchant"""
        response = requests.get(f"{BASE_URL}/api/merchants/merchant_burger_palace/products")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 5  # Burger Palace should have multiple products
        print(f"✓ Got {len(data)} products for Burger Palace")
    
    def test_get_nonexistent_merchant(self):
        """Test getting a merchant that doesn't exist"""
        response = requests.get(f"{BASE_URL}/api/merchants/nonexistent_merchant")
        assert response.status_code == 404
        print("✓ Nonexistent merchant returns 404")


class TestRides:
    """Ride endpoint tests"""
    
    def test_ride_estimate(self):
        """Test ride fare estimation"""
        response = requests.post(f"{BASE_URL}/api/rides/estimate", json={
            "pickup_lat": 48.8566,
            "pickup_lng": 2.3522,
            "pickup_address": "Paris Center",
            "dropoff_lat": 48.8738,
            "dropoff_lng": 2.2950,
            "dropoff_address": "Arc de Triomphe",
            "vehicle_type": "car",
            "payment_method": "card"
        })
        assert response.status_code == 200
        data = response.json()
        assert "distance_km" in data
        assert "duration_mins" in data
        assert "estimated_fare" in data
        assert data["distance_km"] > 0
        assert data["estimated_fare"] > 0
        print(f"✓ Ride estimate: {data['distance_km']}km, €{data['estimated_fare']}")
    
    def test_create_ride_authenticated(self):
        """Test creating a ride with authentication"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        token = login_response.json()["access_token"]
        
        # Create ride
        response = requests.post(f"{BASE_URL}/api/rides", 
            headers={"Authorization": f"Bearer {token}"},
            json={
                "pickup_lat": 48.8566,
                "pickup_lng": 2.3522,
                "pickup_address": "Paris Center",
                "dropoff_lat": 48.8738,
                "dropoff_lng": 2.2950,
                "dropoff_address": "Arc de Triomphe",
                "vehicle_type": "car",
                "payment_method": "card"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["status"] == "pending"
        print(f"✓ Created ride: {data['id']}")
    
    def test_create_ride_unauthenticated(self):
        """Test creating a ride without authentication"""
        response = requests.post(f"{BASE_URL}/api/rides", json={
            "pickup_lat": 48.8566,
            "pickup_lng": 2.3522,
            "pickup_address": "Paris Center",
            "dropoff_lat": 48.8738,
            "dropoff_lng": 2.2950,
            "dropoff_address": "Arc de Triomphe",
            "vehicle_type": "car",
            "payment_method": "card"
        })
        assert response.status_code == 401
        print("✓ Unauthenticated ride creation rejected")


class TestOrders:
    """Order endpoint tests"""
    
    def test_create_order_authenticated(self):
        """Test creating an order with authentication"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        token = login_response.json()["access_token"]
        
        # Create order
        response = requests.post(f"{BASE_URL}/api/orders",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "merchant_id": "merchant_burger_palace",
                "items": [
                    {"product_id": "prod_bp_classic", "quantity": 2},
                    {"product_id": "prod_bp_fries", "quantity": 1}
                ],
                "delivery_address": "123 Test Street, Paris",
                "delivery_lat": 48.8566,
                "delivery_lng": 2.3522,
                "order_type": "food",
                "payment_method": "card"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["status"] == "pending"
        assert data["subtotal"] > 0
        assert data["total"] > 0
        print(f"✓ Created order: {data['id']}, total: €{data['total']}")
    
    def test_create_order_unauthenticated(self):
        """Test creating an order without authentication"""
        response = requests.post(f"{BASE_URL}/api/orders", json={
            "merchant_id": "merchant_burger_palace",
            "items": [{"product_id": "prod_bp_classic", "quantity": 1}],
            "delivery_address": "123 Test Street",
            "delivery_lat": 48.8566,
            "delivery_lng": 2.3522,
            "order_type": "food",
            "payment_method": "card"
        })
        assert response.status_code == 401
        print("✓ Unauthenticated order creation rejected")


class TestWallet:
    """Wallet endpoint tests"""
    
    def test_get_wallet_authenticated(self):
        """Test getting wallet balance"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        token = login_response.json()["access_token"]
        
        # Get wallet
        response = requests.get(f"{BASE_URL}/api/wallet",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "balance" in data
        assert "transactions" in data
        print(f"✓ Wallet balance: €{data['balance']}")
    
    def test_get_wallet_unauthenticated(self):
        """Test getting wallet without authentication"""
        response = requests.get(f"{BASE_URL}/api/wallet")
        assert response.status_code == 401
        print("✓ Unauthenticated wallet access rejected")


class TestSupport:
    """Support ticket endpoint tests"""
    
    def test_create_support_ticket(self):
        """Test creating a support ticket"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        token = login_response.json()["access_token"]
        
        # Create ticket
        response = requests.post(f"{BASE_URL}/api/support/tickets",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "subject": "Test Support Ticket",
                "message": "This is a test support ticket for API testing"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["status"] == "open"
        print(f"✓ Created support ticket: {data['id']}")


class TestAdminDashboard:
    """Admin dashboard endpoint tests"""
    
    def test_admin_dashboard_authenticated(self):
        """Test admin dashboard with admin credentials"""
        # Login as admin
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_response.json()["access_token"]
        
        # Get dashboard
        response = requests.get(f"{BASE_URL}/api/admin/dashboard",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_users" in data
        assert "total_drivers" in data
        assert "total_merchants" in data
        print(f"✓ Admin dashboard: {data['total_users']} users, {data['total_drivers']} drivers, {data['total_merchants']} merchants")
    
    def test_admin_dashboard_non_admin(self):
        """Test admin dashboard with non-admin credentials"""
        # Login as regular user
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        token = login_response.json()["access_token"]
        
        # Try to access admin dashboard
        response = requests.get(f"{BASE_URL}/api/admin/dashboard",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403
        print("✓ Non-admin access to admin dashboard rejected")
    
    def test_admin_list_users(self):
        """Test admin listing users"""
        # Login as admin
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_response.json()["access_token"]
        
        # List users
        response = requests.get(f"{BASE_URL}/api/admin/users",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        assert "total" in data
        print(f"✓ Admin listed {data['total']} users")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
