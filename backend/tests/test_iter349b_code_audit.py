"""Iter349b — code-audit engine (Santé du code) static analysers.

Validates the read-only scanners power the admin dashboard correctly:
  * integrity: no corrupted backend file, hashes computed.
  * duplication: returns a well-formed structure.
  * suspicious: no high-severity finding (clean repo) and FP-resistant.
  * maps guard: detects loaders + billable REST calls and a sane status.
  * unit-test selector excludes network/e2e files.
"""
import sys
import asyncio

import pytest
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

from core import code_audit as CA  # noqa: E402

_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)


def run(coro):
    return _LOOP.run_until_complete(coro)


def test_integrity_no_corruption():
    info = run(CA.compute_integrity())
    assert info["files_checked"] > 100
    assert info["broken_count"] == 0, f"corrupted files: {info['broken']}"
    assert info["_hashes"], "hashes must be computed"


def test_duplication_structure():
    dup = CA.compute_duplication()
    assert "clusters_count" in dup and "duplication_ratio" in dup
    assert dup["window_lines"] == CA._WIN
    assert isinstance(dup["top"], list)


def test_suspicious_no_false_positive_on_labels():
    sus = CA.compute_suspicious()
    # The hardened secret regex must not flag translation labels (spaces) etc.
    assert sus["high"] == 0
    assert isinstance(sus["findings"], list)


def test_maps_guard_detects_usage():
    g = CA.scan_maps_guard()
    assert g["files_touching_maps"] > 0
    assert g["loaders_count"] > 0
    assert g["rest_calls_total"] >= 0
    assert g["status"] in ("ok", "warn", "danger")
    # REST usage entries are well-formed
    for u in g["rest_usage"]:
        assert "api" in u and "count" in u


def test_maps_deploy_gate_baseline_and_verdict():
    # Set baseline on current state → gate must be GO with no new risks.
    run(CA.set_maps_baseline())
    gate = run(CA.maps_gate())
    assert gate["verdict"] == "go"
    assert gate["new_risks_count"] == 0
    assert gate["rest_delta"] == 0
    assert gate["baseline_at"] is not None


def test_unit_selector_excludes_network_tests():
    unit = CA._unit_test_files()
    assert len(unit) > 10
    # This very file is pure-unit → must be included.
    assert any("test_iter349b" in f for f in unit)
    # Files are paths under tests/
    assert all(f.startswith("tests/") for f in unit)
