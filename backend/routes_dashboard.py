import base64
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from database import db
from security import get_current_user, require_active_subscription, audit_log
from datetime import datetime, timezone

router = APIRouter(prefix="/api", tags=["dashboard"])

MAX_LOGO_BYTES = 2 * 1024 * 1024


@router.delete("/branding/logo")
async def delete_logo(user: dict = Depends(require_active_subscription)):
    await db.tenants.update_one(
        {"id": user["tenant_id"]},
        {"$set": {"logo_url": None, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    await audit_log(user["tenant_id"], user["id"], "LOGO_DELETE")
    return {"logo_url": None}


@router.delete("/branding/logo")
async def delete_logo(user: dict = Depends(require_active_subscription)):
    await db.tenants.update_one(
        {"id": user["tenant_id"]},
        {"$set": {"logo_url": None, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    await audit_log(user["tenant_id"], user["id"], "LOGO_DELETE")
    return {"logo_url": None}


@router.get("/dashboard")
async def dashboard(user: dict = Depends(require_active_subscription)):
    tid = user["tenant_id"]
    leads_total = await db.leads.count_documents({"tenant_id": tid})
    covered = await db.leads.count_documents({"tenant_id": tid, "coverage_status": "COVERED"})
    not_covered = await db.leads.count_documents({"tenant_id": tid, "coverage_status": "NOT_COVERED"})
    not_checked = await db.leads.count_documents({"tenant_id": tid, "coverage_status": "NOT_CHECKED"})
    packages = await db.internet_packages.count_documents({"tenant_id": tid})
    files = await db.coverage_files.count_documents({"tenant_id": tid})
    active_files = await db.coverage_files.count_documents({"tenant_id": tid, "active": True})
    geometries = await db.coverage_geometries.count_documents({"tenant_id": tid, "active": True})
    recent = await db.leads.find({"tenant_id": tid}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
    return {
        "leads_total": leads_total, "covered": covered, "not_covered": not_covered,
        "not_checked": not_checked, "packages": packages, "coverage_files": files,
        "active_files": active_files, "active_geometries": geometries, "recent_leads": recent,
    }


@router.post("/branding/logo")
async def upload_logo(file: UploadFile = File(...), user: dict = Depends(require_active_subscription)):
    data = await file.read(MAX_LOGO_BYTES + 1)
    if len(data) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=413, detail="Logo maksimal 2MB")
    ct = file.content_type or "image/png"
    if not ct.startswith("image/"):
        raise HTTPException(status_code=400, detail="File harus berupa gambar")
    data_url = f"data:{ct};base64,{base64.b64encode(data).decode('ascii')}"
    await db.tenants.update_one({"id": user["tenant_id"]}, {"$set": {
        "logo_url": data_url, "updated_at": datetime.now(timezone.utc).isoformat()}})
    await audit_log(user["tenant_id"], user["id"], "LOGO_UPDATE")
    return {"logo_url": data_url}
