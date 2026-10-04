import asyncio
import logging
import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from database import db
from gis_service import parse_bytes

logger = logging.getLogger("coverage")
COVERAGE_TOLERANCE_M = 100.0


async def _set_status(file_id, **fields):
    fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.coverage_files.update_one({"id": file_id}, {"$set": fields})


async def process_file(file_id, tenant_id, data_bytes, file_type, source_file, activate=False):
    """Parse a GIS file (in-memory bytes) and store geometries. Runs in background."""
    try:
        await _set_status(file_id, status="PROCESSING")
        geometries, extent, stats = await asyncio.to_thread(
            parse_bytes, data_bytes, file_type, source_file)
        if not geometries:
            await _set_status(file_id, status="FAILED",
                              error="Tidak ada geometri Polygon/MultiPolygon yang valid ditemukan.")
            logger.warning("GIS import produced 0 geometries for %s", source_file)
            return
        # remove any previous geometries for this file (idempotent reprocess)
        await db.coverage_geometries.delete_many({"file_id": file_id})
        now = datetime.now(timezone.utc).isoformat()
        import uuid
        batch = []
        inserted = 0
        for g in geometries:
            batch.append({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "file_id": file_id,
                "name": g["name"],
                "description": g["description"],
                "folder": g["folder"],
                "source_file": g["source_file"],
                "geometry": g["geometry"],
                "active": activate,
                "created_at": now,
            })
            if len(batch) >= 1000:
                res = await _insert_batch(batch)
                inserted += res
                batch = []
        if batch:
            inserted += await _insert_batch(batch)
        await _set_status(file_id, status="READY", geometry_count=inserted,
                          extent=extent, active=activate, error=None,
                          parse_stats=stats)
        logger.info("GIS import READY %s: %d geometries (skipped=%d)",
                    source_file, inserted, stats.get("skipped", 0))
    except Exception as e:
        logger.exception("GIS import failed for %s", source_file)
        await _set_status(file_id, status="FAILED", error=str(e)[:300])


async def _insert_batch(batch):
    try:
        res = await db.coverage_geometries.insert_many(batch, ordered=False)
        return len(res.inserted_ids)
    except Exception as e:
        # Some geometries may be rejected by 2dsphere; count successes best-effort
        details = getattr(e, "details", {}) or {}
        n = details.get("nInserted")
        if n is not None:
            return n
        logger.warning("Batch insert partial failure: %s", str(e)[:200])
        return 0


def _reverse_geocode_city_sync(lat: float, lng: float):
    """Best-effort city/kabupaten lookup from coordinates using OpenStreetMap Nominatim."""
    params = urllib.parse.urlencode({"format": "jsonv2", "lat": lat, "lon": lng, "zoom": 10})
    req = urllib.request.Request(
        f"https://nominatim.openstreetmap.org/reverse?{params}",
        headers={"User-Agent": "WifiCoverageApp/1.0"},
    )
    with urllib.request.urlopen(req, timeout=4) as response:
        data = json.loads(response.read().decode("utf-8"))
    address = data.get("address") or {}
    return (
        address.get("city")
        or address.get("town")
        or address.get("municipality")
        or address.get("county")
        or address.get("village")
    )


async def reverse_geocode_city(lat: float, lng: float):
    try:
        return await asyncio.to_thread(_reverse_geocode_city_sync, lat, lng)
    except Exception as exc:
        logger.warning("Reverse geocoding failed: %s", str(exc)[:160])
        return None


async def check_coverage(tenant_id, lat: float, lng: float):
    """Server-side coverage check using MongoDB 2dsphere $geoNear."""
    pipeline = [
        {"$geoNear": {
            "near": {"type": "Point", "coordinates": [lng, lat]},
            "distanceField": "distance",
            "spherical": True,
            "key": "geometry",
            "query": {"tenant_id": tenant_id, "active": True},
        }},
        {"$limit": 1},
        {"$project": {"_id": 0, "name": 1, "folder": 1, "distance": 1, "source_file": 1}},
    ]
    docs = await db.coverage_geometries.aggregate(pipeline).to_list(1)
    if not docs:
        return {
            "coverage_status": "NOT_COVERED",
            "distance_to_coverage": None,
            "matched_coverage_area": None,
            "city": None,
        }
    d = docs[0]
    distance = d.get("distance", 999999)
    city = await reverse_geocode_city(lat, lng)
    covered = distance <= COVERAGE_TOLERANCE_M
    return {
        "coverage_status": "COVERED" if covered else "NOT_COVERED",
        "distance_to_coverage": round(distance, 2),
        "matched_coverage_area": d.get("name") or d.get("source_file"),
        "city": city or d.get("folder"),
    }
