"""
Test suite for 6 new Gojek services: VideoConsult, Bidding, Intercity, Parking, GiftCards, Tracking
Iteration 26 - Testing all backend API routes
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_USER_EMAIL = "test2@example.com"
TEST_USER_PASSWORD = "TestPass123!"


class TestAuth:
    """Authentication tests for getting session cookie"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create a requests session with auth cookie"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        return s
    
    def test_login_success(self, session):
        """Test user login to get auth cookie"""
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "user" in data or "id" in data
        print(f"Login successful for {TEST_USER_EMAIL}")


@pytest.fixture(scope="module")
def auth_session():
    """Module-scoped authenticated session"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    response = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Authentication failed: {response.text}")
    return s


# ==========================================
# VIDEO CONSULTING TESTS
# ==========================================
class TestVideoConsult:
    """Video Consulting API tests"""
    
    def test_get_providers_list(self):
        """GET /api/video-consult/providers returns providers list"""
        response = requests.get(f"{BASE_URL}/api/video-consult/providers")
        assert response.status_code == 200
        data = response.json()
        assert "providers" in data
        assert "categories" in data
        assert len(data["providers"]) > 0
        # Verify provider structure
        provider = data["providers"][0]
        assert "id" in provider
        assert "name" in provider
        assert "category" in provider
        assert "price_per_min" in provider
        print(f"Found {len(data['providers'])} video providers")
    
    def test_get_providers_filter_by_category(self):
        """GET /api/video-consult/providers?category=doctor filters correctly"""
        response = requests.get(f"{BASE_URL}/api/video-consult/providers?category=doctor")
        assert response.status_code == 200
        data = response.json()
        assert "providers" in data
        # All returned providers should be doctors
        for provider in data["providers"]:
            assert provider["category"] == "doctor"
        print(f"Found {len(data['providers'])} doctor providers")
    
    def test_get_providers_filter_by_lawyer(self):
        """GET /api/video-consult/providers?category=lawyer filters correctly"""
        response = requests.get(f"{BASE_URL}/api/video-consult/providers?category=lawyer")
        assert response.status_code == 200
        data = response.json()
        for provider in data["providers"]:
            assert provider["category"] == "lawyer"
        print(f"Found {len(data['providers'])} lawyer providers")
    
    def test_create_video_session(self, auth_session):
        """POST /api/video-consult/sessions creates a session (auth required)"""
        response = auth_session.post(f"{BASE_URL}/api/video-consult/sessions", json={
            "provider_id": "vp_doc1",
            "provider_name": "Dr. Sophie Martin",
            "category": "doctor",
            "duration_min": 30,
            "total_price": 75.00,
            "notes": "Test consultation"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["provider_id"] == "vp_doc1"
        assert data["duration_min"] == 30
        assert data["status"] == "scheduled"
        print(f"Created video session: {data['id']}")
    
    def test_create_video_session_requires_auth(self):
        """POST /api/video-consult/sessions requires authentication"""
        response = requests.post(f"{BASE_URL}/api/video-consult/sessions", json={
            "provider_id": "vp_doc1"
        })
        assert response.status_code == 401


# ==========================================
# BIDDING SERVICE TESTS
# ==========================================
class TestBidding:
    """Bidding Service API tests"""
    
    def test_get_bidding_categories(self):
        """GET /api/bidding/categories returns categories"""
        response = requests.get(f"{BASE_URL}/api/bidding/categories")
        assert response.status_code == 200
        data = response.json()
        assert "categories" in data
        assert len(data["categories"]) > 0
        # Verify category structure
        cat = data["categories"][0]
        assert "id" in cat
        assert "name_fr" in cat
        assert "name_en" in cat
        print(f"Found {len(data['categories'])} bidding categories")
    
    def test_create_bidding_post(self, auth_session):
        """POST /api/bidding/posts creates a bidding post (auth required)"""
        response = auth_session.post(f"{BASE_URL}/api/bidding/posts", json={
            "category_id": "bcat_plumber",
            "title": "TEST_Réparation fuite d'eau",
            "description": "Fuite sous l'évier de la cuisine",
            "address": "123 Rue de Test, Paris",
            "budget_min": 50,
            "budget_max": 150,
            "scheduled_date": "2026-02-15"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["title"] == "TEST_Réparation fuite d'eau"
        assert data["category_id"] == "bcat_plumber"
        assert data["status"] == "open"
        print(f"Created bidding post: {data['id']}")
        return data["id"]
    
    def test_get_my_bidding_posts(self, auth_session):
        """GET /api/bidding/posts lists user's posts (auth required)"""
        response = auth_session.get(f"{BASE_URL}/api/bidding/posts")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} bidding posts for user")
    
    def test_create_bidding_post_requires_auth(self):
        """POST /api/bidding/posts requires authentication"""
        response = requests.post(f"{BASE_URL}/api/bidding/posts", json={
            "category_id": "bcat_plumber",
            "title": "Test",
            "description": "Test"
        })
        assert response.status_code == 401


# ==========================================
# INTERCITY RIDES TESTS
# ==========================================
class TestIntercity:
    """Intercity Rides API tests"""
    
    def test_get_intercity_routes(self):
        """GET /api/intercity/routes returns routes"""
        response = requests.get(f"{BASE_URL}/api/intercity/routes")
        assert response.status_code == 200
        data = response.json()
        assert "routes" in data
        assert len(data["routes"]) > 0
        # Verify route structure
        route = data["routes"][0]
        assert "id" in route
        assert "from_city" in route
        assert "to_city" in route
        assert "base_price" in route
        assert "distance_km" in route
        print(f"Found {len(data['routes'])} intercity routes")
    
    def test_get_intercity_routes_filter_by_city(self):
        """GET /api/intercity/routes?from_city=Paris filters correctly"""
        response = requests.get(f"{BASE_URL}/api/intercity/routes?from_city=Paris")
        assert response.status_code == 200
        data = response.json()
        for route in data["routes"]:
            assert route["from_city"].lower() == "paris"
        print(f"Found {len(data['routes'])} routes from Paris")
    
    def test_create_intercity_booking(self, auth_session):
        """POST /api/intercity/bookings creates a booking (auth required)"""
        response = auth_session.post(f"{BASE_URL}/api/intercity/bookings", json={
            "from_city": "Paris",
            "to_city": "Lyon",
            "departure_date": "2026-02-20",
            "departure_time": "09:00",
            "passengers": 2,
            "luggage": 1,
            "price": 70.00,
            "notes": "TEST_booking"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["from_city"] == "Paris"
        assert data["to_city"] == "Lyon"
        assert data["passengers"] == 2
        assert data["status"] == "pending"
        print(f"Created intercity booking: {data['id']}")
    
    def test_create_intercity_booking_requires_auth(self):
        """POST /api/intercity/bookings requires authentication"""
        response = requests.post(f"{BASE_URL}/api/intercity/bookings", json={
            "from_city": "Paris",
            "to_city": "Lyon",
            "departure_date": "2026-02-20"
        })
        assert response.status_code == 401


# ==========================================
# PARKING SERVICE TESTS
# ==========================================
class TestParking:
    """Parking Service API tests"""
    
    def test_get_parking_spots(self):
        """GET /api/parking/spots returns parking spots"""
        response = requests.get(f"{BASE_URL}/api/parking/spots")
        assert response.status_code == 200
        data = response.json()
        assert "spots" in data
        assert len(data["spots"]) > 0
        # Verify spot structure
        spot = data["spots"][0]
        assert "id" in spot
        assert "name" in spot
        assert "address" in spot
        assert "price_per_hour" in spot
        assert "available_spots" in spot
        assert "features" in spot
        print(f"Found {len(data['spots'])} parking spots")
    
    def test_create_parking_reservation(self, auth_session):
        """POST /api/parking/reservations creates a reservation (auth required)"""
        response = auth_session.post(f"{BASE_URL}/api/parking/reservations", json={
            "spot_id": "park_1",
            "spot_name": "Parking Gare du Nord",
            "vehicle_plate": "TEST-123-AB",
            "start_time": "2026-02-15T10:00:00Z",
            "end_time": "2026-02-15T14:00:00Z",
            "duration_hours": 4,
            "total_price": 18.00
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["spot_id"] == "park_1"
        assert data["vehicle_plate"] == "TEST-123-AB"
        assert data["status"] == "active"
        print(f"Created parking reservation: {data['id']}")
    
    def test_create_parking_reservation_requires_auth(self):
        """POST /api/parking/reservations requires authentication"""
        response = requests.post(f"{BASE_URL}/api/parking/reservations", json={
            "spot_id": "park_1",
            "start_time": "2026-02-15T10:00:00Z",
            "end_time": "2026-02-15T14:00:00Z"
        })
        assert response.status_code == 401


# ==========================================
# GIFT CARDS TESTS
# ==========================================
class TestGiftCards:
    """Gift Cards API tests"""
    
    def test_get_giftcard_templates(self):
        """GET /api/giftcards/templates returns templates and amounts"""
        response = requests.get(f"{BASE_URL}/api/giftcards/templates")
        assert response.status_code == 200
        data = response.json()
        assert "templates" in data
        assert "amounts" in data
        assert len(data["templates"]) > 0
        assert len(data["amounts"]) > 0
        # Verify template structure
        template = data["templates"][0]
        assert "id" in template
        assert "name" in template
        assert "category" in template
        assert "image_url" in template
        print(f"Found {len(data['templates'])} gift card templates, amounts: {data['amounts']}")
    
    def test_purchase_giftcard(self, auth_session):
        """POST /api/giftcards/purchase creates a gift card (auth required)"""
        response = auth_session.post(f"{BASE_URL}/api/giftcards/purchase", json={
            "template_id": "gc_tmpl_1",
            "amount": 50,
            "recipient_name": "TEST_Recipient",
            "recipient_email": "test@example.com",
            "message": "Happy Birthday!"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert "code" in data
        assert data["amount"] == 50
        assert data["status"] == "active"
        assert data["redeemed"] == False
        assert data["code"].startswith("SB-")
        print(f"Created gift card: {data['id']} with code {data['code']}")
        return data["code"]
    
    def test_redeem_giftcard_invalid_code(self, auth_session):
        """POST /api/giftcards/redeem with invalid code returns 404"""
        response = auth_session.post(f"{BASE_URL}/api/giftcards/redeem", json={
            "code": "INVALID-CODE-123"
        })
        assert response.status_code == 404
        print("Invalid gift card code correctly rejected")
    
    def test_purchase_giftcard_requires_auth(self):
        """POST /api/giftcards/purchase requires authentication"""
        response = requests.post(f"{BASE_URL}/api/giftcards/purchase", json={
            "template_id": "gc_tmpl_1",
            "amount": 50
        })
        assert response.status_code == 401
    
    def test_redeem_giftcard_requires_auth(self):
        """POST /api/giftcards/redeem requires authentication"""
        response = requests.post(f"{BASE_URL}/api/giftcards/redeem", json={
            "code": "SB-TEST1234"
        })
        assert response.status_code == 401


# ==========================================
# TRACKING SERVICE TESTS
# ==========================================
class TestTracking:
    """Tracking Service API tests"""
    
    created_member_id = None
    
    def test_get_tracked_members(self, auth_session):
        """GET /api/tracking/members lists tracked members (auth required)"""
        response = auth_session.get(f"{BASE_URL}/api/tracking/members")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} tracked members")
    
    def test_add_tracked_member(self, auth_session):
        """POST /api/tracking/members adds a tracked member (auth required)"""
        response = auth_session.post(f"{BASE_URL}/api/tracking/members", json={
            "name": "TEST_Marie Dupont",
            "phone": "+33612345678",
            "relationship": "family"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert "pairing_code" in data
        assert data["name"] == "TEST_Marie Dupont"
        assert data["relationship"] == "family"
        assert data["status"] == "pending"
        TestTracking.created_member_id = data["id"]
        print(f"Added tracked member: {data['id']} with pairing code {data['pairing_code']}")
    
    def test_delete_tracked_member(self, auth_session):
        """DELETE /api/tracking/members/{id} removes a tracked member (auth required)"""
        if not TestTracking.created_member_id:
            pytest.skip("No member created to delete")
        
        response = auth_session.delete(f"{BASE_URL}/api/tracking/members/{TestTracking.created_member_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Member removed"
        print(f"Deleted tracked member: {TestTracking.created_member_id}")
    
    def test_get_tracked_members_requires_auth(self):
        """GET /api/tracking/members requires authentication"""
        response = requests.get(f"{BASE_URL}/api/tracking/members")
        assert response.status_code == 401
    
    def test_add_tracked_member_requires_auth(self):
        """POST /api/tracking/members requires authentication"""
        response = requests.post(f"{BASE_URL}/api/tracking/members", json={
            "name": "Test",
            "relationship": "family"
        })
        assert response.status_code == 401
    
    def test_delete_tracked_member_requires_auth(self):
        """DELETE /api/tracking/members/{id} requires authentication"""
        response = requests.delete(f"{BASE_URL}/api/tracking/members/test_id")
        assert response.status_code == 401


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
