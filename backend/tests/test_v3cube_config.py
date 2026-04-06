"""
V3Cube Configuration Endpoints Tests - Iteration 12
Tests for new config endpoints with V3Cube seed data
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestVehicleCategories:
    """Tests for GET /api/config/vehicle-categories"""
    
    def test_vehicle_categories_returns_9_active(self):
        """Should return 9 active vehicle categories"""
        response = requests.get(f"{BASE_URL}/api/config/vehicle-categories")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 9, f"Expected 9 categories, got {len(data)}"
        
    def test_vehicle_categories_slugs(self):
        """Should contain all expected category slugs"""
        response = requests.get(f"{BASE_URL}/api/config/vehicle-categories")
        data = response.json()
        expected_slugs = ['vtc-taxi', 'moto', 'rental', 'pool', 'schedule', 
                         'corporate', 'book-for-other', 'bid-taxi', 'intercity']
        actual_slugs = [cat['slug'] for cat in data]
        for slug in expected_slugs:
            assert slug in actual_slugs, f"Missing category slug: {slug}"
            
    def test_vehicle_categories_structure(self):
        """Should have correct structure with French translations"""
        response = requests.get(f"{BASE_URL}/api/config/vehicle-categories")
        data = response.json()
        first_cat = data[0]
        assert 'id' in first_cat
        assert 'slug' in first_cat
        assert 'name_fr' in first_cat
        assert 'name_en' in first_cat
        assert 'type' in first_cat
        assert 'icon' in first_cat
        assert 'status' in first_cat
        assert first_cat['status'] == 'active'


class TestVehicleTypes:
    """Tests for GET /api/config/vehicle-types"""
    
    def test_vehicle_types_returns_5(self):
        """Should return 5 vehicle types"""
        response = requests.get(f"{BASE_URL}/api/config/vehicle-types")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 5, f"Expected 5 vehicle types, got {len(data)}"
        
    def test_vehicle_types_slugs(self):
        """Should contain sb, confort, luxe, moto, pool"""
        response = requests.get(f"{BASE_URL}/api/config/vehicle-types")
        data = response.json()
        expected_slugs = ['sb', 'confort', 'luxe', 'moto', 'pool']
        actual_slugs = [vt['slug'] for vt in data]
        for slug in expected_slugs:
            assert slug in actual_slugs, f"Missing vehicle type: {slug}"
            
    def test_vehicle_types_v3cube_pricing(self):
        """Should have V3Cube pricing fields"""
        response = requests.get(f"{BASE_URL}/api/config/vehicle-types")
        data = response.json()
        for vt in data:
            assert 'base_fare' in vt, f"Missing base_fare in {vt['slug']}"
            assert 'price_per_km' in vt, f"Missing price_per_km in {vt['slug']}"
            assert 'min_fare' in vt, f"Missing min_fare in {vt['slug']}"
            assert 'fare_type' in vt, f"Missing fare_type in {vt['slug']}"
            assert 'commission_percent' in vt, f"Missing commission_percent in {vt['slug']}"
            
    def test_sb_vehicle_type_pricing(self):
        """SB type should have base_fare=1.0, price_per_km=1.0"""
        response = requests.get(f"{BASE_URL}/api/config/vehicle-types")
        data = response.json()
        sb = next((vt for vt in data if vt['slug'] == 'sb'), None)
        assert sb is not None, "SB vehicle type not found"
        assert sb['base_fare'] == 1.0, f"SB base_fare should be 1.0, got {sb['base_fare']}"
        assert sb['price_per_km'] == 1.0, f"SB price_per_km should be 1.0, got {sb['price_per_km']}"
        assert sb['min_fare'] == 10.0, f"SB min_fare should be 10.0, got {sb['min_fare']}"


class TestAppConfig:
    """Tests for GET /api/config/app"""
    
    def test_app_config_returns_dict(self):
        """Should return configuration as key-value dict"""
        response = requests.get(f"{BASE_URL}/api/config/app")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        
    def test_app_config_company_name(self):
        """Should have COMPANY_NAME = SB Drive VTC"""
        response = requests.get(f"{BASE_URL}/api/config/app")
        data = response.json()
        assert 'COMPANY_NAME' in data
        assert data['COMPANY_NAME'] == 'SB Drive VTC'
        
    def test_app_config_currency(self):
        """Should have DEFAULT_CURRENCY_CODE = EUR"""
        response = requests.get(f"{BASE_URL}/api/config/app")
        data = response.json()
        assert 'DEFAULT_CURRENCY_CODE' in data
        assert data['DEFAULT_CURRENCY_CODE'] == 'EUR'
        
    def test_app_config_wallet_enabled(self):
        """Should have WALLET_ENABLE = Yes"""
        response = requests.get(f"{BASE_URL}/api/config/app")
        data = response.json()
        assert 'WALLET_ENABLE' in data
        assert data['WALLET_ENABLE'] == 'Yes'


class TestNearbyCategories:
    """Tests for GET /api/config/nearby-categories"""
    
    def test_nearby_categories_returns_21(self):
        """Should return 21 nearby business categories"""
        response = requests.get(f"{BASE_URL}/api/config/nearby-categories")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 21, f"Expected 21 categories, got {len(data)}"
        
    def test_nearby_categories_structure(self):
        """Should have French and English names"""
        response = requests.get(f"{BASE_URL}/api/config/nearby-categories")
        data = response.json()
        first = data[0]
        assert 'name_fr' in first
        assert 'name_en' in first
        assert 'slug' in first


class TestParcelTypes:
    """Tests for GET /api/config/parcel-types"""
    
    def test_parcel_types_returns_5(self):
        """Should return 5 parcel delivery types"""
        response = requests.get(f"{BASE_URL}/api/config/parcel-types")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 5, f"Expected 5 parcel types, got {len(data)}"
        
    def test_parcel_types_slugs(self):
        """Should contain expected parcel type slugs"""
        response = requests.get(f"{BASE_URL}/api/config/parcel-types")
        data = response.json()
        expected_slugs = ['home-food', 'care-packages', 'documents', 'clothes', 'repair-items']
        actual_slugs = [pt['slug'] for pt in data]
        for slug in expected_slugs:
            assert slug in actual_slugs, f"Missing parcel type: {slug}"


class TestCancelReasons:
    """Tests for GET /api/config/cancel-reasons"""
    
    def test_cancel_reasons_returns_8(self):
        """Should return 8 cancel reasons"""
        response = requests.get(f"{BASE_URL}/api/config/cancel-reasons")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 8, f"Expected 8 cancel reasons, got {len(data)}"
        
    def test_cancel_reasons_user_filter(self):
        """Filter by user_type=User should return User and Both reasons"""
        response = requests.get(f"{BASE_URL}/api/config/cancel-reasons?user_type=User")
        assert response.status_code == 200
        data = response.json()
        # Should return 5 User reasons + 1 Both reason = 6
        assert len(data) == 6, f"Expected 6 reasons for User, got {len(data)}"
        for reason in data:
            assert reason['for'] in ['User', 'Both'], f"Unexpected for value: {reason['for']}"
            
    def test_cancel_reasons_driver_filter(self):
        """Filter by user_type=Driver should return Driver and Both reasons"""
        response = requests.get(f"{BASE_URL}/api/config/cancel-reasons?user_type=Driver")
        assert response.status_code == 200
        data = response.json()
        # Should return 2 Driver reasons + 1 Both reason = 3
        assert len(data) == 3, f"Expected 3 reasons for Driver, got {len(data)}"
        for reason in data:
            assert reason['for'] in ['Driver', 'Both'], f"Unexpected for value: {reason['for']}"


class TestMasterCategories:
    """Tests for GET /api/config/master-categories"""
    
    def test_master_categories_returns_6(self):
        """Should return 6 master service categories"""
        response = requests.get(f"{BASE_URL}/api/config/master-categories")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 6, f"Expected 6 master categories, got {len(data)}"
        
    def test_master_categories_slugs(self):
        """Should contain taxi, delivery, services, video-consult, bidding, medical"""
        response = requests.get(f"{BASE_URL}/api/config/master-categories")
        data = response.json()
        expected_slugs = ['taxi', 'delivery', 'services', 'video-consult', 'bidding', 'medical']
        actual_slugs = [mc['slug'] for mc in data]
        for slug in expected_slugs:
            assert slug in actual_slugs, f"Missing master category: {slug}"


class TestTrackCategories:
    """Tests for GET /api/config/track-categories"""
    
    def test_track_categories_returns_2(self):
        """Should return 2 track categories (family, employees)"""
        response = requests.get(f"{BASE_URL}/api/config/track-categories")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2, f"Expected 2 track categories, got {len(data)}"
        
    def test_track_categories_slugs(self):
        """Should contain family and employees"""
        response = requests.get(f"{BASE_URL}/api/config/track-categories")
        data = response.json()
        slugs = [tc['slug'] for tc in data]
        assert 'family' in slugs
        assert 'employees' in slugs


class TestRideEstimate:
    """Tests for POST /api/rides/estimate with V3Cube pricing"""
    
    def test_estimate_confort_enriched_response(self):
        """Confort estimate should return enriched V3Cube pricing fields"""
        response = requests.post(f"{BASE_URL}/api/rides/estimate", json={
            "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Paris",
            "dropoff_lat": 48.8800, "dropoff_lng": 2.3600, "dropoff_address": "Gare du Nord",
            "vehicle_type": "confort", "payment_method": "card"
        })
        assert response.status_code == 200
        data = response.json()
        # Check enriched fields
        assert 'fare_type' in data, "Missing fare_type"
        assert 'base_fare' in data, "Missing base_fare"
        assert 'price_per_km' in data, "Missing price_per_km"
        assert 'commission_percent' in data, "Missing commission_percent"
        assert 'cancellation_fare' in data, "Missing cancellation_fare"
        # Verify confort pricing
        assert data['fare_type'] == 'Regular'
        assert data['base_fare'] == 2.0
        assert data['price_per_km'] == 1.5
        assert data['commission_percent'] == 10.0
        
    def test_estimate_sb_pricing(self):
        """SB estimate should use V3Cube seed data pricing"""
        response = requests.post(f"{BASE_URL}/api/rides/estimate", json={
            "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Paris",
            "dropoff_lat": 48.8800, "dropoff_lng": 2.3600, "dropoff_address": "Gare du Nord",
            "vehicle_type": "sb", "payment_method": "card"
        })
        assert response.status_code == 200
        data = response.json()
        assert data['base_fare'] == 1.0, f"SB base_fare should be 1.0, got {data['base_fare']}"
        assert data['price_per_km'] == 1.0, f"SB price_per_km should be 1.0, got {data['price_per_km']}"
        
    def test_estimate_returns_currency(self):
        """Estimate should return EUR currency"""
        response = requests.post(f"{BASE_URL}/api/rides/estimate", json={
            "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Paris",
            "dropoff_lat": 48.8800, "dropoff_lng": 2.3600, "dropoff_address": "Gare du Nord",
            "vehicle_type": "sb", "payment_method": "card"
        })
        data = response.json()
        assert data['currency'] == 'EUR'


class TestServiceCategories:
    """Tests for GET /api/services/categories"""
    
    def test_service_categories_enriched(self):
        """Should return enriched V3Cube service categories"""
        response = requests.get(f"{BASE_URL}/api/services/categories")
        assert response.status_code == 200
        data = response.json()
        # Should have 6 categories
        assert len(data) == 6, f"Expected 6 categories, got {len(data)}"
        
    def test_service_categories_french_names(self):
        """Categories should have name_fr, name_en, icon fields"""
        response = requests.get(f"{BASE_URL}/api/services/categories")
        data = response.json()
        for key, cat in data.items():
            assert 'name_fr' in cat, f"Missing name_fr in {key}"
            assert 'name_en' in cat, f"Missing name_en in {key}"
            assert 'icon' in cat, f"Missing icon in {key}"
            assert 'services' in cat, f"Missing services in {key}"


class TestAuthLogin:
    """Tests for POST /api/auth/login"""
    
    def test_admin_login(self):
        """Admin login should work with correct credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@superapp.com",
            "password": "SuperAdmin123!"
        })
        assert response.status_code == 200
        data = response.json()
        assert 'access_token' in data
        assert 'user' in data
        assert data['user']['role'] == 'admin'
        
    def test_test_user_login(self):
        """Test user login should work"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test2@example.com",
            "password": "TestPass123!"
        })
        assert response.status_code == 200
        data = response.json()
        assert 'access_token' in data
        assert data['user']['role'] == 'user'


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
