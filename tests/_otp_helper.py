"""Helper to recover plaintext OTPs from MongoDB for testing."""
import hashlib
import os
import sys
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']


def recover_otp(email: str, purpose: str) -> str:
    """Find latest auth_codes doc for email+purpose, brute force the 6-digit code."""
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    doc = db.auth_codes.find_one({"email": email.lower(), "purpose": purpose}, sort=[("_id", -1)])
    if not doc:
        return None
    target = doc["code_hash"]
    for n in range(100000, 1000000):
        if hashlib.sha256(f"{JWT_SECRET}:{n}".encode()).hexdigest() == target:
            return str(n)
    return None


if __name__ == "__main__":
    email = sys.argv[1]
    purpose = sys.argv[2]
    print(recover_otp(email, purpose))
