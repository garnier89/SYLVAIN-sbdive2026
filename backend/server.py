from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, File, UploadFile, Depends, WebSocket, WebSocketDisconnect, Query, Header
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import bcrypt
import jwt
import uuid
import json
import secrets
import requests
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from contextlib import asynccontextmanager

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# MongoDB connection
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# JWT Configuration
JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_hex(32))
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Storage Configuration
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "superapp"
storage_key = None

# Stripe Configuration
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "sk_test_emergent")

# ===================
# PYDANTIC MODELS
# ===================

# Auth Models
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    phone: Optional[str] = None
    role: str = "user"  # user, driver, merchant, admin, dispatcher

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
    label: str  # home, work, other
    address_line: str
    city: str
    lat: float
    lng: float
    is_default: bool = False

class Address(AddressCreate):
    id: str

# Driver Models
class DriverCreate(BaseModel):
    vehicle_type: str  # car, motorcycle, bicycle
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
    status: str  # pending, approved, rejected
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
    store_type: str  # restaurant, grocery, pharmacy
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
    vehicle_type: str  # car, motorcycle
    payment_method: str  # cash, card, wallet

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
    status: str  # pending, accepted, arriving, in_progress, completed, cancelled
    estimated_fare: float
    final_fare: Optional[float] = None
    distance_km: float
    duration_mins: int
    payment_method: str
    payment_status: str
    created_at: datetime
    otp: Optional[str] = None

# Order Models (Food/Parcel Delivery)
class OrderItemCreate(BaseModel):
    product_id: str
    quantity: int

class OrderCreate(BaseModel):
    merchant_id: str
    items: List[OrderItemCreate]
    delivery_address: str
    delivery_lat: float
    delivery_lng: float
    order_type: str  # food, grocery, parcel
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
    status: str  # pending, accepted, preparing, ready, picked_up, delivered, cancelled
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
    rating: int  # 1-5
    comment: Optional[str] = None

# Support Ticket Model
class TicketCreate(BaseModel):
    subject: str
    message: str
    related_id: Optional[str] = None  # ride_id or order_id
    related_type: Optional[str] = None  # ride or order

# ===================
# HELPER FUNCTIONS
# ===================

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "type": "access"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        "type": "refresh"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def require_role(request: Request, roles: List[str]) -> dict:
    user = await get_current_user(request)
    if user["role"] not in roles:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return user

def calculate_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance in km using Haversine formula"""
    from math import radians, sin, cos, sqrt, atan2
    R = 6371  # Earth's radius in km
    lat1, lng1, lat2, lng2 = map(radians, [lat1, lng1, lat2, lng2])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlng/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    return R * c

def calculate_fare(distance_km: float, vehicle_type: str) -> float:
    """Calculate fare based on distance and vehicle type"""
    base_fares = {"car": 3.0, "motorcycle": 2.0, "bicycle": 1.5}
    per_km_rates = {"car": 1.5, "motorcycle": 1.0, "bicycle": 0.8}
    base = base_fares.get(vehicle_type, 3.0)
    rate = per_km_rates.get(vehicle_type, 1.5)
    return round(base + (distance_km * rate), 2)

# Storage functions
def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    if not EMERGENT_LLM_KEY:
        logger.warning("EMERGENT_LLM_KEY not set, storage disabled")
        return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        return storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage not available")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120
    )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str) -> tuple:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage not available")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# ===================
# WEBSOCKET MANAGER
# ===================

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.driver_locations: Dict[str, Dict] = {}
    
    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info(f"Client {client_id} connected")
    
    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
        logger.info(f"Client {client_id} disconnected")
    
    async def send_personal_message(self, message: dict, client_id: str):
        if client_id in self.active_connections:
            await self.active_connections[client_id].send_json(message)
    
    async def broadcast(self, message: dict):
        for connection in self.active_connections.values():
            await connection.send_json(message)
    
    def update_driver_location(self, driver_id: str, lat: float, lng: float):
        self.driver_locations[driver_id] = {"lat": lat, "lng": lng, "updated_at": datetime.now(timezone.utc).isoformat()}

manager = ConnectionManager()

# ===================
# APP INITIALIZATION
# ===================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.drivers.create_index("user_id", unique=True)
    await db.merchants.create_index("user_id", unique=True)
    await db.rides.create_index([("status", 1), ("created_at", -1)])
    await db.orders.create_index([("status", 1), ("created_at", -1)])
    await db.login_attempts.create_index("identifier")
    
    # Seed admin user
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@superapp.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing_admin = await db.users.find_one({"email": admin_email})
    if not existing_admin:
        admin_user = {
            "id": f"user_{uuid.uuid4().hex[:12]}",
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Super Admin",
            "role": "admin",
            "is_verified": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(admin_user)
        logger.info(f"Admin user created: {admin_email}")
    elif not verify_password(admin_password, existing_admin["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}}
        )
    
    # Write test credentials
    os.makedirs("/app/memory", exist_ok=True)
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write(f"""# Test Credentials

## Admin Account
- Email: {admin_email}
- Password: {admin_password}
- Role: admin

## Auth Endpoints
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
- POST /api/auth/refresh
""")
    
    # Seed demo merchants and products
    demo_merchants = [
        {
            "id": "merchant_burger_palace",
            "user_id": "system_burger",
            "store_name": "Burger Palace",
            "store_type": "restaurant",
            "address": "123 Main Street, Paris",
            "lat": 48.8566,
            "lng": 2.3522,
            "description": "Premium gourmet burgers and sides",
            "rating": 4.8,
            "total_orders": 1250,
            "is_active": True,
            "opening_hours": "09:00-22:00",
            "image_url": "https://images.unsplash.com/photo-1632898657999-ae6920976661?w=400",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "merchant_pizza_heaven",
            "user_id": "system_pizza",
            "store_name": "Pizza Heaven",
            "store_type": "restaurant",
            "address": "456 Oak Avenue, Paris",
            "lat": 48.8606,
            "lng": 2.3376,
            "description": "Authentic Italian pizza baked in wood-fired oven",
            "rating": 4.5,
            "total_orders": 890,
            "is_active": True,
            "opening_hours": "10:00-23:00",
            "image_url": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "merchant_sushi_master",
            "user_id": "system_sushi",
            "store_name": "Sushi Master",
            "store_type": "restaurant",
            "address": "789 Elm Road, Paris",
            "lat": 48.8530,
            "lng": 2.3499,
            "description": "Fresh Japanese sushi and sashimi",
            "rating": 4.9,
            "total_orders": 2100,
            "is_active": True,
            "opening_hours": "11:00-22:00",
            "image_url": "https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
    ]

    demo_products = [
        # Burger Palace
        {"id": "prod_bp_classic", "merchant_id": "merchant_burger_palace", "name": "Classic Burger", "description": "Juicy beef patty with fresh lettuce, tomato, and special sauce", "price": 12.99, "category": "Burgers", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_bp_cheese", "merchant_id": "merchant_burger_palace", "name": "Cheese Burger", "description": "Classic burger topped with melted cheddar cheese", "price": 14.99, "category": "Burgers", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_bp_bacon", "merchant_id": "merchant_burger_palace", "name": "Bacon Burger", "description": "Loaded with crispy bacon strips and BBQ sauce", "price": 16.99, "category": "Burgers", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_bp_veggie", "merchant_id": "merchant_burger_palace", "name": "Veggie Burger", "description": "Plant-based patty with avocado and sprouts", "price": 13.99, "category": "Burgers", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_bp_fries", "merchant_id": "merchant_burger_palace", "name": "French Fries", "description": "Crispy golden fries with sea salt", "price": 4.99, "category": "Sides", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_bp_rings", "merchant_id": "merchant_burger_palace", "name": "Onion Rings", "description": "Beer-battered onion rings", "price": 5.99, "category": "Sides", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_bp_cola", "merchant_id": "merchant_burger_palace", "name": "Coca Cola", "description": "Ice cold refreshment", "price": 2.99, "category": "Drinks", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_bp_shake", "merchant_id": "merchant_burger_palace", "name": "Milkshake", "description": "Creamy vanilla milkshake", "price": 5.99, "category": "Drinks", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        # Pizza Heaven
        {"id": "prod_ph_margherita", "merchant_id": "merchant_pizza_heaven", "name": "Margherita Pizza", "description": "Classic tomato sauce with mozzarella and fresh basil", "price": 14.99, "category": "Pizzas", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_ph_pepperoni", "merchant_id": "merchant_pizza_heaven", "name": "Pepperoni Pizza", "description": "Loaded with pepperoni slices and melted cheese", "price": 16.99, "category": "Pizzas", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_ph_four_cheese", "merchant_id": "merchant_pizza_heaven", "name": "Four Cheese Pizza", "description": "Mozzarella, gorgonzola, parmesan, and fontina", "price": 18.99, "category": "Pizzas", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_ph_garlic_bread", "merchant_id": "merchant_pizza_heaven", "name": "Garlic Bread", "description": "Crispy bread with garlic butter and herbs", "price": 5.99, "category": "Sides", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_ph_tiramisu", "merchant_id": "merchant_pizza_heaven", "name": "Tiramisu", "description": "Classic Italian coffee-flavored dessert", "price": 7.99, "category": "Desserts", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        # Sushi Master
        {"id": "prod_sm_salmon", "merchant_id": "merchant_sushi_master", "name": "Salmon Nigiri (6pc)", "description": "Fresh salmon on seasoned rice", "price": 12.99, "category": "Nigiri", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_sm_tuna", "merchant_id": "merchant_sushi_master", "name": "Tuna Sashimi (8pc)", "description": "Premium bluefin tuna slices", "price": 16.99, "category": "Sashimi", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_sm_california", "merchant_id": "merchant_sushi_master", "name": "California Roll (8pc)", "description": "Crab, avocado, and cucumber roll", "price": 10.99, "category": "Rolls", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_sm_dragon", "merchant_id": "merchant_sushi_master", "name": "Dragon Roll (8pc)", "description": "Shrimp tempura, avocado, eel sauce", "price": 14.99, "category": "Rolls", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_sm_miso", "merchant_id": "merchant_sushi_master", "name": "Miso Soup", "description": "Traditional Japanese miso with tofu and seaweed", "price": 3.99, "category": "Sides", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_sm_edamame", "merchant_id": "merchant_sushi_master", "name": "Edamame", "description": "Steamed soybeans with sea salt", "price": 4.99, "category": "Sides", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
    ]

    for merchant in demo_merchants:
        existing = await db.merchants.find_one({"id": merchant["id"]})
        if not existing:
            await db.merchants.insert_one(merchant)
            logger.info(f"Seeded merchant: {merchant['store_name']}")

    for product in demo_products:
        existing = await db.products.find_one({"id": product["id"]})
        if not existing:
            await db.products.insert_one(product)

    # Seed test user if not exists
    test_email = "test2@example.com"
    test_password = "TestPass123!"
    existing_test = await db.users.find_one({"email": test_email})
    if not existing_test:
        test_user_id = f"user_{uuid.uuid4().hex[:12]}"
        test_user = {
            "id": test_user_id,
            "email": test_email,
            "password_hash": hash_password(test_password),
            "name": "Test User",
            "phone": "+33123456789",
            "role": "user",
            "is_verified": True,
            "avatar_url": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(test_user)
        await db.wallets.insert_one({"user_id": test_user_id, "balance": 50.0, "created_at": datetime.now(timezone.utc).isoformat()})
        logger.info(f"Test user created: {test_email}")

    # Seed merchant user if not exists
    merchant_email = "merchant@example.com"
    merchant_password = "Merchant123!"
    existing_merchant_user = await db.users.find_one({"email": merchant_email})
    if not existing_merchant_user:
        merchant_user_id = f"user_{uuid.uuid4().hex[:12]}"
        merchant_user = {
            "id": merchant_user_id,
            "email": merchant_email,
            "password_hash": hash_password(merchant_password),
            "name": "Demo Merchant",
            "phone": "+33987654321",
            "role": "merchant",
            "is_verified": True,
            "avatar_url": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(merchant_user)
        await db.wallets.insert_one({"user_id": merchant_user_id, "balance": 0.0, "created_at": datetime.now(timezone.utc).isoformat()})
        logger.info(f"Merchant user created: {merchant_email}")

    init_storage()
    logger.info("SuperApp Backend Started")
    yield
    # Shutdown
    client.close()

app = FastAPI(title="SuperApp API", lifespan=lifespan)
api_router = APIRouter(prefix="/api")

# ===================
# AUTH ENDPOINTS
# ===================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(data: UserRegister, response: Response):
    email = data.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "id": user_id,
        "email": email,
        "password_hash": hash_password(data.password),
        "name": data.name,
        "phone": data.phone,
        "role": data.role if data.role in ["user", "driver", "merchant"] else "user",
        "is_verified": False,
        "avatar_url": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    
    # Create wallet
    await db.wallets.insert_one({
        "user_id": user_id,
        "balance": 0.0,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    access_token = create_access_token(user_id, email, user_doc["role"])
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=900, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    
    user_doc.pop("password_hash", None)
    user_doc.pop("_id", None)
    user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse(**user_doc)
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(data: UserLogin, request: Request, response: Response):
    email = data.email.lower()
    identifier = f"{request.client.host}:{email}"
    
    # Check brute force
    attempts = await db.login_attempts.find_one({"identifier": identifier})
    if attempts and attempts.get("count", 0) >= 5:
        lockout_until = datetime.fromisoformat(attempts["lockout_until"]) if attempts.get("lockout_until") else None
        if lockout_until and datetime.now(timezone.utc) < lockout_until:
            raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.")
        else:
            await db.login_attempts.delete_one({"identifier": identifier})
    
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password_hash"]):
        # Increment failed attempts
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {
                "$inc": {"count": 1},
                "$set": {"lockout_until": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()}
            },
            upsert=True
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Clear failed attempts
    await db.login_attempts.delete_one({"identifier": identifier})
    
    access_token = create_access_token(user["id"], email, user["role"])
    refresh_token = create_refresh_token(user["id"])
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=900, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    
    user.pop("password_hash", None)
    if isinstance(user.get("created_at"), str):
        user["created_at"] = datetime.fromisoformat(user["created_at"])
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse(**user)
    )

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out successfully"}

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(request: Request):
    user = await get_current_user(request)
    if isinstance(user.get("created_at"), str):
        user["created_at"] = datetime.fromisoformat(user["created_at"])
    return UserResponse(**user)

@api_router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        access_token = create_access_token(user["id"], user["email"], user["role"])
        response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=900, path="/")
        return {"access_token": access_token}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

# Google OAuth Session Handling
@api_router.post("/auth/google/session")
async def google_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="Session ID required")
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid session")
            google_data = resp.json()
    except Exception as e:
        logger.error(f"Google auth error: {e}")
        raise HTTPException(status_code=500, detail="Authentication failed")
    
    email = google_data["email"].lower()
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if existing_user:
        user = existing_user
        await db.users.update_one(
            {"email": email},
            {"$set": {"avatar_url": google_data.get("picture"), "name": google_data.get("name", existing_user["name"])}}
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "id": user_id,
            "email": email,
            "password_hash": "",
            "name": google_data.get("name", "User"),
            "phone": None,
            "role": "user",
            "is_verified": True,
            "avatar_url": google_data.get("picture"),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user)
        await db.wallets.insert_one({
            "user_id": user_id,
            "balance": 0.0,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    access_token = create_access_token(user["id"], email, user["role"])
    refresh_token = create_refresh_token(user["id"])
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=900, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    
    user.pop("password_hash", None)
    if isinstance(user.get("created_at"), str):
        user["created_at"] = datetime.fromisoformat(user["created_at"])
    
    return TokenResponse(access_token=access_token, user=UserResponse(**user))

# ===================
# USER ENDPOINTS
# ===================

@api_router.get("/users/addresses", response_model=List[Address])
async def get_addresses(request: Request):
    user = await get_current_user(request)
    addresses = await db.addresses.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    return addresses

@api_router.post("/users/addresses", response_model=Address)
async def add_address(data: AddressCreate, request: Request):
    user = await get_current_user(request)
    if data.is_default:
        await db.addresses.update_many({"user_id": user["id"]}, {"$set": {"is_default": False}})
    
    address = {
        "id": f"addr_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        **data.model_dump()
    }
    await db.addresses.insert_one(address)
    address.pop("user_id", None)
    return Address(**address)

@api_router.delete("/users/addresses/{address_id}")
async def delete_address(address_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.addresses.delete_one({"id": address_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Address not found")
    return {"message": "Address deleted"}

# ===================
# DRIVER ENDPOINTS
# ===================

@api_router.post("/drivers/register", response_model=DriverProfile)
async def register_driver(data: DriverCreate, request: Request):
    user = await get_current_user(request)
    
    existing = await db.drivers.find_one({"user_id": user["id"]})
    if existing:
        raise HTTPException(status_code=400, detail="Already registered as driver")
    
    driver = {
        "id": f"driver_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "vehicle_type": data.vehicle_type,
        "vehicle_number": data.vehicle_number,
        "vehicle_model": data.vehicle_model,
        "license_number": data.license_number,
        "status": "pending",
        "is_online": False,
        "current_lat": None,
        "current_lng": None,
        "rating": 5.0,
        "total_trips": 0,
        "earnings": 0.0,
        "documents": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.drivers.insert_one(driver)
    await db.users.update_one({"id": user["id"]}, {"$set": {"role": "driver"}})
    
    driver.pop("_id", None)
    return DriverProfile(**driver)

@api_router.get("/drivers/profile", response_model=DriverProfile)
async def get_driver_profile(request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    return DriverProfile(**driver)

@api_router.post("/drivers/toggle-online")
async def toggle_driver_online(request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    if driver["status"] != "approved":
        raise HTTPException(status_code=400, detail="Driver not approved")
    
    new_status = not driver["is_online"]
    await db.drivers.update_one({"user_id": user["id"]}, {"$set": {"is_online": new_status}})
    return {"is_online": new_status}

@api_router.post("/drivers/location")
async def update_driver_location(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    lat = body.get("lat")
    lng = body.get("lng")
    
    await db.drivers.update_one(
        {"user_id": user["id"]},
        {"$set": {"current_lat": lat, "current_lng": lng}}
    )
    manager.update_driver_location(user["id"], lat, lng)
    return {"message": "Location updated"}

@api_router.post("/drivers/documents")
async def upload_driver_document(
    request: Request,
    file: UploadFile = File(...),
    doc_type: str = Query(...)
):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    
    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    path = f"{APP_NAME}/drivers/{user['id']}/{doc_type}_{uuid.uuid4().hex[:8]}.{ext}"
    data = await file.read()
    result = put_object(path, data, file.content_type or "application/octet-stream")
    
    doc_record = {
        "type": doc_type,
        "path": result["path"],
        "filename": file.filename,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "status": "pending"
    }
    
    await db.drivers.update_one(
        {"user_id": user["id"]},
        {"$push": {"documents": doc_record}}
    )
    
    return {"message": "Document uploaded", "path": result["path"]}

# ===================
# MERCHANT ENDPOINTS
# ===================

@api_router.post("/merchants/register")
async def register_merchant(data: MerchantCreate, request: Request):
    user = await get_current_user(request)
    
    existing = await db.merchants.find_one({"user_id": user["id"]})
    if existing:
        raise HTTPException(status_code=400, detail="Already registered as merchant")
    
    merchant = {
        "id": f"merchant_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "store_name": data.store_name,
        "store_type": data.store_type,
        "address": data.address,
        "lat": data.lat,
        "lng": data.lng,
        "description": data.description,
        "rating": 5.0,
        "total_orders": 0,
        "is_active": True,
        "opening_hours": "09:00-22:00",
        "image_url": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.merchants.insert_one(merchant)
    await db.users.update_one({"id": user["id"]}, {"$set": {"role": "merchant"}})
    
    merchant.pop("_id", None)
    return merchant

@api_router.get("/merchants")
async def list_merchants(store_type: Optional[str] = None, lat: Optional[float] = None, lng: Optional[float] = None):
    query = {"is_active": True}
    if store_type:
        query["store_type"] = store_type
    
    merchants = await db.merchants.find(query, {"_id": 0}).to_list(100)
    
    # Sort by distance if location provided
    if lat and lng:
        for m in merchants:
            m["distance"] = calculate_distance(lat, lng, m["lat"], m["lng"])
        merchants.sort(key=lambda x: x["distance"])
    
    return merchants

@api_router.get("/merchants/{merchant_id}")
async def get_merchant(merchant_id: str):
    merchant = await db.merchants.find_one({"id": merchant_id}, {"_id": 0})
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    return merchant

@api_router.get("/merchants/{merchant_id}/products")
async def get_merchant_products(merchant_id: str):
    products = await db.products.find({"merchant_id": merchant_id, "is_available": True}, {"_id": 0}).to_list(500)
    return products

@api_router.post("/merchants/products")
async def add_product(data: ProductCreate, request: Request):
    user = await get_current_user(request)
    merchant = await db.merchants.find_one({"user_id": user["id"]})
    if not merchant:
        raise HTTPException(status_code=403, detail="Not a merchant")
    
    product = {
        "id": f"prod_{uuid.uuid4().hex[:12]}",
        "merchant_id": merchant["id"],
        **data.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.products.insert_one(product)
    product.pop("_id", None)
    return product

@api_router.put("/merchants/products/{product_id}")
async def update_product(product_id: str, data: ProductCreate, request: Request):
    user = await get_current_user(request)
    merchant = await db.merchants.find_one({"user_id": user["id"]})
    if not merchant:
        raise HTTPException(status_code=403, detail="Not a merchant")
    
    result = await db.products.update_one(
        {"id": product_id, "merchant_id": merchant["id"]},
        {"$set": data.model_dump()}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product updated"}

@api_router.delete("/merchants/products/{product_id}")
async def delete_product(product_id: str, request: Request):
    user = await get_current_user(request)
    merchant = await db.merchants.find_one({"user_id": user["id"]})
    if not merchant:
        raise HTTPException(status_code=403, detail="Not a merchant")
    
    result = await db.products.delete_one({"id": product_id, "merchant_id": merchant["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted"}

# ===================
# RIDE ENDPOINTS
# ===================

@api_router.post("/rides/estimate")
async def estimate_ride(data: RideRequest):
    distance = calculate_distance(data.pickup_lat, data.pickup_lng, data.dropoff_lat, data.dropoff_lng)
    fare = calculate_fare(distance, data.vehicle_type)
    duration = int(distance * 3)  # Rough estimate: 3 mins per km
    
    return {
        "distance_km": round(distance, 2),
        "duration_mins": duration,
        "estimated_fare": fare,
        "vehicle_type": data.vehicle_type
    }

@api_router.post("/rides", response_model=RideResponse)
async def create_ride(data: RideRequest, request: Request):
    user = await get_current_user(request)
    
    distance = calculate_distance(data.pickup_lat, data.pickup_lng, data.dropoff_lat, data.dropoff_lng)
    fare = calculate_fare(distance, data.vehicle_type)
    duration = int(distance * 3)
    otp = str(secrets.randbelow(10000)).zfill(4)
    
    ride = {
        "id": f"ride_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "driver_id": None,
        "pickup_lat": data.pickup_lat,
        "pickup_lng": data.pickup_lng,
        "pickup_address": data.pickup_address,
        "dropoff_lat": data.dropoff_lat,
        "dropoff_lng": data.dropoff_lng,
        "dropoff_address": data.dropoff_address,
        "vehicle_type": data.vehicle_type,
        "status": "pending",
        "estimated_fare": fare,
        "final_fare": None,
        "distance_km": round(distance, 2),
        "duration_mins": duration,
        "payment_method": data.payment_method,
        "payment_status": "pending",
        "otp": otp,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.rides.insert_one(ride)
    
    # Broadcast to nearby drivers
    await manager.broadcast({
        "type": "new_ride",
        "ride_id": ride["id"],
        "pickup_lat": ride["pickup_lat"],
        "pickup_lng": ride["pickup_lng"],
        "pickup_address": ride["pickup_address"],
        "vehicle_type": ride["vehicle_type"],
        "fare": fare
    })
    
    ride.pop("_id", None)
    ride["created_at"] = datetime.fromisoformat(ride["created_at"])
    return RideResponse(**ride)

@api_router.get("/rides/{ride_id}", response_model=RideResponse)
async def get_ride(ride_id: str, request: Request):
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    
    # Check access
    if ride["user_id"] != user["id"] and ride.get("driver_id") != user["id"] and user["role"] not in ["admin", "dispatcher"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if isinstance(ride.get("created_at"), str):
        ride["created_at"] = datetime.fromisoformat(ride["created_at"])
    return RideResponse(**ride)

@api_router.post("/rides/{ride_id}/accept")
async def accept_ride(ride_id: str, request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]})
    if not driver or driver["status"] != "approved":
        raise HTTPException(status_code=403, detail="Not an approved driver")
    
    ride = await db.rides.find_one({"id": ride_id, "status": "pending"})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found or already taken")
    
    await db.rides.update_one(
        {"id": ride_id},
        {"$set": {"driver_id": driver["id"], "status": "accepted"}}
    )
    
    # Notify user
    await manager.send_personal_message({
        "type": "ride_accepted",
        "ride_id": ride_id,
        "driver_id": driver["id"]
    }, ride["user_id"])
    
    return {"message": "Ride accepted"}

@api_router.post("/rides/{ride_id}/status")
async def update_ride_status(ride_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    new_status = body.get("status")
    
    valid_statuses = ["arriving", "in_progress", "completed", "cancelled"]
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    
    # Verify driver or admin
    driver = await db.drivers.find_one({"user_id": user["id"]})
    if not driver and user["role"] not in ["admin", "dispatcher"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = {"status": new_status}
    if new_status == "completed":
        update_data["final_fare"] = ride["estimated_fare"]
        update_data["payment_status"] = "completed" if ride["payment_method"] != "cash" else "pending"
        
        # Update driver stats
        await db.drivers.update_one(
            {"id": ride["driver_id"]},
            {"$inc": {"total_trips": 1, "earnings": ride["estimated_fare"]}}
        )
    
    await db.rides.update_one({"id": ride_id}, {"$set": update_data})
    
    # Notify user
    await manager.send_personal_message({
        "type": "ride_status",
        "ride_id": ride_id,
        "status": new_status
    }, ride["user_id"])
    
    return {"message": f"Status updated to {new_status}"}

@api_router.get("/rides")
async def list_rides(request: Request, status: Optional[str] = None, limit: int = 20):
    user = await get_current_user(request)
    
    query = {}
    if user["role"] == "user":
        query["user_id"] = user["id"]
    elif user["role"] == "driver":
        driver = await db.drivers.find_one({"user_id": user["id"]})
        if driver:
            query["$or"] = [{"driver_id": driver["id"]}, {"status": "pending", "vehicle_type": driver["vehicle_type"]}]
    
    if status:
        query["status"] = status
    
    rides = await db.rides.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    
    for ride in rides:
        if isinstance(ride.get("created_at"), str):
            ride["created_at"] = datetime.fromisoformat(ride["created_at"])
    
    return rides

# ===================
# ORDER ENDPOINTS
# ===================

@api_router.post("/orders", response_model=OrderResponse)
async def create_order(data: OrderCreate, request: Request):
    user = await get_current_user(request)
    
    merchant = await db.merchants.find_one({"id": data.merchant_id}, {"_id": 0})
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    
    # Calculate totals
    items_with_details = []
    subtotal = 0.0
    for item in data.items:
        product = await db.products.find_one({"id": item.product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
        item_total = product["price"] * item.quantity
        subtotal += item_total
        items_with_details.append({
            "product_id": item.product_id,
            "name": product["name"],
            "price": product["price"],
            "quantity": item.quantity,
            "total": item_total
        })
    
    delivery_fee = 2.50  # Base delivery fee
    total = subtotal + delivery_fee
    
    order = {
        "id": f"order_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "merchant_id": data.merchant_id,
        "driver_id": None,
        "items": items_with_details,
        "subtotal": round(subtotal, 2),
        "delivery_fee": delivery_fee,
        "total": round(total, 2),
        "order_type": data.order_type,
        "status": "pending",
        "delivery_address": data.delivery_address,
        "delivery_lat": data.delivery_lat,
        "delivery_lng": data.delivery_lng,
        "payment_method": data.payment_method,
        "payment_status": "pending",
        "special_instructions": data.special_instructions,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "estimated_delivery": (datetime.now(timezone.utc) + timedelta(minutes=45)).isoformat()
    }
    await db.orders.insert_one(order)
    
    order.pop("_id", None)
    order["created_at"] = datetime.fromisoformat(order["created_at"])
    order["estimated_delivery"] = datetime.fromisoformat(order["estimated_delivery"])
    
    return OrderResponse(**order)

@api_router.get("/orders/{order_id}")
async def get_order(order_id: str, request: Request):
    user = await get_current_user(request)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Check access
    if order["user_id"] != user["id"] and user["role"] not in ["admin", "dispatcher", "merchant"]:
        merchant = await db.merchants.find_one({"user_id": user["id"]})
        if not merchant or merchant["id"] != order["merchant_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
    
    return order

@api_router.post("/orders/{order_id}/status")
async def update_order_status(order_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    new_status = body.get("status")
    
    valid_statuses = ["accepted", "preparing", "ready", "picked_up", "delivered", "cancelled"]
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Verify permissions
    allowed = False
    if user["role"] in ["admin", "dispatcher"]:
        allowed = True
    elif user["role"] == "merchant":
        merchant = await db.merchants.find_one({"user_id": user["id"]})
        if merchant and merchant["id"] == order["merchant_id"]:
            allowed = True
    elif user["role"] == "driver":
        driver = await db.drivers.find_one({"user_id": user["id"]})
        if driver and order.get("driver_id") == driver["id"]:
            allowed = True
    
    if not allowed:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = {"status": new_status}
    if new_status == "delivered":
        update_data["payment_status"] = "completed" if order["payment_method"] != "cash" else "pending"
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Notify user
    await manager.send_personal_message({
        "type": "order_status",
        "order_id": order_id,
        "status": new_status
    }, order["user_id"])
    
    return {"message": f"Status updated to {new_status}"}

@api_router.post("/orders/{order_id}/assign-driver")
async def assign_driver_to_order(order_id: str, request: Request):
    user = await require_role(request, ["admin", "dispatcher"])
    body = await request.json()
    driver_id = body.get("driver_id")
    
    driver = await db.drivers.find_one({"id": driver_id})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    
    result = await db.orders.update_one(
        {"id": order_id},
        {"$set": {"driver_id": driver_id}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return {"message": "Driver assigned"}

@api_router.get("/orders")
async def list_orders(request: Request, status: Optional[str] = None, limit: int = 20):
    user = await get_current_user(request)
    
    query = {}
    if user["role"] == "user":
        query["user_id"] = user["id"]
    elif user["role"] == "merchant":
        merchant = await db.merchants.find_one({"user_id": user["id"]})
        if merchant:
            query["merchant_id"] = merchant["id"]
    elif user["role"] == "driver":
        driver = await db.drivers.find_one({"user_id": user["id"]})
        if driver:
            query["driver_id"] = driver["id"]
    
    if status:
        query["status"] = status
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return orders

# ===================
# WALLET ENDPOINTS
# ===================

@api_router.get("/wallet", response_model=WalletResponse)
async def get_wallet(request: Request):
    user = await get_current_user(request)
    wallet = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
    if not wallet:
        wallet = {"user_id": user["id"], "balance": 0.0}
        await db.wallets.insert_one(wallet)
    
    transactions = await db.wallet_transactions.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).limit(20).to_list(20)
    
    return WalletResponse(balance=wallet["balance"], transactions=transactions)

@api_router.post("/wallet/topup")
async def topup_wallet(data: WalletTopUp, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    origin_url = body.get("origin_url", "")
    
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
    
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    success_url = f"{origin_url}/wallet?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin_url}/wallet"
    
    checkout_request = CheckoutSessionRequest(
        amount=float(data.amount),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"user_id": user["id"], "type": "wallet_topup"}
    )
    
    session = await stripe_checkout.create_checkout_session(checkout_request)
    
    # Record pending transaction
    await db.payment_transactions.insert_one({
        "id": f"txn_{uuid.uuid4().hex[:12]}",
        "session_id": session.session_id,
        "user_id": user["id"],
        "amount": data.amount,
        "currency": "usd",
        "type": "wallet_topup",
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"checkout_url": session.url, "session_id": session.session_id}

@api_router.get("/wallet/checkout-status/{session_id}")
async def check_wallet_topup_status(session_id: str, request: Request):
    user = await get_current_user(request)
    
    txn = await db.payment_transactions.find_one({"session_id": session_id, "user_id": user["id"]}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if txn["status"] == "completed":
        return {"status": "completed", "amount": txn["amount"]}
    
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    status = await stripe_checkout.get_checkout_status(session_id)
    
    if status.payment_status == "paid" and txn["status"] != "completed":
        # Credit wallet
        await db.wallets.update_one(
            {"user_id": user["id"]},
            {"$inc": {"balance": txn["amount"]}}
        )
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"status": "completed"}}
        )
        await db.wallet_transactions.insert_one({
            "id": f"wtxn_{uuid.uuid4().hex[:12]}",
            "user_id": user["id"],
            "amount": txn["amount"],
            "type": "credit",
            "description": "Wallet top-up",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        return {"status": "completed", "amount": txn["amount"]}
    
    return {"status": status.payment_status, "amount": txn["amount"]}

# ===================
# STRIPE WEBHOOK
# ===================

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    
    body = await request.body()
    sig = request.headers.get("Stripe-Signature")
    
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    
    try:
        webhook_response = await stripe_checkout.handle_webhook(body, sig)
        
        if webhook_response.payment_status == "paid":
            session_id = webhook_response.session_id
            txn = await db.payment_transactions.find_one({"session_id": session_id})
            
            if txn and txn["status"] != "completed":
                if txn["type"] == "wallet_topup":
                    await db.wallets.update_one(
                        {"user_id": txn["user_id"]},
                        {"$inc": {"balance": txn["amount"]}}
                    )
                await db.payment_transactions.update_one(
                    {"session_id": session_id},
                    {"$set": {"status": "completed"}}
                )
        
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"status": "error"}

# ===================
# RATING ENDPOINTS
# ===================

@api_router.post("/rides/{ride_id}/rate")
async def rate_ride(ride_id: str, data: RatingCreate, request: Request):
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id, "user_id": user["id"], "status": "completed"})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found or not completed")
    
    rating = {
        "id": f"rating_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "driver_id": ride["driver_id"],
        "ride_id": ride_id,
        "rating": max(1, min(5, data.rating)),
        "comment": data.comment,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.ratings.insert_one(rating)
    
    # Update driver average rating
    ratings = await db.ratings.find({"driver_id": ride["driver_id"]}, {"rating": 1}).to_list(1000)
    avg_rating = sum(r["rating"] for r in ratings) / len(ratings) if ratings else 5.0
    await db.drivers.update_one({"id": ride["driver_id"]}, {"$set": {"rating": round(avg_rating, 2)}})
    
    return {"message": "Rating submitted"}

@api_router.post("/orders/{order_id}/rate")
async def rate_order(order_id: str, data: RatingCreate, request: Request):
    user = await get_current_user(request)
    order = await db.orders.find_one({"id": order_id, "user_id": user["id"], "status": "delivered"})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found or not delivered")
    
    rating = {
        "id": f"rating_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "merchant_id": order["merchant_id"],
        "order_id": order_id,
        "rating": max(1, min(5, data.rating)),
        "comment": data.comment,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.ratings.insert_one(rating)
    
    # Update merchant average rating
    ratings = await db.ratings.find({"merchant_id": order["merchant_id"]}, {"rating": 1}).to_list(1000)
    avg_rating = sum(r["rating"] for r in ratings) / len(ratings) if ratings else 5.0
    await db.merchants.update_one({"id": order["merchant_id"]}, {"$set": {"rating": round(avg_rating, 2)}})
    
    return {"message": "Rating submitted"}

# ===================
# SUPPORT ENDPOINTS
# ===================

@api_router.post("/support/tickets")
async def create_ticket(data: TicketCreate, request: Request):
    user = await get_current_user(request)
    
    ticket = {
        "id": f"ticket_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "subject": data.subject,
        "message": data.message,
        "related_id": data.related_id,
        "related_type": data.related_type,
        "status": "open",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.support_tickets.insert_one(ticket)
    ticket.pop("_id", None)
    return ticket

@api_router.get("/support/tickets")
async def list_tickets(request: Request):
    user = await get_current_user(request)
    
    if user["role"] == "admin":
        tickets = await db.support_tickets.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    else:
        tickets = await db.support_tickets.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    return tickets

@api_router.post("/support/tickets/{ticket_id}/reply")
async def reply_to_ticket(ticket_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    message = body.get("message")
    
    ticket = await db.support_tickets.find_one({"id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    if ticket["user_id"] != user["id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    reply = {
        "user_id": user["id"],
        "message": message,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.support_tickets.update_one(
        {"id": ticket_id},
        {"$push": {"replies": reply}}
    )
    
    return {"message": "Reply added"}

# ===================
# ADMIN ENDPOINTS
# ===================

@api_router.get("/admin/dashboard")
async def admin_dashboard(request: Request):
    await require_role(request, ["admin"])
    
    total_users = await db.users.count_documents({"role": "user"})
    total_drivers = await db.drivers.count_documents({})
    active_drivers = await db.drivers.count_documents({"is_online": True})
    total_merchants = await db.merchants.count_documents({})
    
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_rides = await db.rides.count_documents({"created_at": {"$gte": today.isoformat()}})
    today_orders = await db.orders.count_documents({"created_at": {"$gte": today.isoformat()}})
    
    pending_drivers = await db.drivers.count_documents({"status": "pending"})
    open_tickets = await db.support_tickets.count_documents({"status": "open"})
    
    # Revenue calculation
    completed_rides = await db.rides.find({"status": "completed", "created_at": {"$gte": today.isoformat()}}, {"final_fare": 1}).to_list(1000)
    completed_orders = await db.orders.find({"status": "delivered", "created_at": {"$gte": today.isoformat()}}, {"total": 1}).to_list(1000)
    
    today_revenue = sum(r.get("final_fare", 0) or 0 for r in completed_rides) + sum(o.get("total", 0) for o in completed_orders)
    
    return {
        "total_users": total_users,
        "total_drivers": total_drivers,
        "active_drivers": active_drivers,
        "total_merchants": total_merchants,
        "today_rides": today_rides,
        "today_orders": today_orders,
        "today_revenue": round(today_revenue, 2),
        "pending_drivers": pending_drivers,
        "open_tickets": open_tickets
    }

@api_router.get("/admin/users")
async def admin_list_users(request: Request, role: Optional[str] = None, limit: int = 50, skip: int = 0):
    await require_role(request, ["admin"])
    
    query = {}
    if role:
        query["role"] = role
    
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).skip(skip).limit(limit).to_list(limit)
    total = await db.users.count_documents(query)
    
    return {"users": users, "total": total}

@api_router.get("/admin/drivers")
async def admin_list_drivers(request: Request, status: Optional[str] = None, limit: int = 50, skip: int = 0):
    await require_role(request, ["admin"])
    
    query = {}
    if status:
        query["status"] = status
    
    drivers = await db.drivers.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    total = await db.drivers.count_documents(query)
    
    # Get user info for each driver
    for driver in drivers:
        user = await db.users.find_one({"id": driver["user_id"]}, {"_id": 0, "password_hash": 0})
        driver["user"] = user
    
    return {"drivers": drivers, "total": total}

@api_router.post("/admin/drivers/{driver_id}/approve")
async def approve_driver(driver_id: str, request: Request):
    await require_role(request, ["admin"])
    
    result = await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {"status": "approved"}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Driver not found")
    
    return {"message": "Driver approved"}

@api_router.post("/admin/drivers/{driver_id}/reject")
async def reject_driver(driver_id: str, request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    reason = body.get("reason", "")
    
    result = await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {"status": "rejected", "rejection_reason": reason}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Driver not found")
    
    return {"message": "Driver rejected"}

@api_router.get("/admin/rides")
async def admin_list_rides(request: Request, status: Optional[str] = None, limit: int = 50, skip: int = 0):
    await require_role(request, ["admin", "dispatcher"])
    
    query = {}
    if status:
        query["status"] = status
    
    rides = await db.rides.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.rides.count_documents(query)
    
    return {"rides": rides, "total": total}

@api_router.get("/admin/orders")
async def admin_list_orders(request: Request, status: Optional[str] = None, limit: int = 50, skip: int = 0):
    await require_role(request, ["admin", "dispatcher"])
    
    query = {}
    if status:
        query["status"] = status
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.orders.count_documents(query)
    
    return {"orders": orders, "total": total}

@api_router.post("/admin/users/{user_id}/suspend")
async def suspend_user(user_id: str, request: Request):
    await require_role(request, ["admin"])
    
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_suspended": True}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User suspended"}

@api_router.post("/admin/users/{user_id}/unsuspend")
async def unsuspend_user(user_id: str, request: Request):
    await require_role(request, ["admin"])
    
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_suspended": False}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User unsuspended"}

# ===================
# DISPATCHER ENDPOINTS
# ===================

@api_router.get("/dispatcher/live")
async def dispatcher_live_data(request: Request):
    await require_role(request, ["admin", "dispatcher"])
    
    # Get all online drivers with their locations
    online_drivers = await db.drivers.find(
        {"is_online": True, "current_lat": {"$ne": None}},
        {"_id": 0}
    ).to_list(500)
    
    # Get pending rides
    pending_rides = await db.rides.find(
        {"status": {"$in": ["pending", "accepted", "arriving", "in_progress"]}},
        {"_id": 0}
    ).to_list(100)
    
    # Get pending orders
    pending_orders = await db.orders.find(
        {"status": {"$in": ["pending", "accepted", "preparing", "ready", "picked_up"]}},
        {"_id": 0}
    ).to_list(100)
    
    return {
        "drivers": online_drivers,
        "rides": pending_rides,
        "orders": pending_orders
    }

@api_router.post("/dispatcher/assign-ride")
async def dispatcher_assign_ride(request: Request):
    await require_role(request, ["admin", "dispatcher"])
    body = await request.json()
    ride_id = body.get("ride_id")
    driver_id = body.get("driver_id")
    
    driver = await db.drivers.find_one({"id": driver_id, "status": "approved", "is_online": True})
    if not driver:
        raise HTTPException(status_code=400, detail="Driver not available")
    
    result = await db.rides.update_one(
        {"id": ride_id, "status": "pending"},
        {"$set": {"driver_id": driver_id, "status": "accepted"}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Ride not found or already assigned")
    
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    await manager.send_personal_message({
        "type": "ride_assigned",
        "ride_id": ride_id
    }, driver["user_id"])
    
    return {"message": "Ride assigned"}

# ===================
# WEBSOCKET ENDPOINT
# ===================

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_json()
            
            if data.get("type") == "location_update":
                manager.update_driver_location(client_id, data["lat"], data["lng"])
                await db.drivers.update_one(
                    {"user_id": client_id},
                    {"$set": {"current_lat": data["lat"], "current_lng": data["lng"]}}
                )
                
                # Broadcast to connected clients tracking this driver
                ride = await db.rides.find_one({"driver_id": client_id, "status": {"$in": ["accepted", "arriving", "in_progress"]}})
                if ride:
                    await manager.send_personal_message({
                        "type": "driver_location",
                        "lat": data["lat"],
                        "lng": data["lng"]
                    }, ride["user_id"])
            
            elif data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
                
    except WebSocketDisconnect:
        manager.disconnect(client_id)

# ===================
# FILE ENDPOINTS
# ===================

@api_router.get("/files/{path:path}")
async def download_file(path: str, request: Request, auth: Optional[str] = Query(None)):
    try:
        data, content_type = get_object(path)
        return Response(content=data, media_type=content_type)
    except Exception as e:
        raise HTTPException(status_code=404, detail="File not found")

# ===================
# HEALTH CHECK
# ===================

@api_router.get("/")
async def root():
    return {"message": "SuperApp API", "status": "healthy"}

@api_router.get("/health")
async def health():
    return {"status": "ok"}

# Include router
app.include_router(api_router)

# CORS - Must specify exact origin when allow_credentials=True
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://gojek-mvp-1.preview.emergentagent.com")
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[FRONTEND_URL, "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)
