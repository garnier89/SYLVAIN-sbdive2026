import requests
import sys
import json
from datetime import datetime

class SuperAppAPITester:
    def __init__(self, base_url="https://gojek-mvp-1.preview.emergentagent.com"):
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
        return self.run_test("Health Check", "GET", "api/", 200)

    def test_admin_login(self):
        """Test admin login"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "api/auth/login",
            200,
            data={"email": "admin@superapp.com", "password": "SuperAdmin123!"}
        )
        if success and 'access_token' in response:
            self.token = response['access_token']
            print(f"   Admin user role: {response.get('user', {}).get('role', 'unknown')}")
            return True
        return False

    def test_user_registration(self):
        """Test user registration"""
        test_email = f"test_user_{datetime.now().strftime('%H%M%S')}@test.com"
        success, response = self.run_test(
            "User Registration",
            "POST",
            "api/auth/register",
            200,
            data={
                "email": test_email,
                "password": "TestPass123!",
                "name": "Test User",
                "phone": "+1234567890",
                "role": "user"
            }
        )
        return success

    def test_admin_dashboard(self):
        """Test admin dashboard"""
        if not self.token:
            print("❌ No admin token available for dashboard test")
            return False
        
        success, response = self.run_test(
            "Admin Dashboard",
            "GET",
            "api/admin/dashboard",
            200
        )
        if success:
            print(f"   Dashboard stats: users={response.get('total_users', 0)}, drivers={response.get('total_drivers', 0)}, revenue=${response.get('today_revenue', 0)}")
        return success

    def test_ride_estimate(self):
        """Test ride estimate API"""
        success, response = self.run_test(
            "Ride Estimate",
            "POST",
            "api/rides/estimate",
            200,
            data={
                "pickup_lat": 37.7749,
                "pickup_lng": -122.4194,
                "pickup_address": "San Francisco, CA",
                "dropoff_lat": 37.7849,
                "dropoff_lng": -122.4094,
                "dropoff_address": "San Francisco, CA",
                "vehicle_type": "car",
                "payment_method": "card"
            }
        )
        if success:
            print(f"   Estimate: ${response.get('estimated_fare', 0)}, {response.get('distance_km', 0)}km, {response.get('duration_mins', 0)}min")
        return success

def main():
    print("🚀 Starting SuperApp API Tests...")
    tester = SuperAppAPITester()

    # Test sequence
    tests = [
        ("Health Check", tester.test_health_check),
        ("Admin Login", tester.test_admin_login),
        ("Admin Dashboard", tester.test_admin_dashboard),
        ("User Registration", tester.test_user_registration),
        ("Ride Estimate", tester.test_ride_estimate),
    ]

    for test_name, test_func in tests:
        try:
            test_func()
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {e}")
            tester.tests_run += 1

    # Print results
    print(f"\n📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    success_rate = (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0
    print(f"   Success Rate: {success_rate:.1f}%")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())