import requests
import sys
import json
from datetime import datetime

class SuperAppAPITester:
    def __init__(self, base_url="https://gojek-clone-41.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.admin_token = None
        self.merchant_token = None
        self.cookies = {}
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None, use_admin=False, use_merchant=False):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        if headers:
            test_headers.update(headers)
            
        if use_admin and self.admin_token:
            test_headers['Authorization'] = f'Bearer {self.admin_token}'
        elif use_merchant and self.merchant_token:
            test_headers['Authorization'] = f'Bearer {self.merchant_token}'
        elif self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, cookies=self.cookies, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, cookies=self.cookies, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, cookies=self.cookies, timeout=30)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                if response.cookies:
                    self.cookies.update(response.cookies)
                try:
                    return True, response.json() if response.content else {}
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                if response.content:
                    print(f"   Response: {response.text[:200]}")
                self.failed_tests.append(f"{name}: Expected {expected_status}, got {response.status_code}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.failed_tests.append(f"{name}: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test API health check"""
        print("\n=== HEALTH CHECK TESTS ===")
        self.run_test("Health Check", "GET", "api/health", 200)
        self.run_test("Root Endpoint", "GET", "api/", 200)

    def test_auth_flow(self):
        """Test authentication with test credentials"""
        print("\n=== AUTHENTICATION TESTS ===")
        
        # Test admin login first
        admin_data = {
            "email": "admin@superapp.com",
            "password": "SuperAdmin123!"
        }
        success, response = self.run_test("Admin Login", "POST", "api/auth/login", 200, data=admin_data)
        if success and 'access_token' in response:
            self.admin_token = response['access_token']
            print(f"   Admin token obtained")

        # Test user login with test2@example.com
        user_data = {
            "email": "test2@example.com",
            "password": "TestPass123!"
        }
        success, response = self.run_test("User Login", "POST", "api/auth/login", 200, data=user_data)
        if success and 'access_token' in response:
            self.token = response['access_token']
            print(f"   User token obtained")
        else:
            # Try to register the user first
            register_data = {
                "email": "test2@example.com",
                "password": "TestPass123!",
                "name": "Test User",
                "phone": "+1234567890",
                "role": "user"
            }
            reg_success, reg_response = self.run_test("User Registration", "POST", "api/auth/register", 200, data=register_data)
            if reg_success and 'access_token' in reg_response:
                self.token = reg_response['access_token']
                print(f"   User registered and token obtained")

        # Test get current user
        if self.token:
            self.run_test("Get Current User", "GET", "api/auth/me", 200)

    def test_merchant_endpoints(self):
        """Test merchant-related endpoints"""
        print("\n=== MERCHANT TESTS ===")
        
        # List merchants (for food page)
        success, response = self.run_test("List Merchants", "GET", "api/merchants?store_type=restaurant", 200)
        if success:
            print(f"   Found {len(response)} merchants")
        
        # Test merchant products (for restaurant detail page)
        self.run_test("Get Merchant Products", "GET", "api/merchants/merchant_demo123/products", 200)

    def test_order_flow(self):
        """Test complete order flow for food delivery"""
        print("\n=== ORDER FLOW TESTS ===")
        
        if self.token:
            # List user orders
            self.run_test("List User Orders", "GET", "api/orders", 200)
            
            # Test order creation (checkout functionality)
            order_data = {
                "merchant_id": "merchant_demo123",
                "items": [
                    {"product_id": "prod_demo1", "quantity": 2},
                    {"product_id": "prod_demo2", "quantity": 1}
                ],
                "delivery_address": "123 Test Street, NYC",
                "delivery_lat": 40.7128,
                "delivery_lng": -74.0060,
                "order_type": "food",
                "payment_method": "card",
                "special_instructions": "No onions please"
            }
            
            success, response = self.run_test("Create Food Order", "POST", "api/orders", 200, data=order_data)
            if success and 'id' in response:
                order_id = response['id']
                print(f"   Order created: {order_id}")
                
                # Test order tracking
                self.run_test("Get Order Details", "GET", f"api/orders/{order_id}", 200)

    def test_wallet_functionality(self):
        """Test wallet page functionality"""
        print("\n=== WALLET TESTS ===")
        
        if self.token:
            self.run_test("Get Wallet Balance", "GET", "api/wallet", 200)
            
            # Test wallet top-up
            topup_data = {
                "amount": 50.0
            }
            self.run_test("Wallet Top-up", "POST", "api/wallet/topup", 200, data=topup_data)

    def test_admin_dashboard(self):
        """Test admin dashboard functionality"""
        print("\n=== ADMIN DASHBOARD TESTS ===")
        
        if self.admin_token:
            success, response = self.run_test("Admin Dashboard Stats", "GET", "api/admin/dashboard", 200, use_admin=True)
            if success:
                print(f"   Dashboard data: {json.dumps(response, indent=2)}")
            
            self.run_test("Admin List Users", "GET", "api/admin/users", 200, use_admin=True)
            self.run_test("Admin List Drivers", "GET", "api/admin/drivers", 200, use_admin=True)
            self.run_test("Admin List Orders", "GET", "api/admin/orders", 200, use_admin=True)

    def test_dispatcher_panel(self):
        """Test dispatcher panel live map functionality"""
        print("\n=== DISPATCHER PANEL TESTS ===")
        
        if self.admin_token:
            success, response = self.run_test("Dispatcher Live Data", "GET", "api/dispatcher/live", 200, use_admin=True)
            if success:
                print(f"   Live data: drivers={len(response.get('drivers', []))}, rides={len(response.get('rides', []))}")

    def test_support_functionality(self):
        """Test support page functionality"""
        print("\n=== SUPPORT TESTS ===")
        
        if self.token:
            # Create support ticket
            ticket_data = {
                "subject": "Test Support Request",
                "message": "This is a test support ticket for API testing",
                "related_id": None,
                "related_type": None
            }
            
            success, response = self.run_test("Create Support Ticket", "POST", "api/support/tickets", 200, data=ticket_data)
            if success and 'id' in response:
                ticket_id = response['id']
                print(f"   Support ticket created: {ticket_id}")
            
            self.run_test("List Support Tickets", "GET", "api/support/tickets", 200)

    def test_ride_functionality(self):
        """Test ride booking functionality"""
        print("\n=== RIDE TESTS ===")
        
        # Test ride estimation
        ride_data = {
            "pickup_lat": 40.7128,
            "pickup_lng": -74.0060,
            "pickup_address": "New York, NY",
            "dropoff_lat": 40.7589,
            "dropoff_lng": -73.9851,
            "dropoff_address": "Times Square, NY",
            "vehicle_type": "car",
            "payment_method": "card"
        }
        
        success, response = self.run_test("Ride Estimation", "POST", "api/rides/estimate", 200, data=ride_data)
        if success:
            print(f"   Ride estimate: ${response.get('estimated_fare')}, {response.get('distance_km')}km")
        
        if self.token:
            self.run_test("List User Rides", "GET", "api/rides", 200)

def main():
    print("🚀 Starting SuperApp Comprehensive API Tests...")
    print("=" * 60)
    
    tester = SuperAppAPITester()
    
    # Run all test suites in order
    tester.test_health_check()
    tester.test_auth_flow()
    tester.test_merchant_endpoints()
    tester.test_order_flow()
    tester.test_wallet_functionality()
    tester.test_admin_dashboard()
    tester.test_dispatcher_panel()
    tester.test_support_functionality()
    tester.test_ride_functionality()
    
    # Print final results
    print("\n" + "=" * 60)
    print(f"📊 FINAL TEST RESULTS")
    print(f"Tests Run: {tester.tests_run}")
    print(f"Tests Passed: {tester.tests_passed}")
    print(f"Tests Failed: {tester.tests_run - tester.tests_passed}")
    print(f"Success Rate: {(tester.tests_passed / tester.tests_run * 100):.1f}%")
    
    if tester.failed_tests:
        print(f"\n❌ Failed Tests:")
        for failure in tester.failed_tests:
            print(f"   - {failure}")
    else:
        print(f"\n✅ All tests passed!")
    
    return 0 if len(tester.failed_tests) == 0 else 1

if __name__ == "__main__":
    sys.exit(main())