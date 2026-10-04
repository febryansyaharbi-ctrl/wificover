import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Request, Depends, HTTPException, UploadFile, File, BackgroundTasks
from pydantic import BaseModel

from database import db
from security import resolve_tenant, get_current_user, require_active_subscription, audit_log
from gis_service import detect_file_type
from coverage_service import process_file, check_coverage

router = APIRouter(prefix="/api/coverage", tags=["coverage"])

MAX_BYTES = 80 * 1024 * 1024
ALLOWED_EXT = ("kmz", "kml", "geojson", "json")


class CheckReq(BaseModel):
    lead_id: Optional[str] = None
    latitude: float
    longitude: float
    subdomain: Optional[str] = None


@router.post("/check")
async def coverage_check(body: CheckReq, request: Request):
    tenant = await resolve_tenant(request, body.subdomain)
    if not (-90 <= body.latitude <= 90) or not (-180 <= body.longitude <= 180):
        raise HTTPException(status_code=400, detail="Koordinat tidak valid")
    try:
        result = await check_coverage(tenant["id"], body.latitude, body.longitude)
    except Exception:
        raise HTTPException(status_code=500, detail="Terjadi kendala saat mengecek coverage. Silakan coba kembali.")
    now = datetime.now(timezone.utc).isoformat()
    if body.lead_id:
        lead = await db.leads.find_one({"id": body.lead_id})
        if lead and lead["tenant_id"] == tenant["id"]:
            await db.leads.update_one({"id": body.lead_id}, {"$set": {
                "latitude": body.latitude,
                "longitude": body.longitude,
                "coverage_status": result["coverage_status"],
                "coverage_distance": result["distance_to_coverage"],
                "city": result["city"],
                "matched_coverage_area": result["matched_coverage_area"],
                "checked_at": now,
            }})
    result.update({"latitude": body.latitude, "longitude": body.longitude})
    return result


@router.get("/public/geometries")
async def public_geometries(request: Request, subdomain: Optional[str] = None,
                            minLng: float = None, minLat: float = None,
                            maxLng: float = None, maxLat: float = None):
    """Viewport-based geometry loading for the customer map (active only)."""
    tenant = await resolve_tenant(request, subdomain)
    query = {"tenant_id": tenant["id"], "active": True}
    if None not in (minLng, minLat, maxLng, maxLat):
        query["geometry"] = {"$geoIntersects": {"$geometry": {
            "type": "Polygon",
            "coordinates": [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat],
                             [minLng, maxLat], [minLng, minLat]]],
        }}}
    docs = await db.coverage_geometries.find(
        query, {"_id": 0, "geometry": 1, "name": 1}).limit(1500).to_list(1500)
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"name": d.get("name")}, "geometry": d["geometry"]}
        for d in docs
    ]}


# ---------- Admin coverage management ----------
@router.get("")
async def list_files(user: dict = Depends(require_active_subscription)):
    files = await db.coverage_files.find(
        {"tenant_id": user["tenant_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return files


@router.post("/upload")
async def upload_file(background: BackgroundTasks, file: UploadFile = File(...),
                      user: dict = Depends(require_active_subscription)):
    filename = file.filename or "upload"
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Ukuran file melebihi batas 80MB")
    ftype = detect_file_type(filename, data[:2048])
    if ext not in ALLOWED_EXT and ftype not in ("kmz", "kml", "geojson"):
        raise HTTPException(status_code=400, detail="File tidak dapat diproses. Periksa format dan isi file.")
    file_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": file_id, "tenant_id": user["tenant_id"], "filename": filename,
        "file_type": ftype, "status": "UPLOADED", "geometry_count": 0,
        "extent": None, "active": False, "error": None,
        "created_at": now, "updated_at": now,
    }
    await db.coverage_files.insert_one(doc)
    await audit_log(user["tenant_id"], user["id"], "GIS_UPLOAD", {"filename": filename, "type": ftype})
    background.add_task(process_file, file_id, user["tenant_id"], data, ftype, filename, False)
    doc.pop("_id", None)
    return doc


@router.post("/{file_id}/activate")
async def activate_file(file_id: str, user: dict = Depends(require_active_subscription)):
    f = await db.coverage_files.find_one({"id": file_id, "tenant_id": user["tenant_id"]})
    if not f:
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    if f["status"] != "READY":
        raise HTTPException(status_code=400, detail="File belum siap diaktifkan")
    await db.coverage_files.update_one({"id": file_id}, {"$set": {"active": True}})
    await db.coverage_geometries.update_many({"file_id": file_id}, {"$set": {"active": True}})
    await audit_log(user["tenant_id"], user["id"], "GIS_ACTIVATE", {"file_id": file_id})
    return {"ok": True}


@router.post("/{file_id}/deactivate")
async def deactivate_file(file_id: str, user: dict = Depends(require_active_subscription)):
    f = await db.coverage_files.find_one({"id": file_id, "tenant_id": user["tenant_id"]})
    if not f:
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    await db.coverage_files.update_one({"id": file_id}, {"$set": {"active": False}})
    await db.coverage_geometries.update_many({"file_id": file_id}, {"$set": {"active": False}})
    await audit_log(user["tenant_id"], user["id"], "GIS_DEACTIVATE", {"file_id": file_id})
    return {"ok": True}


@router.delete("/{file_id}")
async def delete_file(file_id: str, user: dict = Depends(require_active_subscription)):
    f = await db.coverage_files.find_one({"id": file_id, "tenant_id": user["tenant_id"]})
    if not f:
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    await db.coverage_geometries.delete_many({"file_id": file_id})
    await db.coverage_files.delete_one({"id": file_id})
    await audit_log(user["tenant_id"], user["id"], "GIS_DELETE", {"file_id": file_id})
    return {"ok": True}


@router.get("/{file_id}/geometries")
async def file_geometries(file_id: str, user: dict = Depends(require_active_subscription)):
    """Preview geometries for a specific file (admin, capped)."""
    f = await db.coverage_files.find_one({"id": file_id, "tenant_id": user["tenant_id"]})
    if not f:
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    docs = await db.coverage_geometries.find(
        {"file_id": file_id}, {"_id": 0, "geometry": 1, "name": 1}).limit(1500).to_list(1500)
    return {"type": "FeatureCollection", "extent": f.get("extent"), "features": [
        {"type": "Feature", "properties": {"name": d.get("name")}, "geometry": d["geometry"]}
        for d in docs
    ]}
