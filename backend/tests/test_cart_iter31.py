"""
Cart Persistence API Tests - Iteration 31
Tests for the new cart CRUD endpoints: GET/PUT/DELETE /api/cart
Cart is user-scoped and stored in MongoDB 'carts' collection
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_USER_EMAIL = "test2@example.com"
TEST_USER_PASSWORD = "TestPass123!"
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"


class TestHealthAndAuth:
    """Basic health and auth tests to ensure system is working"""
    
    def test_health_endpoint(self):
        """GET /api/health returns ok status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("PASS: Health endpoint returns ok")
    
    def test_login_test_user(self):
        """POST /api/auth/login with test user credentials"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "user" in data
        assert data["user"]["email"] == TEST_USER_EMAIL
        print(f"PASS: Login test user {TEST_USER_EMAIL}")
    
    def test_login_admin_user(self):
        """POST /api/auth/login with admin credentials"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "user" in data
        assert data["user"]["role"] == "admin"
        print(f"PASS: Login admin user {ADMIN_EMAIL}")


class TestCartAPI:
    """Cart CRUD endpoint tests"""
    
    @pytest.fixture
    def authenticated_session(self):
        """Create authenticated session for test user"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Could not authenticate test user")
        return session
    
    @pytest.fixture
    def admin_session(self):
        """Create authenticated session for admin user"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Could not authenticate admin user")
        return session
    
    def test_get_cart_empty_for_new_user(self, authenticated_session):
        """GET /api/cart returns empty cart structure for user with no cart"""
        # First clear any existing cart
        authenticated_session.delete(f"{BASE_URL}/api/cart")
        
        # Now get cart - should be empty
        response = authenticated_session.get(f"{BASE_URL}/api/cart")
        assert response.status_code == 200
        data = response.json()
        
        # Verify empty cart structure
        assert "user_id" in data
        assert data.get("merchant_id") is None
        assert data.get("items") == []
        print("PASS: GET /api/cart returns empty cart for user with no cart")
    
    def test_put_cart_saves_items(self, authenticated_session):
        """PUT /api/cart saves cart with merchant_id and items"""
        cart_data = {
            "merchant_id": "merchant_burger_palace",
            "items": [
                {"id": "prod_bp_classic", "name": "Classic Burger", "price": 12.99, "quantity": 2},
                {"id": "prod_bp_fries", "name": "French Fries", "price": 4.99, "quantity": 1}
            ]
        }
        
        response = authenticated_session.put(f"{BASE_URL}/api/cart", json=cart_data)
        assert response.status_code == 200
        data = response.json()
        
        # Verify saved cart
        assert data.get("merchant_id") == "merchant_burger_palace"
        assert len(data.get("items", [])) == 2
        assert data.get("updated_at") is not None
        print("PASS: PUT /api/cart saves cart with merchant_id and items")
    
    def test_get_cart_returns_saved_cart(self, authenticated_session):
        """GET /api/cart returns previously saved cart"""
        # First save a cart
        cart_data = {
            "merchant_id": "merchant_pizza_heaven",
            "items": [
                {"id": "prod_ph_margherita", "name": "Margherita Pizza", "price": 14.99, "quantity": 1}
            ]
        }
        authenticated_session.put(f"{BASE_URL}/api/cart", json=cart_data)
        
        # Now get cart
        response = authenticated_session.get(f"{BASE_URL}/api/cart")
        assert response.status_code == 200
        data = response.json()
        
        # Verify cart data persisted
        assert data.get("merchant_id") == "merchant_pizza_heaven"
        assert len(data.get("items", [])) == 1
        assert data["items"][0]["id"] == "prod_ph_margherita"
        print("PASS: GET /api/cart returns saved cart after PUT")
    
    def test_put_cart_empty_items_clears_cart(self, authenticated_session):
        """PUT /api/cart with empty items clears the cart"""
        # First save a cart
        cart_data = {
            "merchant_id": "merchant_sushi_master",
            "items": [
                {"id": "prod_sm_salmon", "name": "Salmon Nigiri", "price": 12.99, "quantity": 3}
            ]
        }
        authenticated_session.put(f"{BASE_URL}/api/cart", json=cart_data)
        
        # Now clear by sending empty items
        clear_data = {
            "merchant_id": "merchant_sushi_master",
            "items": []
        }
        response = authenticated_session.put(f"{BASE_URL}/api/cart", json=clear_data)
        assert response.status_code == 200
        data = response.json()
        
        # Verify cart is cleared
        assert data.get("items") == []
        assert data.get("merchant_id") is None
        print("PASS: PUT /api/cart with empty items clears cart")
    
    def test_delete_cart_clears_cart(self, authenticated_session):
        """DELETE /api/cart clears the cart"""
        # First save a cart
        cart_data = {
            "merchant_id": "merchant_burger_palace",
            "items": [
                {"id": "prod_bp_bacon", "name": "Bacon Burger", "price": 16.99, "quantity": 1}
            ]
        }
        authenticated_session.put(f"{BASE_URL}/api/cart", json=cart_data)
        
        # Delete cart
        response = authenticated_session.delete(f"{BASE_URL}/api/cart")
        assert response.status_code == 200
        data = response.json()
        assert data.get("message") == "Cart cleared"
        print("PASS: DELETE /api/cart clears the cart")
    
    def test_get_cart_empty_after_delete(self, authenticated_session):
        """GET /api/cart returns empty after DELETE"""
        # First save a cart
        cart_data = {
            "merchant_id": "merchant_burger_palace",
            "items": [
                {"id": "prod_bp_cheese", "name": "Cheese Burger", "price": 14.99, "quantity": 2}
            ]
        }
        authenticated_session.put(f"{BASE_URL}/api/cart", json=cart_data)
        
        # Delete cart
        authenticated_session.delete(f"{BASE_URL}/api/cart")
        
        # Get cart - should be empty
        response = authenticated_session.get(f"{BASE_URL}/api/cart")
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("items") == []
        assert data.get("merchant_id") is None
        print("PASS: GET /api/cart returns empty after DELETE")
    
    def test_cart_user_scoped_different_users(self, authenticated_session, admin_session):
        """Cart is user-scoped - different users have different carts"""
        # Save cart for test user
        test_user_cart = {
            "merchant_id": "merchant_burger_palace",
            "items": [
                {"id": "prod_bp_classic", "name": "Classic Burger", "price": 12.99, "quantity": 1}
            ]
        }
        authenticated_session.put(f"{BASE_URL}/api/cart", json=test_user_cart)
        
        # Save different cart for admin user
        admin_cart = {
            "merchant_id": "merchant_sushi_master",
            "items": [
                {"id": "prod_sm_dragon", "name": "Dragon Roll", "price": 14.99, "quantity": 2}
            ]
        }
        admin_session.put(f"{BASE_URL}/api/cart", json=admin_cart)
        
        # Verify test user cart
        test_response = authenticated_session.get(f"{BASE_URL}/api/cart")
        test_data = test_response.json()
        assert test_data.get("merchant_id") == "merchant_burger_palace"
        assert test_data["items"][0]["id"] == "prod_bp_classic"
        
        # Verify admin cart is different
        admin_response = admin_session.get(f"{BASE_URL}/api/cart")
        admin_data = admin_response.json()
        assert admin_data.get("merchant_id") == "merchant_sushi_master"
        assert admin_data["items"][0]["id"] == "prod_sm_dragon"
        
        print("PASS: Cart is user-scoped - different users have different carts")
        
        # Cleanup
        authenticated_session.delete(f"{BASE_URL}/api/cart")
        admin_session.delete(f"{BASE_URL}/api/cart")
    
    def test_cart_requires_authentication(self):
        """Cart endpoints require authentication"""
        # Try to get cart without auth
        response = requests.get(f"{BASE_URL}/api/cart")
        assert response.status_code == 401
        print("PASS: GET /api/cart requires authentication (returns 401)")
        
        # Try to save cart without auth
        response = requests.put(f"{BASE_URL}/api/cart", json={"merchant_id": "test", "items": []})
        assert response.status_code == 401
        print("PASS: PUT /api/cart requires authentication (returns 401)")
        
        # Try to delete cart without auth
        response = requests.delete(f"{BASE_URL}/api/cart")
        assert response.status_code == 401
        print("PASS: DELETE /api/cart requires authentication (returns 401)")
    
    def test_cart_replaces_on_merchant_change(self, authenticated_session):
        """When saving cart with different merchant, old cart is replaced"""
        # Save cart for burger palace
        cart1 = {
            "merchant_id": "merchant_burger_palace",
            "items": [{"id": "prod_bp_classic", "name": "Classic Burger", "price": 12.99, "quantity": 1}]
        }
        authenticated_session.put(f"{BASE_URL}/api/cart", json=cart1)
        
        # Save cart for different merchant
        cart2 = {
            "merchant_id": "merchant_pizza_heaven",
            "items": [{"id": "prod_ph_pepperoni", "name": "Pepperoni Pizza", "price": 16.99, "quantity": 1}]
        }
        authenticated_session.put(f"{BASE_URL}/api/cart", json=cart2)
        
        # Get cart - should be pizza heaven
        response = authenticated_session.get(f"{BASE_URL}/api/cart")
        data = response.json()
        
        assert data.get("merchant_id") == "merchant_pizza_heaven"
        assert len(data.get("items", [])) == 1
        assert data["items"][0]["id"] == "prod_ph_pepperoni"
        print("PASS: Cart replaces old cart when merchant changes")
        
        # Cleanup
        authenticated_session.delete(f"{BASE_URL}/api/cart")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
