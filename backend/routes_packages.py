import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import BaseModel

from database import db
from security import resolve_tenant, get_current_user, require_active_subscription, audit_log

router = APIRouter(prefix="/api/packages", tags=["packages"])


class PackageBody(BaseModel):
    name: str
    speed: str
    price: float
    description: Optional[str] = ""
    active: bool = True
    display_order: int = 0


@router.get("/public")
async def public_packages(request: Request, subdomain: Optional[str] = None):
    tenant = await resolve_tenant(request, subdomain)
    docs = await db.internet_packages.find(
        {"tenant_id": tenant["id"], "active": True}, {"_id": 0}
    ).sort("display_order", 1).to_list(100)
    return docs


@router.get("")
async def list_packages(user: dict = Depends(require_active_subscription)):
    docs = await db.internet_packages.find(
        {"tenant_id": user["tenant_id"]}, {"_id": 0}
    ).sort("display_order", 1).to_list(200)
    return docs


@router.post("")
async def create_package(body: PackageBody, user: dict = Depends(require_active_subscription)):
    now = datetime.now(timezone.utc).isoformat()
    doc = {"id": str(uuid.uuid4()), "tenant_id": user["tenant_id"],
           **body.model_dump(), "created_at": now, "updated_at": now}
    await db.internet_packages.insert_one(doc)
    await audit_log(user["tenant_id"], user["id"], "PACKAGE_CREATE", {"name": body.name})
    doc.pop("_id", None)
    return doc


@router.put("/{package_id}")
async def update_package(package_id: str, body: PackageBody, user: dict = Depends(get_current_user)):
    f = await db.internet_packages.find_one({"id": package_id, "tenant_id": user["tenant_id"]})
    if not f:
        raise HTTPException(status_code=404, detail="Paket tidak ditemukan")
    updates = {**body.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.internet_packages.update_one({"id": package_id}, {"$set": updates})
    await audit_log(user["tenant_id"], user["id"], "PACKAGE_UPDATE", {"id": package_id})
    doc = await db.internet_packages.find_one({"id": package_id}, {"_id": 0})
    return doc


@router.delete("/{package_id}")
async def delete_package(package_id: str, user: dict = Depends(get_current_user)):
    f = await db.internet_packages.find_one({"id": package_id, "tenant_id": user["tenant_id"]})
    if not f:
        raise HTTPException(status_code=404, detail="Paket tidak ditemukan")
    await db.internet_packages.delete_one({"id": package_id})
    await audit_log(user["tenant_id"], user["id"], "PACKAGE_DELETE", {"id": package_id})
    return {"ok": True}
