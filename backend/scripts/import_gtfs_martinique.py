#!/usr/bin/env python3
"""
Import GTFS Martinique → base de l'application SB Drive VTC.

Source : données publiques GTFS de transport.data.gouv.fr (PAS Navitia).
Réseaux importés :
  - Centre / CACEM (bus + TCSP « Mozaïk »)   slug: gtfs-urbain-de-la-zone-centre
  - Réseau maritime (navettes)               slug: gtfs-du-reseau-maritime-de-martinique
  - Nord / CAP NORD (bus)                     slug: gtfs-urbain-de-la-zone-nord-cap-nord

Collections alimentées :
  transport_stops (source='gtfs'), transport_routes, transport_trips,
  transport_stop_times, transport_calendar, transport_calendar_dates

Idempotent : chaque réseau (feed) est purgé puis réinséré. Résout
automatiquement la dernière version du ZIP via l'API datasets (par slug).

Usage : python -m scripts.import_gtfs_martinique  [--feeds centre,maritime,nord]
"""
import csv
import io
import os
import sys
import time
import zipfile
import argparse
from datetime import datetime, timezone

import requests
from pymongo import MongoClient, ASCENDING

DATASETS_API = "https://transport.data.gouv.fr/api/datasets"
META_ID = "gtfs_martinique"
REFRESH_INTERVAL_DAYS = 7

FEEDS = {
    "centre":   {"slug": "gtfs-urbain-de-la-zone-centre",            "label": "Centre / CACEM (bus + TCSP)", "default_mode": "bus"},
    "maritime": {"slug": "gtfs-du-reseau-maritime-de-martinique",    "label": "Réseau maritime (navettes)",  "default_mode": "ferry"},
    "nord":     {"slug": "gtfs-urbain-de-la-zone-nord-cap-nord",     "label": "Nord / CAP NORD (bus)",        "default_mode": "bus"},
}

BATCH = 5000


def _db():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    return MongoClient(mongo_url)[db_name]


def _resolve_gtfs_url(slug):
    """Find the latest GTFS resource download URL for a dataset slug."""
    r = requests.get(DATASETS_API, timeout=60)
    r.raise_for_status()
    for ds in r.json():
        if ds.get("slug") == slug:
            for res in ds.get("resources", []):
                if (res.get("format") or "").upper() == "GTFS":
                    return res.get("original_url") or res.get("url")
    return None


def _read_csv(zf, name):
    """Yield dict rows from a GTFS .txt file inside the zip (utf-8-sig safe)."""
    if name not in zf.namelist():
        return
    with zf.open(name) as fh:
        text = io.TextIOWrapper(fh, encoding="utf-8-sig", newline="")
        for row in csv.DictReader(text):
            yield row


def _to_sec(hhmmss):
    try:
        h, m, s = (hhmmss or "").split(":")
        return int(h) * 3600 + int(m) * 60 + int(s)
    except Exception:
        return None


def _flt(v):
    try:
        return float(v)
    except Exception:
        return None


def _int(v, d=0):
    try:
        return int(v)
    except Exception:
        return d


def import_feed(db, feed_key):
    cfg = FEEDS[feed_key]
    feed = f"mq-{feed_key}"
    print(f"\n=== {cfg['label']}  (feed={feed}) ===", flush=True)

    url = _resolve_gtfs_url(cfg["slug"])
    if not url:
        print(f"  !! URL GTFS introuvable pour slug {cfg['slug']} — ignoré", flush=True)
        return
    print(f"  Téléchargement: {url}", flush=True)
    data = requests.get(url, timeout=180).content
    zf = zipfile.ZipFile(io.BytesIO(data))

    # purge previous docs for this feed (idempotent)
    for coll in ("transport_stops", "transport_routes", "transport_trips",
                 "transport_stop_times", "transport_calendar", "transport_calendar_dates"):
        db[coll].delete_many({"feed": feed})

    # ── stops ──
    stops = []
    for r in _read_csv(zf, "stops.txt"):
        loc_type = (r.get("location_type") or "").strip()
        if loc_type not in ("", "0"):
            continue  # keep boardable stops only (skip stations/entrances)
        lat, lng = _flt(r.get("stop_lat")), _flt(r.get("stop_lon"))
        if lat is None or lng is None:
            continue
        sid = (r.get("stop_id") or "").strip()
        stops.append({
            "id": f"{feed}:{sid}", "source": "gtfs", "feed": feed, "stop_id": sid,
            "name": (r.get("stop_name") or "").strip(),
            "code": (r.get("stop_code") or "").strip(),
            "lat": lat, "lng": lng, "type": cfg["default_mode"],
            "zone": "Martinique", "is_active": True,
        })
    if stops:
        db.transport_stops.insert_many(stops)
    print(f"  stops: {len(stops)}", flush=True)

    # ── routes ──
    routes = []
    for r in _read_csv(zf, "routes.txt"):
        rid = (r.get("route_id") or "").strip()
        routes.append({
            "id": f"{feed}:{rid}", "feed": feed, "route_id": rid,
            "short_name": (r.get("route_short_name") or "").strip(),
            "long_name": (r.get("route_long_name") or "").strip(),
            "route_type": _int(r.get("route_type"), 3),
            "color": (r.get("route_color") or "").strip(),
            "text_color": (r.get("route_text_color") or "").strip(),
            "agency_id": (r.get("agency_id") or "").strip(),
        })
    if routes:
        db.transport_routes.insert_many(routes)
    print(f"  routes: {len(routes)}", flush=True)

    # ── trips ──
    trips = []
    for r in _read_csv(zf, "trips.txt"):
        trips.append({
            "feed": feed, "trip_id": (r.get("trip_id") or "").strip(),
            "route_id": (r.get("route_id") or "").strip(),
            "service_id": (r.get("service_id") or "").strip(),
            "headsign": (r.get("trip_headsign") or "").strip(),
            "direction_id": (r.get("direction_id") or "").strip(),
        })
        if len(trips) >= BATCH:
            db.transport_trips.insert_many(trips); trips = []
    if trips:
        db.transport_trips.insert_many(trips)
    n_trips = db.transport_trips.count_documents({"feed": feed})
    print(f"  trips: {n_trips}", flush=True)

    # ── stop_times ── (largest table)
    st_batch = []
    n_st = 0
    for r in _read_csv(zf, "stop_times.txt"):
        dep_sec = _to_sec(r.get("departure_time") or r.get("arrival_time"))
        if dep_sec is None:
            continue
        st_batch.append({
            "feed": feed, "trip_id": (r.get("trip_id") or "").strip(),
            "stop_id": (r.get("stop_id") or "").strip(),
            "departure_time": (r.get("departure_time") or "").strip(),
            "dep_sec": dep_sec, "stop_sequence": _int(r.get("stop_sequence")),
        })
        if len(st_batch) >= BATCH:
            db.transport_stop_times.insert_many(st_batch); n_st += len(st_batch); st_batch = []
    if st_batch:
        db.transport_stop_times.insert_many(st_batch); n_st += len(st_batch)
    print(f"  stop_times: {n_st}", flush=True)

    # ── calendar ──
    days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    cal = []
    for r in _read_csv(zf, "calendar.txt"):
        doc = {"feed": feed, "service_id": (r.get("service_id") or "").strip(),
               "start_date": (r.get("start_date") or "").strip(),
               "end_date": (r.get("end_date") or "").strip()}
        for d in days:
            doc[d] = _int(r.get(d))
        cal.append(doc)
    if cal:
        db.transport_calendar.insert_many(cal)
    print(f"  calendar: {len(cal)}", flush=True)

    # ── calendar_dates ──
    cd = []
    for r in _read_csv(zf, "calendar_dates.txt"):
        cd.append({"feed": feed, "service_id": (r.get("service_id") or "").strip(),
                   "date": (r.get("date") or "").strip(),
                   "exception_type": _int(r.get("exception_type"))})
    if cd:
        db.transport_calendar_dates.insert_many(cd)
    print(f"  calendar_dates: {len(cd)}", flush=True)

    return {
        "stops": len(stops), "routes": len(routes), "trips": n_trips,
        "stop_times": n_st, "calendar": len(cal), "calendar_dates": len(cd),
    }


def ensure_indexes(db):
    db.transport_stops.create_index([("source", ASCENDING), ("is_active", ASCENDING)])
    db.transport_stops.create_index([("feed", ASCENDING), ("stop_id", ASCENDING)])
    db.transport_stop_times.create_index([("feed", ASCENDING), ("stop_id", ASCENDING), ("dep_sec", ASCENDING)])
    db.transport_trips.create_index([("feed", ASCENDING), ("trip_id", ASCENDING)])
    db.transport_routes.create_index([("feed", ASCENDING), ("route_id", ASCENDING)])
    db.transport_calendar.create_index([("feed", ASCENDING)])
    db.transport_calendar_dates.create_index([("feed", ASCENDING), ("date", ASCENDING)])


def cleanup_mock_fdf(db):
    """Remove the old simulated Fort-de-France network (replaced by real GTFS)."""
    res_s = db.transport_stops.delete_many({"id": {"$regex": "^fdf_"}})
    res_l = db.transport_lines.delete_many({"code": {"$in": ["A", "M2"]}, "operator": {"$regex": "Moza"}})
    print(f"\nCleanup mock Fort-de-France: stops={res_s.deleted_count} lines={res_l.deleted_count}", flush=True)


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def get_status(db):
    """Return the stored GTFS import metadata (last import, per-feed versions)."""
    meta = db.transport_meta.find_one({"id": META_ID}, {"_id": 0}) or {}
    meta.setdefault("feeds", {})
    return meta


def detect_realtime(db):
    """Watch transport.data.gouv.fr for a GTFS-RT feed on the Martinique networks.

    When a GTFS-RT resource appears for a network, its URL is AUTO-ACTIVATED
    (written to realtime_urls) and a detection alert is recorded for the admin
    dashboard (no external dependency). Returns the list of newly detected feeds.
    """
    meta = db.transport_meta.find_one({"id": META_ID}) or {"id": META_ID}
    rt_urls = dict(meta.get("realtime_urls") or {})
    detections = list(meta.get("rt_detections") or [])
    known = {d.get("url") for d in detections}
    newly = []
    try:
        datasets = requests.get(DATASETS_API, timeout=60).json()
    except Exception as e:
        print(f"  !! veille GTFS-RT: {e}", flush=True)
        return []
    by_slug = {ds.get("slug"): ds for ds in datasets}
    for fk, cfg in FEEDS.items():
        feed = f"mq-{fk}"
        ds = by_slug.get(cfg["slug"])
        if not ds:
            continue
        for r in ds.get("resources", []):
            fmt = (r.get("format") or "").lower()
            title = (r.get("title") or "")
            is_rt = ("gtfs-rt" in fmt) or (fmt in ("gtfs rt", "gtfsrt")) or ("gtfs-rt" in title.lower())
            if not is_rt:
                continue
            url = r.get("original_url") or r.get("url")
            if not url:
                continue
            rt_urls[feed] = url           # auto-activate
            if url not in known:
                newly.append({"feed": feed, "label": cfg["label"], "url": url,
                              "title": title, "detected_at": _now_iso(),
                              "auto_activated": True, "acknowledged": False})
                known.add(url)
    if newly:
        detections = newly + detections
        db.transport_meta.update_one(
            {"id": META_ID},
            {"$set": {"realtime_urls": rt_urls, "rt_detections": detections[:50]}},
            upsert=True,
        )
        print(f"  ⚡ GTFS-RT détecté & activé: {[d['feed'] for d in newly]}", flush=True)
    return newly


def refresh(db, feeds=None, force=False):
    """Refresh GTFS feeds, re-importing ONLY those whose published version (URL)
    changed since the last import (unless force=True). Records metadata so a
    weekly scheduler can keep schedules up to date with transport.data.gouv.fr.
    """
    feeds = feeds or list(FEEDS)
    meta = db.transport_meta.find_one({"id": META_ID}) or {"id": META_ID, "feeds": {}}
    feeds_meta = meta.get("feeds", {})
    changed = []
    for fk in feeds:
        cfg = FEEDS[fk]
        feed = f"mq-{fk}"
        try:
            url = _resolve_gtfs_url(cfg["slug"])
        except Exception as e:
            print(f"  !! résolution URL {fk}: {e}", flush=True)
            continue
        if not url:
            continue
        has_data = db.transport_stops.count_documents({"feed": feed}) > 0
        if not force and feeds_meta.get(feed, {}).get("url") == url and has_data:
            print(f"  = {feed}: déjà à jour (version inchangée)", flush=True)
            continue
        counts = import_feed(db, fk)
        feeds_meta[feed] = {"url": url, "label": cfg["label"],
                            "imported_at": _now_iso(), **(counts or {})}
        changed.append(feed)
    ensure_indexes(db)
    if changed:
        cleanup_mock_fdf(db)
    meta["feeds"] = feeds_meta
    meta["last_check_at"] = _now_iso()
    if changed:
        meta["last_import_at"] = _now_iso()
    meta["last_changed"] = changed
    db.transport_meta.update_one({"id": META_ID}, {"$set": meta}, upsert=True)
    return {"changed": changed, "last_import_at": meta.get("last_import_at"),
            "last_check_at": meta["last_check_at"], "feeds": feeds_meta}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--feeds", default="centre,maritime,nord")
    ap.add_argument("--force", action="store_true", default=True,
                    help="forcer la réimportation (par défaut en CLI)")
    args = ap.parse_args()
    feeds = [f.strip() for f in args.feeds.split(",") if f.strip() in FEEDS]

    db = _db()
    t0 = time.time()
    result = refresh(db, feeds, force=args.force)
    print(f"\n✅ Import GTFS Martinique terminé en {time.time()-t0:.1f}s "
          f"(réseaux mis à jour: {', '.join(result['changed']) or 'aucun'})", flush=True)


if __name__ == "__main__":
    sys.exit(main())
