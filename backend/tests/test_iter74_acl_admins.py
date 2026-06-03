"""Iteration 74 — ACL Admin CRUD tests (matches V3Cube/XJekPlus Administrator page).

Covers the 4 new endpoints under /api/acl/admins:
- POST   /api/acl/admins                          create admin
- PUT    /api/acl/admins/{id}                     partial update
- DELETE /api/acl/admins/{id}                     delete admin (cannot self-delete)
- POST   /api/acl/admins/{id}/toggle-status       toggle is_active

Also smoke-tests the existing /api/acl/roles and /api/acl/users endpoints used
by the new frontend pages /admin/groups and /admin/admins.
"""
import os
import uuid
import pytest
import requests

from _creds import ADMIN_EMAIL, ADMIN_PASSWORD

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or os.environ.get("TEST_API_URL")
            or "https://sb-drive-vtc.preview.emergentagent.com").rstrip("/")


# ---------- helpers / fixtures ----------

@pytest.fixture(scope="module")
def super_admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"super-admin login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"no token in response: {data}"
    return token


@pytest.fixture(scope="module")
def auth_headers(super_admin_token):
    return {"Authorization": f"Bearer {super_admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def roles_map(auth_headers):
    r = requests.get(f"{BASE_URL}/api/acl/roles", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text[:200]
    items = r.json().get("items", [])
    assert items, "no roles seeded"
    return {role["name"]: role for role in items}


# ---------- /api/acl/roles seed sanity ----------

class TestAclRolesSeed:
    def test_seven_default_system_roles_present(self, roles_map):
        expected = {"billing", "crm_drivers", "crm_merchants", "crm_users",
                    "dispatcher", "super_admin", "sysadmin"}
        assert expected.issubset(set(roles_map.keys())), \
            f"missing roles: {expected - set(roles_map.keys())}"

    def test_system_roles_have_is_system_flag(self, roles_map):
        for name in ["super_admin", "dispatcher", "billing"]:
            assert roles_map[name].get("is_system") is True

    def test_permissions_registry_returns_items(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/acl/permissions/registry",
                         headers=auth_headers, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["total"] > 20
        assert isinstance(d["items"], list)
        assert "key" in d["items"][0] and "label" in d["items"][0]


# ---------- /api/acl/admins CRUD ----------

class TestAclAdminsCrud:
    @pytest.fixture(scope="class")
    def crm_drivers_role_id(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/acl/roles", headers=auth_headers, timeout=10)
        items = r.json()["items"]
        for it in items:
            if it["name"] == "crm_drivers":
                return it["id"]
        pytest.skip("crm_drivers role not seeded")

    @pytest.fixture(scope="class")
    def dispatcher_role_id(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/acl/roles", headers=auth_headers, timeout=10)
        for it in r.json()["items"]:
            if it["name"] == "dispatcher":
                return it["id"]
        pytest.skip("dispatcher role not seeded")

    def _unique_email(self):
        return f"TEST_iter74_{uuid.uuid4().hex[:8]}@example.com"

    def test_list_admins_returns_super_admin(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/acl/users", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        emails = [u["email"] for u in items]
        assert ADMIN_EMAIL in emails
        # password_hash must NOT be exposed
        for u in items:
            assert "password_hash" not in u

    def test_create_admin_success_and_login(self, auth_headers, crm_drivers_role_id):
        email = self._unique_email()
        password = os.environ.get("TEST_NEW_ADMIN_PASSWORD", "TestIter74Pass!")
        payload = {
            "first_name": "TestIter74",
            "last_name": "Doe",
            "email": email,
            "password": password,
            "role_id": crm_drivers_role_id,
        }
        r = requests.post(f"{BASE_URL}/api/acl/admins", headers=auth_headers,
                          json=payload, timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        data = r.json()

        # response shape
        assert data["email"] == email.lower()
        assert data["first_name"] == "TestIter74"
        assert data["last_name"] == "Doe"
        assert data["role"] == "admin"
        assert data["role_name"] == "crm_drivers"
        assert crm_drivers_role_id in data["role_ids"]
        assert data["is_active"] is True
        # password must NOT be returned
        assert "password_hash" not in data
        assert "password" not in data

        new_id = data["id"]

        # verify persistence by listing
        r2 = requests.get(f"{BASE_URL}/api/acl/users", headers=auth_headers, timeout=10)
        emails = [u["email"] for u in r2.json()["items"]]
        assert email.lower() in emails

        # the newly-created admin can login via email/password
        r3 = requests.post(f"{BASE_URL}/api/auth/login",
                           json={"email": email, "password": password}, timeout=15)
        assert r3.status_code == 200, f"new admin cannot login: {r3.text[:200]}"
        login_data = r3.json()
        user = login_data.get("user") or {}
        assert user.get("role") == "admin"

        # cleanup happens in test_delete_admin_cleanup below — store via class attribute
        TestAclAdminsCrud.created_id = new_id
        TestAclAdminsCrud.created_email = email

    def test_create_admin_duplicate_email_returns_400(self, auth_headers, crm_drivers_role_id):
        payload = {
            "first_name": "Dup", "last_name": "User",
            "email": ADMIN_EMAIL,  # already in DB
            "password": "x", "role_id": crm_drivers_role_id,
        }
        r = requests.post(f"{BASE_URL}/api/acl/admins", headers=auth_headers,
                          json=payload, timeout=10)
        assert r.status_code == 400
        assert "email" in r.text.lower() or "déjà" in r.text.lower() or "deja" in r.text.lower()

    def test_create_admin_invalid_role_returns_400(self, auth_headers):
        payload = {
            "first_name": "Bad", "last_name": "Role",
            "email": self._unique_email(), "password": "x",
            "role_id": "role_does_not_exist",
        }
        r = requests.post(f"{BASE_URL}/api/acl/admins", headers=auth_headers,
                          json=payload, timeout=10)
        assert r.status_code == 400

    def test_update_admin_partial_fields(self, auth_headers, dispatcher_role_id):
        uid = TestAclAdminsCrud.created_id
        r = requests.put(f"{BASE_URL}/api/acl/admins/{uid}", headers=auth_headers,
                         json={"first_name": "Updated74", "role_id": dispatcher_role_id},
                         timeout=10)
        assert r.status_code == 200, r.text[:200]
        assert r.json().get("updated") is True

        # verify via GET list
        items = requests.get(f"{BASE_URL}/api/acl/users", headers=auth_headers,
                             timeout=10).json()["items"]
        updated = next(u for u in items if u["id"] == uid)
        assert updated["first_name"] == "Updated74"
        assert updated["role_name"] == "dispatcher"

    def test_update_admin_email_collision_returns_400(self, auth_headers):
        uid = TestAclAdminsCrud.created_id
        r = requests.put(f"{BASE_URL}/api/acl/admins/{uid}", headers=auth_headers,
                         json={"email": ADMIN_EMAIL}, timeout=10)
        assert r.status_code == 400

    def test_update_admin_not_found_returns_404(self, auth_headers):
        r = requests.put(f"{BASE_URL}/api/acl/admins/user_does_not_exist",
                         headers=auth_headers, json={"first_name": "X"}, timeout=10)
        assert r.status_code == 404

    def test_toggle_status_flips_is_active(self, auth_headers):
        uid = TestAclAdminsCrud.created_id
        r1 = requests.post(f"{BASE_URL}/api/acl/admins/{uid}/toggle-status",
                           headers=auth_headers, timeout=10)
        assert r1.status_code == 200
        first = r1.json()["is_active"]
        assert isinstance(first, bool)

        r2 = requests.post(f"{BASE_URL}/api/acl/admins/{uid}/toggle-status",
                           headers=auth_headers, timeout=10)
        assert r2.status_code == 200
        assert r2.json()["is_active"] is not first

    def test_toggle_status_unknown_returns_404(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/acl/admins/user_nope/toggle-status",
                          headers=auth_headers, timeout=10)
        assert r.status_code == 404

    def test_cannot_delete_self(self, auth_headers):
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=10).json()
        my_id = me.get("id")
        if not my_id:
            pytest.skip("auth/me did not return id")
        r = requests.delete(f"{BASE_URL}/api/acl/admins/{my_id}", headers=auth_headers, timeout=10)
        assert r.status_code == 400

    def test_delete_admin_cleanup_and_verify(self, auth_headers):
        uid = TestAclAdminsCrud.created_id
        r = requests.delete(f"{BASE_URL}/api/acl/admins/{uid}", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert r.json().get("deleted") is True

        # subsequent delete returns 404
        r2 = requests.delete(f"{BASE_URL}/api/acl/admins/{uid}", headers=auth_headers, timeout=10)
        assert r2.status_code == 404

        # no longer listed
        items = requests.get(f"{BASE_URL}/api/acl/users", headers=auth_headers,
                             timeout=10).json()["items"]
        assert TestAclAdminsCrud.created_email.lower() not in [u["email"] for u in items]


# ---------- Auth-guard regression ----------

class TestAclAdminsAuthGuard:
    def test_create_without_auth_returns_401_or_403(self):
        r = requests.post(f"{BASE_URL}/api/acl/admins",
                          json={"first_name": "x", "last_name": "y",
                                "email": "x@y.z", "password": "a", "role_id": "r"},
                          timeout=10)
        assert r.status_code in (401, 403)

    def test_non_admin_user_cannot_create(self):
        # login as regular test user (from _creds)
        from _creds import TEST_USER_EMAIL, TEST_USER_PASSWORD
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD},
                          timeout=15)
        if r.status_code != 200:
            pytest.skip("test user not available")
        token = r.json().get("access_token") or r.json().get("token")
        r2 = requests.post(
            f"{BASE_URL}/api/acl/admins",
            headers={"Authorization": f"Bearer {token}"},
            json={"first_name": "x", "last_name": "y",
                  "email": "x@y.z", "password": "a", "role_id": "r"},
            timeout=10,
        )
        assert r2.status_code == 403
