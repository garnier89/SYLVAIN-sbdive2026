"""
Test V3Cube-style Login Page and Auth APIs - Iteration 21
Tests: check-phone, phone-login, phone-register endpoints
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCheckPhoneAPI:
    """Test /api/auth/check-phone endpoint"""
    
    def test_check_phone_existing_user(self):
        """Test check-phone returns exists=true for existing user"""
        response = requests.post(
            f"{BASE_URL}/api/auth/check-phone",
            json={"phone": "+33 699887766"},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "exists" in data
        assert data["exists"] == True
        print(f"✓ Check phone (existing): {data}")
    
    def test_check_phone_new_user(self):
        """Test check-phone returns exists=false for new phone"""
        random_phone = f"+33 {uuid.uuid4().hex[:9]}"
        response = requests.post(
            f"{BASE_URL}/api/auth/check-phone",
            json={"phone": random_phone},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "exists" in data
        assert data["exists"] == False
        print(f"✓ Check phone (new): {data}")
    
    def test_check_phone_empty(self):
        """Test check-phone returns 400 for empty phone"""
        response = requests.post(
            f"{BASE_URL}/api/auth/check-phone",
            json={"phone": ""},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 400
        print(f"✓ Check phone (empty) returns 400")


class TestPhoneLoginAPI:
    """Test /api/auth/phone-login endpoint"""
    
    def test_phone_login_success(self):
        """Test successful login with phone + password"""
        response = requests.post(
            f"{BASE_URL}/api/auth/phone-login",
            json={"phone": "+33 699887766", "password": "Test1234!"},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["phone"] == "+33 699887766"
        print(f"✓ Phone login success: user={data['user']['name']}")
    
    def test_phone_login_wrong_password(self):
        """Test login fails with wrong password"""
        response = requests.post(
            f"{BASE_URL}/api/auth/phone-login",
            json={"phone": "+33 699887766", "password": "WrongPassword123"},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        print(f"✓ Phone login wrong password: {data['detail']}")
    
    def test_phone_login_nonexistent_user(self):
        """Test login fails for non-existent phone"""
        response = requests.post(
            f"{BASE_URL}/api/auth/phone-login",
            json={"phone": "+33 000000000", "password": "Test1234!"},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 401
        print(f"✓ Phone login non-existent user returns 401")
    
    def test_phone_login_empty_fields(self):
        """Test login fails with empty fields"""
        response = requests.post(
            f"{BASE_URL}/api/auth/phone-login",
            json={"phone": "", "password": ""},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 400
        print(f"✓ Phone login empty fields returns 400")


class TestPhoneRegisterAPI:
    """Test /api/auth/phone-register endpoint"""
    
    def test_phone_register_success(self):
        """Test successful registration with phone + password + profile"""
        unique_phone = f"+33 TEST{uuid.uuid4().hex[:6]}"
        response = requests.post(
            f"{BASE_URL}/api/auth/phone-register",
            json={
                "phone": unique_phone,
                "password": "NewUser123!",
                "name": "Testeur",
                "first_name": "Jean",
                "email": f"test_{uuid.uuid4().hex[:6]}@test.com"
            },
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["phone"] == unique_phone
        assert "Jean Testeur" in data["user"]["name"]
        print(f"✓ Phone register success: user={data['user']['name']}, phone={data['user']['phone']}")
    
    def test_phone_register_duplicate_phone(self):
        """Test registration fails for existing phone"""
        response = requests.post(
            f"{BASE_URL}/api/auth/phone-register",
            json={
                "phone": "+33 699887766",
                "password": "Test1234!",
                "name": "Duplicate"
            },
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 400
        data = response.json()
        assert "déjà inscrit" in data["detail"].lower() or "already" in data["detail"].lower()
        print(f"✓ Phone register duplicate: {data['detail']}")
    
    def test_phone_register_empty_fields(self):
        """Test registration fails with empty required fields"""
        response = requests.post(
            f"{BASE_URL}/api/auth/phone-register",
            json={"phone": "", "password": ""},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 400
        print(f"✓ Phone register empty fields returns 400")


class TestAdminLogin:
    """Test admin login via email"""
    
    def test_admin_login_success(self):
        """Test admin can login with email/password"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@superapp.com", "password": "SuperAdmin123!"},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login success: role={data['user']['role']}")


class TestHealthEndpoint:
    """Test health endpoint"""
    
    def test_health(self):
        """Test health endpoint returns ok"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        print(f"✓ Health check: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
