import os
import pytest

@pytest.fixture
def api_url():
    return os.environ.get("TEST_API_URL", os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001"))

@pytest.fixture
def admin_credentials():
    return {
        "email": os.environ.get("TEST_ADMIN_EMAIL", "admin@superapp.com"),
        "password": os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!"),
    }

@pytest.fixture
def test_user_credentials():
    return {
        "email": os.environ.get("TEST_USER_EMAIL", "test2@example.com"),
        "password": os.environ.get("TEST_USER_PASSWORD", "TestPass123!"),
    }
