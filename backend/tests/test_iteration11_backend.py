"""
Backend API Tests for Iteration 11 - SB Drive VTC Super App
Tests: Health, Auth, Merchants, Rides, Services, Marketplace, Carpool
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://gojek-mvp-1.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_USER_EMAIL = "test2@example.com"
TEST_USER_PASSWORD = "TestPass123!"
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"


class TestHealthEndpoint:
    """Health check endpoint tests"""
    
    def test_health_check(self):
        """GET /api/health should return {status: ok}"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        print("✓ Health check passed")


class TestAuthEndpoints:
    """Authentication endpoint tests"""
    
    def test_login_success(self):
        """POST /api/auth/login with valid credentials should return access_token and user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "access_token" in data, "Missing access_token in response"
        assert "user" in data, "Missing user in response"
        assert data["user"]["email"] == TEST_USER_EMAIL
        assert "id" in data["user"]
        assert "name" in data["user"]
        assert "role" in data["user"]
        print(f"✓ Login success - User: {data['user']['name']}, Role: {data['user']['role']}")
        return data
    
    def test_login_invalid_credentials(self):
        """POST /api/auth/login with invalid credentials should return 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid login correctly rejected")
    
    def test_auth_me_with_token(self):
        """GET /api/auth/me with valid token should return user profile"""
        # First login to get token
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # Get user profile with Bearer token
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Auth/me failed: {response.text}"
        data = response.json()
        assert data["email"] == TEST_USER_EMAIL
        assert "id" in data
        assert "name" in data
        print(f"✓ Auth/me success - User: {data['name']}")
    
    def test_auth_me_with_cookie(self):
        """GET /api/auth/me with cookie should return user profile"""
        session = requests.Session()
        
        # Login to set cookie
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert login_response.status_code == 200
        
        # Get user profile using session cookies
        response = session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200, f"Auth/me with cookie failed: {response.text}"
        data = response.json()
        assert data["email"] == TEST_USER_EMAIL
        print("✓ Auth/me with cookie success")


class TestMerchantsEndpoints:
    """Merchants endpoint tests"""
    
    def test_list_merchants(self):
        """GET /api/merchants should return 3 demo merchants"""
        response = requests.get(f"{BASE_URL}/api/merchants")
        assert response.status_code == 200
        merchants = response.json()
        
        assert isinstance(merchants, list)
        assert len(merchants) >= 3, f"Expected at least 3 merchants, got {len(merchants)}"
        
        # Validate merchant structure
        for merchant in merchants[:3]:
            assert "id" in merchant
            assert "store_name" in merchant
            assert "store_type" in merchant
            assert "rating" in merchant
        
        merchant_names = [m["store_name"] for m in merchants]
        print(f"✓ Merchants list success - Found: {merchant_names[:3]}")
    
    def test_get_merchant_by_id(self):
        """GET /api/merchants/{id} should return merchant details"""
        response = requests.get(f"{BASE_URL}/api/merchants/merchant_burger_palace")
        assert response.status_code == 200
        merchant = response.json()
        
        assert merchant["id"] == "merchant_burger_palace"
        assert merchant["store_name"] == "Burger Palace"
        print(f"✓ Get merchant by ID success - {merchant['store_name']}")
    
    def test_get_merchant_products(self):
        """GET /api/merchants/{id}/products should return products"""
        response = requests.get(f"{BASE_URL}/api/merchants/merchant_burger_palace/products")
        assert response.status_code == 200
        products = response.json()
        
        assert isinstance(products, list)
        assert len(products) > 0, "Expected products for Burger Palace"
        
        for product in products[:3]:
            assert "id" in product
            assert "name" in product
            assert "price" in product
        
        print(f"✓ Merchant products success - Found {len(products)} products")


class TestRidesEndpoints:
    """Rides endpoint tests"""
    
    def test_ride_estimate(self):
        """POST /api/rides/estimate should return distance_km, duration_mins, estimated_fare"""
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
        assert response.status_code == 200, f"Ride estimate failed: {response.text}"
        data = response.json()
        
        assert "distance_km" in data
        assert "duration_mins" in data
        assert "estimated_fare" in data
        assert "vehicle_type" in data
        
        assert isinstance(data["distance_km"], (int, float))
        assert isinstance(data["duration_mins"], int)
        assert isinstance(data["estimated_fare"], (int, float))
        assert data["distance_km"] > 0
        assert data["estimated_fare"] > 0
        
        print(f"✓ Ride estimate success - {data['distance_km']}km, {data['duration_mins']}min, {data['estimated_fare']}€")
    
    def test_create_ride_authenticated(self):
        """POST /api/rides should create a ride when authenticated"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # Create ride
        response = requests.post(
            f"{BASE_URL}/api/rides",
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
        assert response.status_code == 200, f"Create ride failed: {response.text}"
        data = response.json()
        
        assert "id" in data
        assert data["status"] == "pending"
        assert "otp" in data
        assert "estimated_fare" in data
        
        print(f"✓ Create ride success - ID: {data['id']}, OTP: {data['otp']}")
        return data


class TestServicesEndpoints:
    """Services endpoint tests"""
    
    def test_list_service_categories(self):
        """GET /api/services/categories should return 6 categories"""
        response = requests.get(f"{BASE_URL}/api/services/categories")
        assert response.status_code == 200, f"Service categories failed: {response.text}"
        data = response.json()
        
        expected_categories = ["beauty", "pet", "car-care", "towing", "medical", "handyman"]
        for cat in expected_categories:
            assert cat in data, f"Missing category: {cat}"
        
        # Validate category structure
        assert "name" in data["beauty"]
        assert "services" in data["beauty"]
        assert isinstance(data["beauty"]["services"], list)
        
        print(f"✓ Service categories success - Found: {list(data.keys())}")
    
    def test_create_service_booking(self):
        """POST /api/services/bookings should create a booking when authenticated"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # Create booking
        response = requests.post(
            f"{BASE_URL}/api/services/bookings",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "category": "beauty",
                "service_name": "Massage & Spa",
                "address": "123 Test Street, Paris",
                "lat": 48.8566,
                "lng": 2.3522,
                "scheduled_date": "2026-02-01",
                "scheduled_time": "14:00",
                "notes": "Test booking",
                "payment_method": "card"
            }
        )
        assert response.status_code == 200, f"Create booking failed: {response.text}"
        data = response.json()
        
        assert "id" in data
        assert data["status"] == "pending"
        assert data["category"] == "beauty"
        assert data["service_name"] == "Massage & Spa"
        
        print(f"✓ Create service booking success - ID: {data['id']}")
        return data
    
    def test_list_service_bookings(self):
        """GET /api/services/bookings should list user's bookings"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # List bookings
        response = requests.get(
            f"{BASE_URL}/api/services/bookings",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"List bookings failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ List service bookings success - Found {len(data)} bookings")
    
    def test_nearby_businesses(self):
        """GET /api/services/nearby should return businesses (may be empty)"""
        response = requests.get(f"{BASE_URL}/api/services/nearby?lat=48.8566&lng=2.3522")
        assert response.status_code == 200, f"Nearby businesses failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Nearby businesses success - Found {len(data)} businesses")


class TestMarketplaceEndpoints:
    """Marketplace endpoint tests"""
    
    def test_create_listing(self):
        """POST /api/marketplace/listings should create a listing when authenticated"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # Create listing
        unique_title = f"TEST_Listing_{uuid.uuid4().hex[:8]}"
        response = requests.post(
            f"{BASE_URL}/api/marketplace/listings",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "type": "items",
                "title": unique_title,
                "description": "Test item for sale",
                "price": 99.99,
                "currency": "EUR",
                "category": "electronics",
                "location": "Paris",
                "listing_type": "sell"
            }
        )
        assert response.status_code == 200, f"Create listing failed: {response.text}"
        data = response.json()
        
        assert "id" in data
        assert data["title"] == unique_title
        assert data["price"] == 99.99
        assert data["status"] == "active"
        
        print(f"✓ Create marketplace listing success - ID: {data['id']}")
        return data
    
    def test_list_listings(self):
        """GET /api/marketplace/listings should return listings"""
        response = requests.get(f"{BASE_URL}/api/marketplace/listings")
        assert response.status_code == 200, f"List listings failed: {response.text}"
        data = response.json()
        
        assert "listings" in data
        assert "total" in data
        assert isinstance(data["listings"], list)
        
        print(f"✓ List marketplace listings success - Found {data['total']} listings")
    
    def test_get_listing_by_id(self):
        """GET /api/marketplace/listings/{id} should return listing details"""
        # First create a listing
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        token = login_response.json()["access_token"]
        
        create_response = requests.post(
            f"{BASE_URL}/api/marketplace/listings",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "type": "items",
                "title": f"TEST_GetById_{uuid.uuid4().hex[:8]}",
                "description": "Test item",
                "price": 50.00,
                "category": "test"
            }
        )
        assert create_response.status_code == 200
        listing_id = create_response.json()["id"]
        
        # Get listing by ID
        response = requests.get(f"{BASE_URL}/api/marketplace/listings/{listing_id}")
        assert response.status_code == 200, f"Get listing failed: {response.text}"
        data = response.json()
        
        assert data["id"] == listing_id
        print(f"✓ Get marketplace listing by ID success - {data['title']}")


class TestCarpoolEndpoints:
    """Carpool endpoint tests"""
    
    def test_create_carpool_ride(self):
        """POST /api/carpool/rides should create a carpool ride when authenticated"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # Create carpool ride
        response = requests.post(
            f"{BASE_URL}/api/carpool/rides",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "pickup_address": "Paris Gare du Nord",
                "dropoff_address": "Lyon Part-Dieu",
                "departure_date": "2026-02-15",
                "available_seats": 3,
                "price_per_seat": 25.00
            }
        )
        assert response.status_code == 200, f"Create carpool ride failed: {response.text}"
        data = response.json()
        
        assert "id" in data
        assert data["status"] == "open"
        assert data["available_seats"] == 3
        assert data["price_per_seat"] == 25.00
        assert data["currency"] == "EUR"
        
        print(f"✓ Create carpool ride success - ID: {data['id']}")
        return data
    
    def test_search_carpool_rides(self):
        """GET /api/carpool/rides should search for carpool rides"""
        response = requests.get(f"{BASE_URL}/api/carpool/rides")
        assert response.status_code == 200, f"Search carpool rides failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Search carpool rides success - Found {len(data)} rides")
    
    def test_search_carpool_with_filters(self):
        """GET /api/carpool/rides with filters should return filtered results"""
        response = requests.get(f"{BASE_URL}/api/carpool/rides?pickup=Paris")
        assert response.status_code == 200, f"Search with filters failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list)
        # All results should contain 'Paris' in pickup_address
        for ride in data:
            assert "paris" in ride["pickup_address"].lower()
        
        print(f"✓ Search carpool with filters success - Found {len(data)} rides matching 'Paris'")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_listings(self):
        """Delete TEST_ prefixed marketplace listings"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        token = login_response.json()["access_token"]
        
        # Get all listings
        response = requests.get(f"{BASE_URL}/api/marketplace/listings?limit=100")
        if response.status_code == 200:
            listings = response.json().get("listings", [])
            deleted = 0
            for listing in listings:
                if listing.get("title", "").startswith("TEST_"):
                    del_response = requests.delete(
                        f"{BASE_URL}/api/marketplace/listings/{listing['id']}",
                        headers={"Authorization": f"Bearer {token}"}
                    )
                    if del_response.status_code in [200, 204]:
                        deleted += 1
            print(f"✓ Cleanup: Deleted {deleted} test listings")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
