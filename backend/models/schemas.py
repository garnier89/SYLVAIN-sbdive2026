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
    vehicle_type: str
    vehicle_number: str
    vehicle_model: str
    license_number: str
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

# Ride Models
class RideRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    pickup_address: str
    dropoff_lat: float
    dropoff_lng: float
    dropoff_address: str
    vehicle_type: str
    payment_method: str

class RideResponse(BaseModel):
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
