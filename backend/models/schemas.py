from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime


# Auth Models
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    phone: Optional[str] = None
    role: str = "user"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    phone: Optional[str] = None
    role: str
    avatar_url: Optional[str] = None
    is_verified: bool = False
    panel_preference: Optional[str] = None
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# Address Models
class AddressCreate(BaseModel):
    label: str
    address_line: str
    city: str
    lat: float
    lng: float
    is_default: bool = False

class Address(AddressCreate):
    id: str

# Driver Models
class DriverCreate(BaseModel):
    vehicle_type: str
    vehicle_number: str
    vehicle_model: str
    license_number: str

class DriverProfile(BaseModel):
    id: str
    user_id: str
    vehicle_type: Optional[str] = None
    vehicle_number: Optional[str] = None
    vehicle_model: Optional[str] = None
    license_number: Optional[str] = None
    status: str
    is_online: bool = False
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None
    rating: float = 5.0
    total_trips: int = 0
    earnings: float = 0.0
    documents: List[Dict] = []

# Merchant Models
class MerchantCreate(BaseModel):
    store_name: str
    store_type: str
    address: str
    lat: float
    lng: float
    description: Optional[str] = None

class ProductCreate(BaseModel):
    name: str
    description: str
    price: float
    category: str
    image_url: Optional[str] = None
    is_available: bool = True

# Ride Models — enriched with V3Cube fare logic
class RideRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    pickup_address: str
    dropoff_lat: float
    dropoff_lng: float
    dropoff_address: str
    vehicle_type: str
    payment_method: str
    scheduled_at: Optional[str] = None
    coupon_code: Optional[str] = None
    book_for_name: Optional[str] = None
    book_for_phone: Optional[str] = None
    auto_assign: bool = True
    female_driver_request: bool = False
    handicap_accessibility: bool = False
    notes: Optional[str] = None
    proposed_fare: Optional[float] = None  # passenger's price offer for negotiation
    # Pack A — Taxi Avancé (V3Cube parity)
    ride_type: str = "instant"  # instant | scheduled | intercity | airport | rental | buddy_driver | corporate
    flight_number: Optional[str] = None  # for airport pickup
    rental_hours: Optional[int] = None  # for rental ride_type
    rental_package: Optional[str] = None  # "2h/20km", "4h/40km", "8h/80km"
    corporate_account_id: Optional[str] = None
    corporate_name: Optional[str] = None
    corporate_discount_pct: float = 0.0
    buddy_hours: Optional[int] = None  # for buddy_driver (chauffeur personnel)

class RideResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    driver_id: Optional[str] = None
    pickup_lat: float
    pickup_lng: float
    pickup_address: str
    dropoff_lat: float
    dropoff_lng: float
    dropoff_address: str
    vehicle_type: str
    status: str
    estimated_fare: float
    final_fare: Optional[float] = None
    distance_km: float
    duration_mins: int
    payment_method: str
    payment_status: str
    created_at: datetime
    otp: Optional[str] = None
    fare_type: str = "Regular"
    base_fare: float = 0.0
    price_per_km: float = 0.0
    commission_percent: float = 0.0
    currency: str = "EUR"
    scheduled_at: Optional[str] = None
    coupon_code: Optional[str] = None
    discount: float = 0.0
    booking_no: Optional[str] = None
    auto_assign: bool = True
    female_driver_request: bool = False
    handicap_accessibility: bool = False
    notes: Optional[str] = None
    proposed_fare: Optional[float] = None
    counter_offers: Optional[List[dict]] = None
    book_for_name: Optional[str] = None
    book_for_phone: Optional[str] = None
    stopovers: Optional[List[dict]] = None
    # Pack A
    ride_type: str = "instant"
    flight_number: Optional[str] = None
    rental_hours: Optional[int] = None
    rental_package: Optional[str] = None
    corporate_account_id: Optional[str] = None
    buddy_hours: Optional[int] = None
    start_otp: Optional[str] = None

# Order Models
class OrderItemCreate(BaseModel):
    product_id: str
    quantity: int

class OrderCreate(BaseModel):
    merchant_id: str
    items: List[OrderItemCreate]
    delivery_address: str
    delivery_lat: float
    delivery_lng: float
    order_type: str
    payment_method: str
    special_instructions: Optional[str] = None

class OrderResponse(BaseModel):
    id: str
    user_id: str
    merchant_id: str
    driver_id: Optional[str] = None
    items: List[Dict]
    subtotal: float
    delivery_fee: float
    total: float
    status: str
    delivery_address: str
    payment_method: str
    payment_status: str
    created_at: datetime
    estimated_delivery: Optional[datetime] = None

# Wallet Models
class WalletTopUp(BaseModel):
    amount: float

class WalletResponse(BaseModel):
    balance: float
    transactions: List[Dict]

# Rating Model
class RatingCreate(BaseModel):
    rating: int
    comment: Optional[str] = None

# Support Ticket Model
class TicketCreate(BaseModel):
    subject: str
    message: str
    related_id: Optional[str] = None
    related_type: Optional[str] = None

# V3Cube-derived models

class VehicleTypeResponse(BaseModel):
    id: str
    slug: str
    name_fr: str
    name_en: str
    category_slug: str
    fare_type: str
    base_fare: float
    price_per_km: float
    price_per_min: float
    min_fare: float
    commission_percent: float
    pickup_price: float
    person_capacity: int
    icon_type: str
    cancellation_fare: float
    waiting_fees: float
    status: str

class VehicleCategoryResponse(BaseModel):
    id: str
    slug: str
    name_fr: str
    name_en: str
    type: str
    icon: str
    description_fr: str
    display_order: int
    status: str

class ConfigurationResponse(BaseModel):
    key: str
    value: str
    category: str
