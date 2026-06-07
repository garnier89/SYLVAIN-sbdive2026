"""Centralized test credentials sourced from environment variables.

All test files must import from this module instead of hardcoding credentials.
Override any value via env variables (e.g. TEST_ADMIN_PASSWORD=xxx pytest).
"""
import os

# Admin
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@superapp.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")

# Standard test user
TEST_USER_EMAIL = os.environ.get("TEST_USER_EMAIL", "test2@example.com")
TEST_USER_PASSWORD = os.environ.get("TEST_USER_PASSWORD", "TestPass123!")

# Driver
DRIVER_EMAIL = os.environ.get("TEST_DRIVER_EMAIL", "jean.dupont@demo.sb")
DRIVER_PASSWORD = os.environ.get("TEST_DRIVER_PASSWORD", "Driver123!")
DRIVER_PASSWORD_ALT = os.environ.get("TEST_DRIVER_PASSWORD_ALT", "Driver1234!")
DRIVER_PASSWORD_FR = os.environ.get("TEST_DRIVER_PASSWORD_FR", "Chauffeur2026!")

# Rider
RIDER_PASSWORD = os.environ.get("TEST_RIDER_PASSWORD", "Rider123!")

# Negotiation / Misc test user
NEG_TEST_EMAIL = os.environ.get("TEST_NEG_EMAIL", "neg_test@example.com")
NEG_TEST_PASSWORD = os.environ.get("TEST_NEG_PASSWORD", "Test1234!")
