import os
import pytest

@pytest.fixture
def api_url():
    return os.environ.get("TEST_API_URL", os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001"))

@pytest.fixture
def admin_credentials():
    from _creds import ADMIN_EMAIL, ADMIN_PASSWORD
    return {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}

@pytest.fixture
def test_user_credentials():
    from _creds import TEST_USER_EMAIL, TEST_USER_PASSWORD
    return {"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}
