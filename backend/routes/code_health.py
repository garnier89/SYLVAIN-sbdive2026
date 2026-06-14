"""Admin « Santé du code » dashboard — static codebase metrics.

Read-only filesystem scan of the backend Python tree. No pytest execution:
provides line counts per module/directory, endpoint/function counts, the
largest files (tech-debt hotspots) and a static test-coverage proxy (which
modules have at least one referencing test file). Admin-only.
"""
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Request, HTTPException

from core.deps import get_current_user

router = APIRouter(prefix="/admin/code-health", tags=["admin-code-health"])

BACKEND_ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"__pycache__", ".venv", "venv", "node_modules", ".git", ".pytest_cache"}
WARN_LINES = 400
DANGER_LINES = 800

_DEF_RE = re.compile(r"^\s*(?:async\s+)?def\s+\w+")
_ENDPOINT_RE = re.compile(r"^\s*@\w+\.(get|post|put|delete|patch)\(")
_TEST_DEF_RE = re.compile(r"^\s*(?:async\s+)?def\s+test_\w+")


def _level(lines: int) -> str:
    if lines >= DANGER_LINES:
        return "danger"
    if lines >= WARN_LINES:
        return "warn"
    return "ok"


def _scan_file(path: Path):
    lines = funcs = endpoints = 0
    try:
        for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            lines += 1
            if _DEF_RE.match(raw):
                funcs += 1
            elif _ENDPOINT_RE.match(raw):
                endpoints += 1
    except OSError:
        pass
    return lines, funcs, endpoints


def _module_name(rel: Path) -> str:
    """routes/rides.py -> routes.rides ; core/cashback.py -> core.cashback"""
    parts = list(rel.with_suffix("").parts)
    return ".".join(parts)


def _build_report() -> dict:
    files = []          # production files (excludes tests/)
    test_files = []     # tests/*.py
    test_blob_parts = []

    for path in BACKEND_ROOT.rglob("*.py"):
        if any(p in SKIP_DIRS for p in path.parts):
            continue
        rel = path.relative_to(BACKEND_ROOT)
        top = rel.parts[0]
        lines, funcs, endpoints = _scan_file(path)
        if top == "tests":
            tlines = 0
            try:
                for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
                    if _TEST_DEF_RE.match(raw):
                        tlines += 1
                test_blob_parts.append(path.read_text(encoding="utf-8", errors="ignore"))
            except OSError:
                pass
            test_files.append({"path": str(rel), "lines": lines, "tests": tlines})
            continue
        files.append({
            "path": str(rel),
            "dir": rel.parts[0] if len(rel.parts) > 1 else ".",
            "module": _module_name(rel),
            "lines": lines,
            "functions": funcs,
            "endpoints": endpoints,
            "level": _level(lines),
        })

    total_lines = sum(f["lines"] for f in files)
    total_funcs = sum(f["functions"] for f in files)
    total_endpoints = sum(f["endpoints"] for f in files)
    total_test_funcs = sum(t["tests"] for t in test_files)

    # By directory
    dir_map = {}
    for f in files:
        d = dir_map.setdefault(f["dir"], {"dir": f["dir"], "files": 0, "lines": 0, "endpoints": 0})
        d["files"] += 1
        d["lines"] += f["lines"]
        d["endpoints"] += f["endpoints"]
    by_directory = sorted(dir_map.values(), key=lambda x: x["lines"], reverse=True)

    # By domain (sub-package granularity: surfaces routes/admin, routes/market, …)
    domain_map = {}
    for f in files:
        dom = str(Path(f["path"]).parent)
        dm = domain_map.setdefault(dom, {"domain": dom, "files": 0, "lines": 0, "endpoints": 0, "functions": 0})
        dm["files"] += 1
        dm["lines"] += f["lines"]
        dm["endpoints"] += f["endpoints"]
        dm["functions"] += f["functions"]
    by_domain = sorted(domain_map.values(), key=lambda x: x["lines"], reverse=True)

    # Largest files (tech-debt hotspots)
    largest = sorted(files, key=lambda x: x["lines"], reverse=True)[:25]

    # Static coverage proxy: a routes/ or core/ module is "tested" if any test
    # file references its dotted module name.
    test_blob = "\n".join(test_blob_parts)
    source_modules = [f for f in files
                      if f["dir"] in ("routes", "core") and not f["path"].endswith("__init__.py")]
    tested, untested = [], []
    for m in source_modules:
        if m["module"] in test_blob:
            tested.append(m)
        else:
            untested.append(m)
    untested_sorted = sorted(untested, key=lambda x: x["lines"], reverse=True)
    src_count = len(source_modules)
    ratio = round(100.0 * len(tested) / src_count, 1) if src_count else 0.0

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "thresholds": {"warn": WARN_LINES, "danger": DANGER_LINES},
        "kpis": {
            "py_files": len(files),
            "total_lines": total_lines,
            "total_functions": total_funcs,
            "total_endpoints": total_endpoints,
            "test_files": len(test_files),
            "test_functions": total_test_funcs,
            "danger_files": sum(1 for f in files if f["level"] == "danger"),
            "warn_files": sum(1 for f in files if f["level"] == "warn"),
        },
        "by_directory": by_directory,
        "by_domain": by_domain,
        "largest_files": largest,
        "coverage": {
            "source_modules": src_count,
            "tested": len(tested),
            "untested_count": len(untested),
            "ratio": ratio,
            "untested": [{"module": m["module"], "lines": m["lines"]} for m in untested_sorted[:40]],
        },
    }


@router.get("")
async def code_health(request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Réservé aux administrateurs")
    return _build_report()


async def _require_admin(request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Réservé aux administrateurs")
    return user


@router.get("/security")
async def code_security(request: Request):
    """Integrity (AST corruption + baseline drift), duplication, suspicious patterns."""
    await _require_admin(request)
    from core.code_audit import scan_security
    return await scan_security()


@router.post("/integrity/baseline")
async def set_baseline(request: Request):
    """Snapshot current file hashes as the integrity baseline for drift detection."""
    await _require_admin(request)
    from core.code_audit import set_integrity_baseline
    return await set_integrity_baseline()


@router.get("/maps-guard")
async def maps_guard(request: Request):
    """Google Maps usage audit — loaders, billable REST calls, polling-in-interval."""
    await _require_admin(request)
    from core.code_audit import scan_maps_guard
    return scan_maps_guard()


@router.get("/maps-guard/gate")
async def maps_guard_gate(request: Request):
    """Pre-deploy gate: GO / REVIEW / BLOCKED vs the accepted Maps baseline."""
    await _require_admin(request)
    from core.code_audit import maps_gate
    return await maps_gate()


@router.post("/maps-guard/baseline")
async def maps_guard_baseline(request: Request):
    """Accept the current Maps usage as the deployment baseline."""
    await _require_admin(request)
    from core.code_audit import set_maps_baseline
    return await set_maps_baseline()


@router.get("/coverage")
async def coverage_status(request: Request):
    """Last real pytest --cov run result."""
    await _require_admin(request)
    from core.code_audit import get_coverage_run
    return await get_coverage_run()


@router.get("/coverage/by-domain")
async def coverage_by_domain_route(request: Request):
    """Last real pytest --cov result aggregated by domain (source directory)."""
    await _require_admin(request)
    from core.code_audit import coverage_by_domain
    return coverage_by_domain()


@router.post("/coverage/run")
async def coverage_run(request: Request):
    """Kick off a real pytest --cov analysis in the background."""
    await _require_admin(request)
    from core.code_audit import start_coverage_run
    return await start_coverage_run()
