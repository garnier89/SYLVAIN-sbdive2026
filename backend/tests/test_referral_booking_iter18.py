"""
Iteration 18 - Referral System and Enhanced Booking Tests
Tests:
1. Referral code generation (GET /api/referral/my-code)
2. Referral code validation (POST /api/referral/validate)
3. Referral application (POST /api/referral/apply)
4. Referral stats (GET /api/referral/stats)
5. Phone registration with referral code (POST /api/auth/phone-register)
6. Enhanced ride creation with V3Cube fields (POST /api/rides)
"""

import pytest
import requests
import os
import random
import string

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from context
EXISTING_USER_PHONE = "+33 6 12 34 56 78"
EXISTING_USER_PASSWORD = "TestUser123!"
EXISTING_USER_REFERRAL_CODE = "SB-KZX17V"

class TestReferralSystem:
    """Tests for the referral/parrainage system"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and login existing user"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login existing user
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/phone-login",
            json={"phone": EXISTING_USER_PHONE, "password": EXISTING_USER_PASSWORD}
        )
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            # Store cookies for auth
            self.session.cookies.update(login_response.cookies)
        else:
            pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
    
    def test_get_my_referral_code(self):
        """GET /api/referral/my-code - should return user's referral code"""
        response = self.session.get(f"{BASE_URL}/api/referral/my-code")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "code" in data, "Response should contain 'code'"
        assert data["code"].startswith("SB-"), f"Code should start with 'SB-', got {data['code']}"
        assert len(data["code"]) == 9, f"Code should be 9 chars (SB-XXXXXX), got {len(data['code'])}"
        assert "total_referrals" in data, "Response should contain 'total_referrals'"
        assert "total_earned" in data, "Response should contain 'total_earned'"
        assert "amount_per_referral" in data, "Response should contain 'amount_per_referral'"
        assert data["amount_per_referral"] == 5.0, f"Amount per referral should be 5.0, got {data['amount_per_referral']}"
        assert "currency" in data, "Response should contain 'currency'"
        assert data["currency"] == "EUR", f"Currency should be EUR, got {data['currency']}"
        
        print(f"✓ GET /api/referral/my-code - Code: {data['code']}, Referrals: {data['total_referrals']}, Earned: {data['total_earned']}")
    
    def test_validate_referral_code_valid(self):
        """POST /api/referral/validate - valid code returns {valid: true, referrer_name}"""
        response = self.session.post(
            f"{BASE_URL}/api/referral/validate",
            json={"code": EXISTING_USER_REFERRAL_CODE}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("valid") == True, f"Expected valid=True, got {data}"
        assert "referrer_name" in data, "Response should contain 'referrer_name'"
        
        print(f"✓ POST /api/referral/validate (valid) - Referrer: {data['referrer_name']}")
    
    def test_validate_referral_code_invalid(self):
        """POST /api/referral/validate - invalid code returns 404"""
        response = self.session.post(
            f"{BASE_URL}/api/referral/validate",
            json={"code": "SB-INVALID"}
        )
        
        assert response.status_code == 404, f"Expected 404 for invalid code, got {response.status_code}: {response.text}"
        
        print("✓ POST /api/referral/validate (invalid) - Returns 404")
    
    def test_validate_referral_code_empty(self):
        """POST /api/referral/validate - empty code returns 400"""
        response = self.session.post(
            f"{BASE_URL}/api/referral/validate",
            json={"code": ""}
        )
        
        assert response.status_code == 400, f"Expected 400 for empty code, got {response.status_code}: {response.text}"
        
        print("✓ POST /api/referral/validate (empty) - Returns 400")
    
    def test_get_referral_stats(self):
        """GET /api/referral/stats - returns code, total_referrals, total_earned, amount_per_referral"""
        response = self.session.get(f"{BASE_URL}/api/referral/stats")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "code" in data, "Response should contain 'code'"
        assert "total_referrals" in data, "Response should contain 'total_referrals'"
        assert "total_earned" in data, "Response should contain 'total_earned'"
        assert "amount_per_referral" in data, "Response should contain 'amount_per_referral'"
        assert "currency" in data, "Response should contain 'currency'"
        assert "referrals" in data, "Response should contain 'referrals' list"
        
        print(f"✓ GET /api/referral/stats - Code: {data['code']}, Referrals: {data['total_referrals']}, Earned: {data['total_earned']}")
    
    def test_apply_referral_own_code_rejected(self):
        """POST /api/referral/apply - using own code should be rejected"""
        # First get user's own code
        my_code_response = self.session.get(f"{BASE_URL}/api/referral/my-code")
        my_code = my_code_response.json().get("code")
        
        # Try to apply own code
        response = self.session.post(
            f"{BASE_URL}/api/referral/apply",
            json={"code": my_code}
        )
        
        assert response.status_code == 400, f"Expected 400 for own code, got {response.status_code}: {response.text}"
        
        print("✓ POST /api/referral/apply (own code) - Correctly rejected with 400")


class TestPhoneRegisterWithReferral:
    """Tests for phone registration with referral code"""
    
    def test_register_with_valid_referral_code(self):
        """POST /api/auth/phone-register with referral_code credits both users"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Generate unique phone for new user
        random_suffix = ''.join(random.choices(string.digits, k=8))
        new_phone = f"+33 6 {random_suffix[:2]} {random_suffix[2:4]} {random_suffix[4:6]} {random_suffix[6:8]}"
        
        # Register with referral code
        response = session.post(
            f"{BASE_URL}/api/auth/phone-register",
            json={
                "phone": new_phone,
                "password": "NewTest123!",
                "name": "Test",
                "first_name": "Referral",
                "referral_code": EXISTING_USER_REFERRAL_CODE
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Response should contain 'access_token'"
        assert "user" in data, "Response should contain 'user'"
        
        # Verify new user has their own referral code
        user = data["user"]
        
        # Login as new user and check wallet
        new_session = requests.Session()
        new_session.headers.update({"Content-Type": "application/json"})
        new_session.cookies.update(response.cookies)
        new_session.headers.update({"Authorization": f"Bearer {data['access_token']}"})
        
        wallet_response = new_session.get(f"{BASE_URL}/api/wallet")
        if wallet_response.status_code == 200:
            wallet_data = wallet_response.json()
            # New user should have 5 EUR bonus
            assert wallet_data.get("balance", 0) >= 5.0, f"New user should have at least 5 EUR, got {wallet_data.get('balance')}"
            print(f"✓ New user wallet balance: {wallet_data.get('balance')} EUR")
        
        print(f"✓ POST /api/auth/phone-register with referral - User created: {user.get('name')}")
    
    def test_register_without_referral_code(self):
        """POST /api/auth/phone-register without referral_code works normally"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Generate unique phone
        random_suffix = ''.join(random.choices(string.digits, k=8))
        new_phone = f"+33 6 {random_suffix[:2]} {random_suffix[2:4]} {random_suffix[4:6]} {random_suffix[6:8]}"
        
        response = session.post(
            f"{BASE_URL}/api/auth/phone-register",
            json={
                "phone": new_phone,
                "password": "NoRef123!",
                "name": "NoReferral",
                "first_name": "User"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Response should contain 'access_token'"
        
        print("✓ POST /api/auth/phone-register without referral - Works normally")


class TestEnhancedRideBooking:
    """Tests for enhanced ride creation with V3Cube fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and login existing user"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login existing user
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/phone-login",
            json={"phone": EXISTING_USER_PHONE, "password": EXISTING_USER_PASSWORD}
        )
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            self.session.cookies.update(login_response.cookies)
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_create_ride_with_booking_no(self):
        """POST /api/rides creates ride with 8-digit booking_no"""
        response = self.session.post(
            f"{BASE_URL}/api/rides",
            json={
                "pickup_lat": 48.8566,
                "pickup_lng": 2.3522,
                "pickup_address": "Paris, France",
                "dropoff_lat": 48.8606,
                "dropoff_lng": 2.3376,
                "dropoff_address": "Louvre Museum, Paris",
                "vehicle_type": "sedan",
                "payment_method": "cash"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "booking_no" in data, "Response should contain 'booking_no'"
        booking_no = data["booking_no"]
        assert len(booking_no) == 8, f"booking_no should be 8 digits, got {len(booking_no)}"
        assert booking_no.isdigit(), f"booking_no should be numeric, got {booking_no}"
        
        print(f"✓ POST /api/rides - booking_no: {booking_no}")
    
    def test_create_ride_with_female_driver_request(self):
        """POST /api/rides with female_driver_request=true stores correctly"""
        response = self.session.post(
            f"{BASE_URL}/api/rides",
            json={
                "pickup_lat": 48.8566,
                "pickup_lng": 2.3522,
                "pickup_address": "Paris, France",
                "dropoff_lat": 48.8606,
                "dropoff_lng": 2.3376,
                "dropoff_address": "Louvre Museum, Paris",
                "vehicle_type": "sedan",
                "payment_method": "cash",
                "female_driver_request": True
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("female_driver_request") == True, f"female_driver_request should be True, got {data.get('female_driver_request')}"
        
        # Verify by fetching the ride
        ride_id = data["id"]
        get_response = self.session.get(f"{BASE_URL}/api/rides/{ride_id}")
        assert get_response.status_code == 200
        ride_data = get_response.json()
        assert ride_data.get("female_driver_request") == True, "female_driver_request should persist"
        
        print(f"✓ POST /api/rides with female_driver_request=true - Stored correctly")
    
    def test_create_ride_with_handicap_accessibility(self):
        """POST /api/rides with handicap_accessibility=true stores correctly"""
        response = self.session.post(
            f"{BASE_URL}/api/rides",
            json={
                "pickup_lat": 48.8566,
                "pickup_lng": 2.3522,
                "pickup_address": "Paris, France",
                "dropoff_lat": 48.8606,
                "dropoff_lng": 2.3376,
                "dropoff_address": "Louvre Museum, Paris",
                "vehicle_type": "sedan",
                "payment_method": "cash",
                "handicap_accessibility": True
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("handicap_accessibility") == True, f"handicap_accessibility should be True, got {data.get('handicap_accessibility')}"
        
        # Verify by fetching the ride
        ride_id = data["id"]
        get_response = self.session.get(f"{BASE_URL}/api/rides/{ride_id}")
        assert get_response.status_code == 200
        ride_data = get_response.json()
        assert ride_data.get("handicap_accessibility") == True, "handicap_accessibility should persist"
        
        print(f"✓ POST /api/rides with handicap_accessibility=true - Stored correctly")
    
    def test_create_ride_with_notes(self):
        """POST /api/rides with notes field stores correctly"""
        test_notes = "Please call when arriving. Gate code: 1234"
        
        response = self.session.post(
            f"{BASE_URL}/api/rides",
            json={
                "pickup_lat": 48.8566,
                "pickup_lng": 2.3522,
                "pickup_address": "Paris, France",
                "dropoff_lat": 48.8606,
                "dropoff_lng": 2.3376,
                "dropoff_address": "Louvre Museum, Paris",
                "vehicle_type": "sedan",
                "payment_method": "cash",
                "notes": test_notes
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("notes") == test_notes, f"notes should be '{test_notes}', got {data.get('notes')}"
        
        # Verify by fetching the ride
        ride_id = data["id"]
        get_response = self.session.get(f"{BASE_URL}/api/rides/{ride_id}")
        assert get_response.status_code == 200
        ride_data = get_response.json()
        assert ride_data.get("notes") == test_notes, "notes should persist"
        
        print(f"✓ POST /api/rides with notes - Stored correctly")
    
    def test_create_ride_with_all_v3cube_fields(self):
        """POST /api/rides with all V3Cube fields"""
        response = self.session.post(
            f"{BASE_URL}/api/rides",
            json={
                "pickup_lat": 48.8566,
                "pickup_lng": 2.3522,
                "pickup_address": "Paris, France",
                "dropoff_lat": 48.8606,
                "dropoff_lng": 2.3376,
                "dropoff_address": "Louvre Museum, Paris",
                "vehicle_type": "sedan",
                "payment_method": "cash",
                "auto_assign": False,
                "female_driver_request": True,
                "handicap_accessibility": True,
                "notes": "Test all fields"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "booking_no" in data and len(data["booking_no"]) == 8
        assert data.get("auto_assign") == False
        assert data.get("female_driver_request") == True
        assert data.get("handicap_accessibility") == True
        assert data.get("notes") == "Test all fields"
        
        print(f"✓ POST /api/rides with all V3Cube fields - All stored correctly")


class TestReferralApplyDuplicatePrevention:
    """Tests for preventing duplicate referral usage"""
    
    def test_apply_referral_twice_rejected(self):
        """POST /api/referral/apply - using code twice should be rejected"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Create a new user first
        random_suffix = ''.join(random.choices(string.digits, k=8))
        new_phone = f"+33 6 {random_suffix[:2]} {random_suffix[2:4]} {random_suffix[4:6]} {random_suffix[6:8]}"
        
        # Register without referral code
        reg_response = session.post(
            f"{BASE_URL}/api/auth/phone-register",
            json={
                "phone": new_phone,
                "password": "DupTest123!",
                "name": "Duplicate",
                "first_name": "Test"
            }
        )
        
        if reg_response.status_code != 200:
            pytest.skip(f"Registration failed: {reg_response.status_code}")
        
        data = reg_response.json()
        session.headers.update({"Authorization": f"Bearer {data['access_token']}"})
        session.cookies.update(reg_response.cookies)
        
        # First apply should work
        first_apply = session.post(
            f"{BASE_URL}/api/referral/apply",
            json={"code": EXISTING_USER_REFERRAL_CODE}
        )
        
        assert first_apply.status_code == 200, f"First apply should succeed, got {first_apply.status_code}: {first_apply.text}"
        
        # Second apply should fail
        second_apply = session.post(
            f"{BASE_URL}/api/referral/apply",
            json={"code": EXISTING_USER_REFERRAL_CODE}
        )
        
        assert second_apply.status_code == 400, f"Second apply should fail with 400, got {second_apply.status_code}: {second_apply.text}"
        
        print("✓ POST /api/referral/apply - Duplicate usage correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
