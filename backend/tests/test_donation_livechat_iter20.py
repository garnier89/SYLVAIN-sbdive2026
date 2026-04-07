"""
Iteration 20 - Donation and LiveChat Feature Tests
Tests for:
- GET /api/donations - returns donation list
- POST /api/donations - creates donation (admin only)
- POST /api/livechat/send - sends message and returns auto-reply
- GET /api/livechat/messages - returns chat history
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
USER_PHONE = "+33 6 12 34 56 78"
USER_PASSWORD = "TestUser123!"
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"


class TestDonationEndpoints:
    """Tests for donation endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def get_user_token(self):
        """Login as regular user and get token"""
        # Phone-based login endpoint
        resp = self.session.post(f"{BASE_URL}/api/auth/phone-login", json={
            "phone": USER_PHONE,
            "password": USER_PASSWORD
        })
        if resp.status_code != 200:
            pytest.skip(f"User login failed: {resp.status_code} - {resp.text}")
        
        data = resp.json()
        return data.get("access_token")
    
    def get_admin_token(self):
        """Login as admin and get token"""
        # Admin uses email-based login
        resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if resp.status_code != 200:
            pytest.skip(f"Admin login failed: {resp.status_code} - {resp.text}")
        
        data = resp.json()
        return data.get("access_token")
    
    def test_get_donations_without_auth_returns_401(self):
        """GET /api/donations without auth should return 401"""
        resp = self.session.get(f"{BASE_URL}/api/donations")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print("PASS: GET /api/donations without auth returns 401")
    
    def test_get_donations_with_auth_returns_list(self):
        """GET /api/donations with auth should return donation list"""
        token = self.get_user_token()
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        resp = self.session.get(f"{BASE_URL}/api/donations")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: GET /api/donations returns list with {len(data)} donations")
        
        # If there are donations, verify structure
        if len(data) > 0:
            donation = data[0]
            assert "id" in donation, "Donation should have id"
            assert "title" in donation, "Donation should have title"
            assert "description" in donation, "Donation should have description"
            assert "link" in donation, "Donation should have link"
            print(f"PASS: Donation structure verified - title: {donation.get('title')}")
    
    def test_create_donation_as_user_returns_403(self):
        """POST /api/donations as regular user should return 403"""
        token = self.get_user_token()
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        resp = self.session.post(f"{BASE_URL}/api/donations", json={
            "title": "Test Donation",
            "description": "Test description",
            "link": "https://example.com/donate"
        })
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print("PASS: POST /api/donations as user returns 403 (admin only)")
    
    def test_create_donation_as_admin_succeeds(self):
        """POST /api/donations as admin should create donation"""
        token = self.get_admin_token()
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        unique_title = f"Test Donation {uuid.uuid4().hex[:8]}"
        resp = self.session.post(f"{BASE_URL}/api/donations", json={
            "title": unique_title,
            "description": "Test donation for automated testing",
            "link": "https://example.com/donate-test",
            "image": "https://example.com/image.jpg",
            "display_order": 99
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        assert data.get("title") == unique_title, "Title should match"
        assert "id" in data, "Response should have id"
        assert data.get("status") == "active", "Status should be active"
        print(f"PASS: POST /api/donations as admin creates donation - id: {data.get('id')}")


class TestLiveChatEndpoints:
    """Tests for live chat endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def get_user_token(self):
        """Login as regular user and get token"""
        # Phone-based login endpoint
        resp = self.session.post(f"{BASE_URL}/api/auth/phone-login", json={
            "phone": USER_PHONE,
            "password": USER_PASSWORD
        })
        if resp.status_code != 200:
            pytest.skip(f"User login failed: {resp.status_code} - {resp.text}")
        
        data = resp.json()
        return data.get("access_token")
    
    def test_get_messages_without_auth_returns_401(self):
        """GET /api/livechat/messages without auth should return 401"""
        resp = self.session.get(f"{BASE_URL}/api/livechat/messages")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print("PASS: GET /api/livechat/messages without auth returns 401")
    
    def test_get_messages_with_auth_returns_list(self):
        """GET /api/livechat/messages with auth should return message list"""
        token = self.get_user_token()
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        resp = self.session.get(f"{BASE_URL}/api/livechat/messages")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: GET /api/livechat/messages returns list with {len(data)} messages")
    
    def test_send_message_without_auth_returns_401(self):
        """POST /api/livechat/send without auth should return 401"""
        resp = self.session.post(f"{BASE_URL}/api/livechat/send", json={
            "message": "Test message"
        })
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print("PASS: POST /api/livechat/send without auth returns 401")
    
    def test_send_empty_message_returns_400(self):
        """POST /api/livechat/send with empty message should return 400"""
        token = self.get_user_token()
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        resp = self.session.post(f"{BASE_URL}/api/livechat/send", json={
            "message": ""
        })
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        print("PASS: POST /api/livechat/send with empty message returns 400")
    
    def test_send_message_returns_user_message_and_reply(self):
        """POST /api/livechat/send should return user message and auto-reply"""
        token = self.get_user_token()
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        test_message = f"Test message {uuid.uuid4().hex[:8]}"
        resp = self.session.post(f"{BASE_URL}/api/livechat/send", json={
            "message": test_message
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        assert "user_message" in data, "Response should have user_message"
        assert "reply" in data, "Response should have reply"
        
        user_msg = data["user_message"]
        assert user_msg.get("message") == test_message, "User message should match"
        assert user_msg.get("sender") == "user", "Sender should be user"
        assert "id" in user_msg, "User message should have id"
        
        reply = data["reply"]
        assert reply.get("sender") == "support", "Reply sender should be support"
        assert "message" in reply, "Reply should have message"
        print(f"PASS: POST /api/livechat/send returns user message and auto-reply")
        print(f"  User message: {user_msg.get('message')}")
        print(f"  Auto-reply: {reply.get('message')}")
    
    def test_send_bonjour_gets_greeting_reply(self):
        """POST /api/livechat/send with 'bonjour' should get greeting reply"""
        token = self.get_user_token()
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        resp = self.session.post(f"{BASE_URL}/api/livechat/send", json={
            "message": "Bonjour!"
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        reply = data.get("reply", {})
        reply_text = reply.get("message", "")
        
        assert "Bonjour" in reply_text or "aider" in reply_text, \
            f"Reply should contain greeting, got: {reply_text}"
        print(f"PASS: 'bonjour' keyword triggers greeting reply: {reply_text}")
    
    def test_send_aide_gets_help_reply(self):
        """POST /api/livechat/send with 'aide' should get help reply"""
        token = self.get_user_token()
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        resp = self.session.post(f"{BASE_URL}/api/livechat/send", json={
            "message": "J'ai besoin d'aide"
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        reply = data.get("reply", {})
        reply_text = reply.get("message", "")
        
        assert "aider" in reply_text or "problème" in reply_text, \
            f"Reply should contain help response, got: {reply_text}"
        print(f"PASS: 'aide' keyword triggers help reply: {reply_text}")
    
    def test_send_paiement_gets_payment_reply(self):
        """POST /api/livechat/send with 'paiement' should get payment reply"""
        token = self.get_user_token()
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        resp = self.session.post(f"{BASE_URL}/api/livechat/send", json={
            "message": "Problème de paiement"
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        reply = data.get("reply", {})
        reply_text = reply.get("message", "")
        
        assert "paiement" in reply_text or "portefeuille" in reply_text, \
            f"Reply should contain payment response, got: {reply_text}"
        print(f"PASS: 'paiement' keyword triggers payment reply: {reply_text}")
    
    def test_messages_persist_after_send(self):
        """Messages should persist and be retrievable via GET"""
        token = self.get_user_token()
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Send a unique message
        unique_msg = f"Persistence test {uuid.uuid4().hex[:8]}"
        resp = self.session.post(f"{BASE_URL}/api/livechat/send", json={
            "message": unique_msg
        })
        assert resp.status_code == 200, f"Send failed: {resp.status_code}"
        
        # Get messages and verify persistence
        resp = self.session.get(f"{BASE_URL}/api/livechat/messages")
        assert resp.status_code == 200, f"Get messages failed: {resp.status_code}"
        
        messages = resp.json()
        user_messages = [m for m in messages if m.get("sender") == "user"]
        support_messages = [m for m in messages if m.get("sender") == "support"]
        
        # Check that our message is in the list
        found = any(m.get("message") == unique_msg for m in user_messages)
        assert found, f"Sent message not found in message history"
        
        # Check that there's at least one support reply
        assert len(support_messages) > 0, "Should have support replies"
        
        print(f"PASS: Messages persist - {len(user_messages)} user msgs, {len(support_messages)} support msgs")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
