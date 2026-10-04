from fastapi import APIRouter, Request, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional

from database import db
from security import resolve_tenant, get_current_user, require_active_subscription, require_roles, SUPER_ADMIN, audit_log
from datetime import datetime, timezone
import base64

router = APIRouter(prefix="/api", tags=["tenant"])


def public_tenant(t: dict) -> dict:
    return {
        "id": t["id"],
        "name": t.get("name"),
        "subdomain": t.get("subdomain"),
        "status": t.get("status"),
        "logo_url": t.get("logo_url"),
        "wifi_name": t.get("wifi_name"),
        "website_title": t.get("website_title"),
        "description": t.get("description"),
        "primary_color": t.get("primary_color"),
        "whatsapp_number": t.get("whatsapp_number"),
        "hero_image_url": t.get("hero_image_url"),
        "meta_pixel_id": t.get("meta_pixel_id"),
    }


@router.get("/tenant/me")
async def tenant_me(user: dict = Depends(require_active_subscription)):
    t = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tenant tidak ditemukan")
    if t.get("status") == "LOCKED":
        return {"status": "LOCKED", "name": t.get("name"), "message": "Halaman Non-Aktif"}
    return public_tenant(t)


@router.get("/tenant/current")
async def tenant_current(request: Request, subdomain: Optional[str] = None):
    t = await resolve_tenant(request, subdomain)
    if t.get("status") == "LOCKED":
        return {"status": "LOCKED", "name": t.get("name"), "message": "Halaman Non-Aktif"}
    return public_tenant(t)


MAX_HERO_BYTES = 5 * 1024 * 1024


@router.post("/branding/hero-image")
async def upload_hero_image(file: UploadFile = File(...), user: dict = Depends(require_active_subscription)):
    data = await file.read(MAX_HERO_BYTES + 1)
    if len(data) > MAX_HERO_BYTES:
        raise HTTPException(status_code=413, detail="Gambar hero maksimal 5MB")
    ct = file.content_type or "image/jpeg"
    if not ct.startswith("image/"):
        raise HTTPException(status_code=400, detail="File harus berupa gambar")
    data_url = f"data:{ct};base64,{base64.b64encode(data).decode('ascii')}"
    await db.tenants.update_one({"id": user["tenant_id"]}, {"$set": {
        "hero_image_url": data_url, "updated_at": datetime.now(timezone.utc).isoformat()}})
    await audit_log(user["tenant_id"], user["id"], "HERO_IMAGE_UPDATE")
    return {"hero_image_url": data_url}


class BrandingUpdate(BaseModel):
    wifi_name: Optional[str] = None
    website_title: Optional[str] = None
    description: Optional[str] = None
    primary_color: Optional[str] = None
    whatsapp_number: Optional[str] = None
    logo_url: Optional[str] = None
    meta_pixel_id: Optional[str] = None


@router.get("/branding")
async def get_branding(user: dict = Depends(require_active_subscription)):
    t = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tenant tidak ditemukan")
    return public_tenant(t)


@router.put("/branding")
async def update_branding(body: BrandingUpdate, user: dict = Depends(require_active_subscription)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "meta_pixel_id" in updates:
        value = str(updates["meta_pixel_id"]).strip()
        if value and (len(value) > 40 or not value.isdigit()):
            raise HTTPException(status_code=400, detail="Meta Pixel ID tidak valid")
        updates["meta_pixel_id"] = value or None
    if not updates:
        raise HTTPException(status_code=400, detail="Tidak ada perubahan")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.tenants.update_one({"id": user["tenant_id"]}, {"$set": updates})
    await audit_log(user["tenant_id"], user["id"], "BRANDING_UPDATE", {"fields": list(updates.keys())})
    t = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
    return public_tenant(t)


@router.get("/tenants", dependencies=[Depends(require_roles(SUPER_ADMIN))])
async def list_tenants():
    tenants = await db.tenants.find({}, {"_id": 0}).to_list(500)
    return tenants
