from routes.admin._common import *  # noqa: F401,F403

@router.post("/import/drivers")
async def admin_import_drivers(request: Request):
    """Bulk-create drivers from CSV. Generates a password per row (unless a `password`
    column is provided). Invalid rows are skipped with a reason; the rest are imported.
    Returns a per-line report incl. the generated password (to communicate to drivers)."""
    await require_role(request, ["admin"], permission="drivers.approve")
    body = await request.json()
    rows = _read_csv_rows(body.get("csv") or "")
    created, skipped, results = 0, 0, []
    for i, row in enumerate(rows, start=2):  # line 1 = header
        email = row.get("email", "")
        try:
            payload = {
                "first_name": row.get("first_name"), "last_name": row.get("last_name"),
                "email": email, "phone": row.get("phone"),
                "service_types": _split_multi(row.get("service_types", "")) or None,
                "taxi_sub": row.get("taxi_sub"), "taxi_mode": row.get("taxi_mode"),
                "company_name": row.get("company_name"), "vehicle_type": row.get("vehicle_type"),
                "vehicle_number": row.get("vehicle_number"), "vehicle_model": row.get("vehicle_model"),
                "license_number": row.get("license_number"), "status": row.get("status"),
            }
            pw = (row.get("password") or "").strip() or _generate_password()
            res = await _create_driver_internal(payload, password=pw)
            created += 1
            results.append({"line": i, "status": "created", "email": res["user"]["email"],
                            "name": res["user"]["name"], "password": res["password"]})
        except HTTPException as e:
            skipped += 1
            results.append({"line": i, "status": "skipped", "email": email, "reason": str(e.detail)})
        except Exception as e:  # noqa: BLE001 — never let one bad row abort the batch
            skipped += 1
            results.append({"line": i, "status": "skipped", "email": email, "reason": str(e)})
    return {"created": created, "skipped": skipped, "total": created + skipped, "results": results}


@router.post("/import/merchants")
async def admin_import_merchants(request: Request):
    """Bulk-create merchants from CSV (same semantics as the driver import)."""
    await require_role(request, ["admin"], permission="merchants.activate")
    body = await request.json()
    rows = _read_csv_rows(body.get("csv") or "")
    created, skipped, results = 0, 0, []
    for i, row in enumerate(rows, start=2):
        email = row.get("email", "")
        try:
            payload = {
                "name": row.get("name"), "email": email, "phone": row.get("phone"),
                "store_name": row.get("store_name"), "store_type": row.get("store_type"),
                "address": row.get("address"), "description": row.get("description"),
            }
            pw = (row.get("password") or "").strip() or _generate_password()
            res = await _create_merchant_internal(payload, password=pw)
            created += 1
            results.append({"line": i, "status": "created", "email": res["user"]["email"],
                            "name": res["user"]["name"], "password": res["password"]})
        except HTTPException as e:
            skipped += 1
            results.append({"line": i, "status": "skipped", "email": email, "reason": str(e.detail)})
        except Exception as e:  # noqa: BLE001
            skipped += 1
            results.append({"line": i, "status": "skipped", "email": email, "reason": str(e)})
    return {"created": created, "skipped": skipped, "total": created + skipped, "results": results}
