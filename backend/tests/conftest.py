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


@pytest.fixture(scope="session", autouse=True)
def ensure_demo_pro():
    """Grant SB Tracking Pro to the demo manager so premium-gated tests run green."""
    try:
        import requests
        from datetime import datetime, timezone, timedelta
        from pymongo import MongoClient
        base = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
        api = f"{base}/api"
        s = requests.Session()
        r = s.post(f"{api}/auth/login", json={"email": "famtester@demo.sb", "password": "FamTest123!"}, timeout=20)
        tok = r.json().get("access_token") or r.json().get("token")
        me = s.get(f"{api}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=20).json()
        mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        dbname = os.environ.get("DB_NAME", "test_database")
        expires = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
        mongo[dbname].pro_subscriptions.update_one(
            {"user_id": me.get("id")},
            {"$set": {"user_id": me.get("id"), "plan": "pro_annual", "status": "active", "expires_at": expires}},
            upsert=True)
        mongo.close()
    except Exception as e:
        print("conftest grant_pro skipped:", e)
    yield
