import uuid
import re
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import db
from security import require_roles, SUPER_ADMIN, SUB_ADMIN, hash_password, normalize_phone, audit_log

router = APIRouter(prefix="/api/tenants", tags=["tenants"])
SUBDOMAIN_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$")


class TenantCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    subdomain: str = Field(min_length=2, max_length=32)
    admin_name: str = Field(min_length=2, max_length=100)
    admin_email: str = Field(min_length=5, max_length=160)
    admin_password: str = Field(min_length=8, max_length=128)
    whatsapp_number: str = Field(min_length=8, max_length=20)
    wifi_name: Optional[str] = Field(default=None, max_length=100)


class TenantUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    wifi_name: Optional[str] = Field(default=None, max_length=100)
    whatsapp_number: Optional[str] = Field(default=None, min_length=8, max_length=20)
    status: Optional[str] = None


def clean_subdomain(value: str) -> str:
    sub = value.strip().lower()
    if not SUBDOMAIN_RE.fullmatch(sub):
        raise HTTPException(status_code=400, detail="Subdomain hanya boleh huruf kecil, angka, dan tanda -")
    if sub in {"www", "app", "api", "admin", "default"}:
        raise HTTPException(status_code=400, detail="Subdomain tersebut tidak dapat digunakan")
    return sub


@router.get("")
async def list_tenants(user: dict = Depends(require_roles(SUPER_ADMIN))):
    docs = await db.tenants.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for tenant in docs:
        tenant["sub_admin_count"] = await db.users.count_documents({
            "tenant_id": tenant["id"], "role": SUB_ADMIN
        })
    return docs


@router.post("")
async def create_tenant(body: TenantCreate, user: dict = Depends(require_roles(SUPER_ADMIN))):
    sub = clean_subdomain(body.subdomain)
    email = body.admin_email.lower().strip()
    # Tenant yang dibuat dari panel Super Admin juga harus memiliki username,
    # karena seluruh akun Sub-Admin dapat login memakai username.
    username = email.split("@", 1)[0].strip().lower()
    username = re.sub(r"[^a-z0-9._-]+", "-", username).strip(".-_")
    if len(username) < 3:
        username = "subadmin"
    if await db.tenants.find_one({"subdomain": sub}):
        raise HTTPException(status_code=409, detail="Subdomain sudah digunakan")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email admin sudah digunakan")
    if await db.users.find_one({"username": username}):
        base = username[:45]
        suffix = 2
        while await db.users.find_one({"username": f"{base}{suffix}"}):
            suffix += 1
        username = f"{base}{suffix}"
    try:
        phone = normalize_phone(body.whatsapp_number)
    except ValueError:
        raise HTTPException(status_code=400, detail="Nomor WhatsApp tidak valid")

    now = datetime.now(timezone.utc).isoformat()
    tenant_id = str(uuid.uuid4())
    tenant = {
        "id": tenant_id, "name": body.name.strip(), "subdomain": sub,
        "is_default": False, "status": "ACTIVE", "logo_url": None,
        "wifi_name": (body.wifi_name or body.name).strip(),
        "website_title": "Internet Fiber Cepat & Stabil",
        "description": "Cek ketersediaan jaringan di lokasi Anda.",
        "primary_color": "#6D28D9", "whatsapp_number": phone,
        "created_at": now, "updated_at": now,
    }
    admin = {
        "id": str(uuid.uuid4()), "email": email, "username": username,
        "password_hash": hash_password(body.admin_password),
        "name": body.admin_name.strip(), "role": SUB_ADMIN,
        "tenant_id": tenant_id, "created_at": now,
    }
    subscription = {
        "id": str(uuid.uuid4()), "tenant_id": tenant_id,
        "plan_id": None, "plan_name": None, "status": "NOT_CONFIGURED",
        "started_at": None, "expires_at": None, "notes": None,
        "created_at": now, "updated_at": now,
    }
    await db.tenants.insert_one(tenant)
    try:
        await db.users.insert_one(admin)
        await db.subscriptions.insert_one(subscription)
    except Exception:
        await db.users.delete_one({"id": admin["id"]})
        await db.subscriptions.delete_one({"id": subscription["id"]})
        await db.tenants.delete_one({"id": tenant_id})
        raise HTTPException(status_code=500, detail="Gagal membuat akun SubAdmin atau subscription")
    await audit_log(user["tenant_id"], user["id"], "TENANT_CREATE",
                    {"tenant_id": tenant_id, "subdomain": sub})
    tenant.pop("_id", None)
    return tenant


@router.delete("/{tenant_id}")
async def delete_tenant(tenant_id: str, user: dict = Depends(require_roles(SUPER_ADMIN))):
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant tidak ditemukan")
    if tenant.get("is_default"):
        raise HTTPException(status_code=400, detail="Tenant default tidak dapat dihapus")

    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": user["tenant_id"], "user_id": user["id"],
        "action": "TENANT_DELETE", "meta": {"deleted_tenant_id": tenant_id, "subdomain": tenant.get("subdomain")},
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.coverage_geometries.delete_many({"tenant_id": tenant_id})
    await db.coverage_files.delete_many({"tenant_id": tenant_id})
    await db.leads.delete_many({"tenant_id": tenant_id})
    await db.internet_packages.delete_many({"tenant_id": tenant_id})
    await db.subscriptions.delete_many({"tenant_id": tenant_id})
    await db.users.delete_many({"tenant_id": tenant_id})
    await db.audit_logs.delete_many({"tenant_id": tenant_id})
    await db.tenants.delete_one({"id": tenant_id})
    return {"ok": True, "deleted_tenant_id": tenant_id}


@router.put("/{tenant_id}")
async def update_tenant(tenant_id: str, body: TenantUpdate,
                        user: dict = Depends(require_roles(SUPER_ADMIN))):
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant tidak ditemukan")
    if tenant.get("is_default") and body.status == "LOCKED":
        raise HTTPException(status_code=400, detail="Tenant default tidak dapat dinonaktifkan")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "status" in updates and updates["status"] not in {"ACTIVE", "LOCKED"}:
        raise HTTPException(status_code=400, detail="Status tenant tidak valid")
    if "whatsapp_number" in updates:
        try:
            updates["whatsapp_number"] = normalize_phone(updates["whatsapp_number"])
        except ValueError:
            raise HTTPException(status_code=400, detail="Nomor WhatsApp tidak valid")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.tenants.update_one({"id": tenant_id}, {"$set": updates})
    await audit_log(user["tenant_id"], user["id"], "TENANT_UPDATE",
                    {"tenant_id": tenant_id, "fields": list(updates.keys())})
    return await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
