"""Static code-audit engine for the admin « Santé du code » dashboard.

Read-only analysers (no source mutation):
  * integrity  — AST-compile every backend .py (corruption detection) + sha256
                 baseline drift.
  * duplication — sliding-window clone detection on backend Python.
  * suspicious  — risky patterns (eval/exec/os.system/shell=True, hardcoded
                 secrets/API keys, background timers).
  * maps_guard  — Google Maps usage audit (loaders, billable REST calls,
                 polling-in-interval, hardcoded keys) to prevent runaway bills.

Plus an on-demand REAL coverage runner (pytest --cov) executed in the
background, persisting the last result in Mongo.
"""
import ast
import asyncio
import hashlib
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from core.config import db

BACKEND_ROOT = Path(__file__).resolve().parent.parent          # /app/backend
FRONTEND_SRC = BACKEND_ROOT.parent / "frontend" / "src"        # /app/frontend/src
FRONTEND_INDEX = BACKEND_ROOT.parent / "frontend" / "public" / "index.html"

SKIP_DIRS = {"__pycache__", ".venv", "venv", "node_modules", ".git", ".pytest_cache", "build", "dist"}
# These files contain the audit pattern strings themselves → never self-flag.
SELF_EXCLUDE = {"core/code_audit.py", "routes/code_health.py"}

COVERAGE_TIMEOUT = 180  # seconds (unit-only scope completes in ~20s)
_COV_JSON = "/tmp/cov_health.json"
# E2e tests hit the live preview over the network (slow + flaky). The real
# coverage run targets pure-unit tests only (direct function calls), which run
# in seconds and yield an honest executed-coverage number.
_NETWORK_RE = re.compile(
    r"requests\.(get|post|put|delete)|REACT_APP_BACKEND_URL|httpx|http://localhost|preview\.emergentagent")


def _unit_test_files() -> list:
    tests_dir = BACKEND_ROOT / "tests"
    unit = []
    for p in sorted(tests_dir.glob("test_*.py")):
        if not _NETWORK_RE.search(_read(p)):
            unit.append(str(p.relative_to(BACKEND_ROOT)))
    return unit


# ----------------------------------------------------------------------------- helpers
def _iter_py(root: Path):
    for path in root.rglob("*.py"):
        if any(p in SKIP_DIRS for p in path.parts):
            continue
        yield path


def _iter_frontend():
    if not FRONTEND_SRC.exists():
        return
    for path in FRONTEND_SRC.rglob("*"):
        if path.suffix.lower() not in (".js", ".jsx", ".ts", ".tsx"):
            continue
        if any(p in SKIP_DIRS for p in path.parts):
            continue
        yield path
    if FRONTEND_INDEX.exists():
        yield FRONTEND_INDEX


def _rel_backend(path: Path) -> str:
    return str(path.relative_to(BACKEND_ROOT))


def _rel_frontend(path: Path) -> str:
    try:
        return "frontend/src/" + str(path.relative_to(FRONTEND_SRC))
    except ValueError:
        return "frontend/public/" + path.name


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""


# ----------------------------------------------------------------------------- integrity
async def compute_integrity() -> dict:
    broken, hashes = [], {}
    checked = 0
    for path in _iter_py(BACKEND_ROOT):
        rel = _rel_backend(path)
        src = _read(path)
        checked += 1
        hashes[rel] = hashlib.sha256(src.encode("utf-8", "ignore")).hexdigest()
        try:
            ast.parse(src)
        except SyntaxError as e:
            broken.append({"file": rel, "line": e.lineno or 0, "error": str(e.msg)})

    baseline_doc = await db.code_integrity.find_one({"_id": "baseline"})
    baseline = (baseline_doc or {}).get("hashes") or {}
    drift = []
    if baseline:
        for rel, h in hashes.items():
            if rel not in baseline:
                drift.append({"file": rel, "status": "new"})
            elif baseline[rel] != h:
                drift.append({"file": rel, "status": "modified"})
        for rel in baseline:
            if rel not in hashes:
                drift.append({"file": rel, "status": "removed"})

    return {
        "files_checked": checked,
        "broken": broken,
        "broken_count": len(broken),
        "baseline_set": bool(baseline),
        "baseline_at": (baseline_doc or {}).get("created_at"),
        "drift": sorted(drift, key=lambda x: x["file"])[:100],
        "drift_count": len(drift),
        "_hashes": hashes,  # consumed by set_baseline; stripped before API return
    }


async def set_integrity_baseline() -> dict:
    info = await compute_integrity()
    now = datetime.now(timezone.utc).isoformat()
    await db.code_integrity.update_one(
        {"_id": "baseline"},
        {"$set": {"hashes": info["_hashes"], "created_at": now,
                  "files": info["files_checked"]}},
        upsert=True,
    )
    return {"files": info["files_checked"], "created_at": now}


# ----------------------------------------------------------------------------- duplication
_WIN = 6  # significant lines per clone window


def _significant_lines(src: str):
    out = []
    for i, raw in enumerate(src.splitlines(), start=1):
        s = raw.strip()
        if len(s) < 8:
            continue
        if s.startswith(("#", "import ", "from ", '"""', "'''", "*", "//")):
            continue
        out.append((i, s))
    return out


def compute_duplication() -> dict:
    buckets = {}
    total_windows = 0
    for path in _iter_py(BACKEND_ROOT):
        rel = _rel_backend(path)
        sig = _significant_lines(_read(path))
        # non-overlapping windows to limit noise
        for start in range(0, len(sig) - _WIN + 1, _WIN):
            window = sig[start:start + _WIN]
            joined = "\n".join(w[1] for w in window)
            h = hashlib.sha1(joined.encode("utf-8", "ignore")).hexdigest()
            total_windows += 1
            buckets.setdefault(h, {"snippet": window[0][1][:90], "locations": []})
            buckets[h]["locations"].append({"file": rel, "line": window[0][0]})

    clusters = [b for b in buckets.values() if len(b["locations"]) >= 2]
    clusters.sort(key=lambda b: len(b["locations"]), reverse=True)
    clone_lines = sum(len(c["locations"]) * _WIN for c in clusters)
    ratio = round(100.0 * clone_lines / max(1, total_windows * _WIN), 1)
    return {
        "clusters_count": len(clusters),
        "duplicated_blocks": sum(len(c["locations"]) for c in clusters),
        "duplication_ratio": ratio,
        "window_lines": _WIN,
        "top": [{"snippet": c["snippet"], "count": len(c["locations"]),
                 "locations": c["locations"][:8]} for c in clusters[:25]],
    }


# ----------------------------------------------------------------------------- suspicious
_SUSPICIOUS = [
    ("eval(",                       "eval()",                         "high"),
    ("exec(",                       "exec()",                         "high"),
    ("os.system(",                  "os.system()",                    "high"),
    ("shell=True",                  "subprocess shell=True",          "high"),
    ("pickle.loads(",               "pickle.loads (désérialisation)", "medium"),
    ("__import__(",                 "import dynamique",               "medium"),
]
_SECRET_RES = [
    (re.compile(r"sk_live_[0-9A-Za-z]{16,}"),          "Clé Stripe LIVE en dur",      "high"),
    (re.compile(r"AKIA[0-9A-Z]{16}"),                  "Clé AWS en dur",              "high"),
    (re.compile(r"AIza[0-9A-Za-z\-_]{35}"),            "Clé API Google en dur",       "high"),
    (re.compile(r"(?i)(password|secret|api_?key|token)\s*[:=]\s*['\"][^'\"\s]{12,}['\"]"),
     "Secret potentiel en dur", "medium"),
]


def compute_suspicious() -> dict:
    findings = []
    # backend python
    for path in _iter_py(BACKEND_ROOT):
        rel = _rel_backend(path)
        if rel in SELF_EXCLUDE or rel.startswith("tests/"):
            continue
        for ln, raw in enumerate(_read(path).splitlines(), start=1):
            for needle, label, sev in _SUSPICIOUS:
                if needle in raw:
                    findings.append({"file": rel, "line": ln, "issue": label,
                                     "severity": sev, "snippet": raw.strip()[:120]})
            for rx, label, sev in _SECRET_RES:
                if rx.search(raw):
                    findings.append({"file": rel, "line": ln, "issue": label,
                                     "severity": sev, "snippet": raw.strip()[:80]})
    # frontend secrets only (eval rare / framework noise otherwise)
    for path in _iter_frontend():
        rel = _rel_frontend(path)
        for ln, raw in enumerate(_read(path).splitlines(), start=1):
            for rx, label, sev in _SECRET_RES:
                if rx.search(raw):
                    findings.append({"file": rel, "line": ln, "issue": label,
                                     "severity": sev, "snippet": raw.strip()[:80]})

    sev_rank = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda f: (sev_rank.get(f["severity"], 3), f["file"]))
    return {
        "count": len(findings),
        "high": sum(1 for f in findings if f["severity"] == "high"),
        "medium": sum(1 for f in findings if f["severity"] == "medium"),
        "findings": findings[:200],
    }


async def scan_security() -> dict:
    integrity = await compute_integrity()
    integrity.pop("_hashes", None)
    return {
        "integrity": integrity,
        "duplication": compute_duplication(),
        "suspicious": compute_suspicious(),
    }


# ----------------------------------------------------------------------------- maps guard
_MAPS_REST = [
    (re.compile(r"maps/api/geocode"),        "Geocoding"),
    (re.compile(r"maps/api/directions"),     "Directions"),
    (re.compile(r"maps/api/distancematrix"), "Distance Matrix"),
    (re.compile(r"maps/api/place"),          "Places (REST)"),
    (re.compile(r"maps/api/staticmap"),      "Static Maps"),
]
_LOADER_RE = re.compile(r"useJsApiLoader\s*\(|<LoadScript|googleMapsApiKey\s*[:=]|loadGoogleMapsScript|maps/api/js")
_KEY_IN_URL_RE = re.compile(r"key=\$?\{?[^&}\s\"']*(GKEY|API_?KEY|GOOGLE)")
_INTERVAL_RE = re.compile(r"setInterval\s*\(")


def scan_maps_guard() -> dict:
    loaders = []          # every place that could spin up a Maps JS loader
    rest_sites = {}       # api -> list of sites
    static_sites = []
    risks = []
    files_touching = set()

    for path in _iter_frontend():
        rel = _rel_frontend(path)
        if rel.replace("frontend/src/", "") in ("lib/googleMaps.js",):
            canonical = True
        else:
            canonical = False
        text = _read(path)
        lines = text.splitlines()
        has_interval = any(_INTERVAL_RE.search(ln) for ln in lines)
        touches_maps = False

        for ln, raw in enumerate(lines, start=1):
            if _LOADER_RE.search(raw):
                touches_maps = True
                loaders.append({"file": rel, "line": ln, "snippet": raw.strip()[:110], "canonical": canonical})
                # A loader that hardcodes its own key/options outside the shared
                # GMAPS_LOADER_OPTIONS is the #1 cause of double-billing.
                if ("googleMapsApiKey" in raw) and not canonical:
                    risks.append({"type": "loader_non_canonique", "severity": "high", "file": rel,
                                  "line": ln, "detail": "Loader Maps avec clé hors GMAPS_LOADER_OPTIONS (risque de double chargement → double facturation)."})
            for rx, api in _MAPS_REST:
                if rx.search(raw):
                    touches_maps = True
                    rest_sites.setdefault(api, []).append({"file": rel, "line": ln})
                    if api == "Static Maps":
                        static_sites.append({"file": rel, "line": ln})
            if _KEY_IN_URL_RE.search(raw):
                touches_maps = True

        if touches_maps:
            files_touching.add(rel)
            # Billable Maps/Places call inside a polling interval = runaway cost.
            if has_interval and any(rx.search(text) for rx, _ in _MAPS_REST):
                risks.append({"type": "appel_maps_en_intervalle", "severity": "medium", "file": rel,
                              "line": 0, "detail": "Appel Google Maps/Places dans un fichier avec setInterval (boucle de fond potentiellement facturée — à vérifier)."})

    # Multiple distinct loader call-sites → flag (the canonical lib should be the only one).
    non_canonical_loaders = [l for l in loaders if not l["canonical"]]
    if len(non_canonical_loaders) > 0:
        # consumers using useJsApiLoader with the shared options are fine; we only
        # warn when a loader hardcodes a key (handled above). Still surface the count.
        pass

    rest_usage = [{"api": api, "count": len(sites), "sites": sites[:10]}
                  for api, sites in sorted(rest_sites.items(), key=lambda kv: -len(kv[1]))]
    high_risks = [r for r in risks if r["severity"] == "high"]
    return {
        "files_touching_maps": len(files_touching),
        "loaders_count": len(loaders),
        "loaders": loaders[:40],
        "rest_usage": rest_usage,
        "rest_calls_total": sum(len(v) for v in rest_sites.values()),
        "static_map_sites": len(static_sites),
        "risks": risks[:60],
        "risks_count": len(risks),
        "high_risks_count": len(high_risks),
        "status": "danger" if high_risks else ("warn" if risks else "ok"),
    }


# ----------------------------------------------------------------------------- real coverage
async def _run_coverage_task(run_id: str):
    started = time.time()
    unit_files = _unit_test_files()
    targets = unit_files if unit_files else ["tests/"]
    cmd = [sys.executable, "-m", "pytest", *targets,
           "--cov=routes", "--cov=core",
           f"--cov-report=json:{_COV_JSON}",
           "-q", "--continue-on-collection-errors", "-p", "no:cacheprovider",
           "--timeout=15", "--timeout-method=signal"]
    try:
        Path(_COV_JSON).unlink(missing_ok=True)
        proc = await asyncio.create_subprocess_exec(
            *cmd, cwd=str(BACKEND_ROOT),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        try:
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=COVERAGE_TIMEOUT)
        except asyncio.TimeoutError:
            proc.kill()
            await db.code_health_runs.update_one(
                {"_id": run_id}, {"$set": {"status": "timeout",
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    "duration_sec": round(time.time() - started, 1)}})
            return
        tail = (out or b"").decode("utf-8", "ignore")[-1500:]
        m = re.search(r"(\d+) passed", tail)
        passed = int(m.group(1)) if m else None
        m = re.search(r"(\d+) failed", tail)
        failed = int(m.group(1)) if m else 0
        percent = covered = statements = None
        try:
            cov = json.loads(Path(_COV_JSON).read_text())
            percent = round(float(cov["totals"]["percent_covered"]), 1)
            covered = cov["totals"]["covered_lines"]
            statements = cov["totals"]["num_statements"]
        except (OSError, ValueError, KeyError):
            pass
        await db.code_health_runs.update_one(
            {"_id": run_id},
            {"$set": {
                "status": "done" if percent is not None else "failed",
                "percent": percent,
                "covered_lines": covered,
                "num_statements": statements,
                "scope": "unit",
                "files_run": len(unit_files),
                "tests_passed": passed,
                "tests_failed": failed,
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "duration_sec": round(time.time() - started, 1),
                "log_tail": tail[-800:],
            }})
    except Exception as e:  # noqa: BLE001 - record any launcher failure
        await db.code_health_runs.update_one(
            {"_id": run_id}, {"$set": {"status": "error", "error": str(e)[:300],
                "finished_at": datetime.now(timezone.utc).isoformat()}})


async def start_coverage_run() -> dict:
    existing = await db.code_health_runs.find_one({"_id": "latest"})
    if existing and existing.get("status") == "running" and not _is_stale(existing):
        return {"status": "running", "already": True, "started_at": existing.get("started_at")}
    now = datetime.now(timezone.utc).isoformat()
    await db.code_health_runs.update_one(
        {"_id": "latest"},
        {"$set": {"status": "running", "started_at": now, "percent": None,
                  "tests_passed": None, "tests_failed": None, "finished_at": None}},
        upsert=True,
    )
    asyncio.create_task(_run_coverage_task("latest"))
    return {"status": "running", "started_at": now}


def _is_stale(doc: dict) -> bool:
    """A 'running' doc whose start is older than the timeout (+buffer) is orphaned
    — e.g. the backend hot-reloaded mid-run and killed the background task."""
    started = doc.get("started_at")
    if not started:
        return True
    try:
        s = datetime.fromisoformat(str(started).replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - s).total_seconds() > COVERAGE_TIMEOUT + 30
    except (ValueError, TypeError):
        return True


async def get_coverage_run() -> dict:
    doc = await db.code_health_runs.find_one({"_id": "latest"}, {"_id": 0})
    if not doc:
        return {"status": "never"}
    if doc.get("status") == "running" and _is_stale(doc):
        await db.code_health_runs.update_one(
            {"_id": "latest"}, {"$set": {"status": "stale"}})
        doc["status"] = "stale"
    return doc
