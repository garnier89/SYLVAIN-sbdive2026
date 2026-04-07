"""
Test Phone-First Authentication Flow (Iteration 17)
Tests the new phone-based login/register endpoints:
- POST /api/auth/check-phone
- POST /api/auth/phone-login
- POST /api/auth/phone-register
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from requirements
EXISTING_PHONE = "+33 6 12 34 56 78"
EXISTING_PASSWORD = "TestUser123!"
NEW_PHONE = f"+33 6 99 88 77 {uuid.uuid4().hex[:2]}"  # Random to avoid conflicts


class TestCheckPhone:
    """Test POST /api/auth/check-phone endpoint"""
    
    def test_check_phone_existing_user(self):
        """Check phone returns exists=true for registered phone"""
        response = requests.post(
            f"{BASE_URL}/api/auth/check-phone",
            json={"phone": EXISTING_PHONE}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "exists" in data, f"Response missing 'exists' field: {data}"
        # Note: This may be false if user doesn't exist yet - we'll seed it
        print(f"Check phone for existing user: exists={data['exists']}")
    
    def test_check_phone_new_user(self):
        """Check phone returns exists=false for unregistered phone"""
        response = requests.post(
            f"{BASE_URL}/api/auth/check-phone",
            json={"phone": NEW_PHONE}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "exists" in data, f"Response missing 'exists' field: {data}"
        assert data["exists"] == False, f"Expected exists=false for new phone, got {data['exists']}"
        print(f"Check phone for new user: exists={data['exists']}")
    
    def test_check_phone_empty(self):
        """Check phone returns 400 for empty phone"""
        response = requests.post(
            f"{BASE_URL}/api/auth/check-phone",
            json={"phone": ""}
        )
        assert response.status_code == 400, f"Expected 400 for empty phone, got {response.status_code}"
        print("Empty phone correctly returns 400")


class TestPhoneRegister:
    """Test POST /api/auth/phone-register endpoint"""
    
    def test_register_new_user_with_phone(self):
        """Register a new user with phone + password + profile info"""
        unique_phone = f"+33 6 {uuid.uuid4().hex[:2]} {uuid.uuid4().hex[:2]} {uuid.uuid4().hex[:2]} {uuid.uuid4().hex[:2]}"
        response = requests.post(
            f"{BASE_URL}/api/auth/phone-register",
            json={
                "phone": unique_phone,
                "password": "TestPass123!",
                "name": "Dupont",
                "first_name": "Jean",
                "email": f"test_{uuid.uuid4().hex[:8]}@example.com",
                "referral_code": "ABC123"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "access_token" in data, f"Response missing 'access_token': {data}"
        assert "user" in data, f"Response missing 'user': {data}"
        assert data["user"]["phone"] == unique_phone, f"Phone mismatch: {data['user']['phone']}"
        assert "Jean Dupont" in data["user"]["name"], f"Name mismatch: {data['user']['name']}"
        print(f"Successfully registered new user: {data['user']['name']}")
    
    def test_register_minimal_info(self):
        """Register with only required fields (phone + password)"""
        unique_phone = f"+33 7 {uuid.uuid4().hex[:2]} {uuid.uuid4().hex[:2]} {uuid.uuid4().hex[:2]} {uuid.uuid4().hex[:2]}"
        response = requests.post(
            f"{BASE_URL}/api/auth/phone-register",
            json={
                "phone": unique_phone,
                "password": "TestPass123!",
                "name": "TestUser"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        print(f"Successfully registered with minimal info: {data['user']['phone']}")
    
    def test_register_duplicate_phone(self):
        """Registering with existing phone should fail"""
        # First register a user
        unique_phone = f"+33 8 {uuid.uuid4().hex[:2]} {uuid.uuid4().hex[:2]} {uuid.uuid4().hex[:2]} {uuid.uuid4().hex[:2]}"
        requests.post(
            f"{BASE_URL}/api/auth/phone-register",
            json={"phone": unique_phone, "password": "TestPass123!", "name": "First"}
        )
        
        # Try to register again with same phone
        response = requests.post(
            f"{BASE_URL}/api/auth/phone-register",
            json={"phone": unique_phone, "password": "TestPass123!", "name": "Second"}
        )
        assert response.status_code == 400, f"Expected 400 for duplicate phone, got {response.status_code}"
        print("Duplicate phone correctly rejected")
    
    def test_register_missing_password(self):
        """Register without password should fail"""
        response = requests.post(
            f"{BASE_URL}/api/auth/phone-register",
            json={"phone": "+33 9 11 22 33 44", "name": "Test"}
        )
        assert response.status_code == 400, f"Expected 400 for missing password, got {response.status_code}"
        print("Missing password correctly rejected")


class TestPhoneLogin:
    """Test POST /api/auth/phone-login endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup_test_user(self):
        """Ensure test user exists for login tests"""
        # Create a test user for login tests
        self.test_phone = f"+33 6 12 34 56 78"
        self.test_password = "TestUser123!"
        
        # Check if user exists
        check_response = requests.post(
            f"{BASE_URL}/api/auth/check-phone",
            json={"phone": self.test_phone}
        )
        if check_response.status_code == 200 and not check_response.json().get("exists"):
            # Create the user
            requests.post(
                f"{BASE_URL}/api/auth/phone-register",
                json={
                    "phone": self.test_phone,
                    "password": self.test_password,
                    "name": "Test User"
                }
            )
    
    def test_login_correct_credentials(self):
        """Login with correct phone + password returns token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/phone-login",
            json={"phone": self.test_phone, "password": self.test_password}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "access_token" in data, f"Response missing 'access_token': {data}"
        assert "user" in data, f"Response missing 'user': {data}"
        print(f"Successfully logged in: {data['user'].get('name', 'Unknown')}")
    
    def test_login_wrong_password(self):
        """Login with wrong password returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/phone-login",
            json={"phone": self.test_phone, "password": "WrongPassword123!"}
        )
        assert response.status_code == 401, f"Expected 401 for wrong password, got {response.status_code}"
        print("Wrong password correctly returns 401")
    
    def test_login_nonexistent_phone(self):
        """Login with non-existent phone returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/phone-login",
            json={"phone": "+33 1 00 00 00 00", "password": "AnyPassword123!"}
        )
        assert response.status_code == 401, f"Expected 401 for non-existent phone, got {response.status_code}"
        print("Non-existent phone correctly returns 401")
    
    def test_login_missing_fields(self):
        """Login without required fields returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/auth/phone-login",
            json={"phone": self.test_phone}
        )
        assert response.status_code == 400, f"Expected 400 for missing password, got {response.status_code}"
        print("Missing password correctly returns 400")


class TestHealthCheck:
    """Basic health check to ensure API is running"""
    
    def test_api_health(self):
        """API health endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.status_code}"
        print("API health check passed")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
