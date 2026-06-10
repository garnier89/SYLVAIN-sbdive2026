import os
import asyncio
import pytest

# Shared, never-closed event loop for the in-process async tests. Motor binds its
# client to the first loop it runs on; reusing asyncio.run() (which closes the
# loop) breaks subsequent async tests. A single persistent loop avoids that.
_SHARED_LOOP = None


def run_async(coro):
    global _SHARED_LOOP
    if _SHARED_LOOP is None or _SHARED_LOOP.is_closed():
        _SHARED_LOOP = asyncio.new_event_loop()
        asyncio.set_event_loop(_SHARED_LOOP)
    return _SHARED_LOOP.run_until_complete(coro)


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
