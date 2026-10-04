import hashlib
import os
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from database import db
from security import normalize_phone, require_roles, SUPER_ADMIN, hash_password

router = APIRouter(prefix="/api/registration", tags=["registration"])

ACTIVATION_HOURS = 72


class RegistrationBody(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    whatsapp: str = Field(min_length=8, max_length=25)
    plan_id: str = Field(min_length=1, max_length=100)


class ActivationBody(BaseModel):
    wifi_name: str = Field(min_length=2, max_length=100)
    subdomain: str = Field(min_length=2, max_length=32)
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=128)
    email: str | None = Field(default=None, max_length=160)
    website_title: str | None = Field(default=None, max_length=160)
    description: str | None = Field(default=None, max_length=500)


def _activation_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _activation_url(token: str) -> str:
    base = os.getenv("FRONTEND_URL", "").rstrip("/")
    if not base:
        base = "http://localhost:3000"
    return f"{base}/aktivasi-admin?token={token}"


def _clean_subdomain(value: str) -> str:
    import re
    sub = value.strip().lower()
    if not re.fullmatch(r"^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$", sub):
        raise HTTPException(status_code=400, detail="Subdomain hanya boleh huruf kecil, angka, dan tanda -")
    if sub in {"www", "app", "api", "admin", "default"}:
        raise HTTPException(status_code=400, detail="Subdomain tersebut tidak dapat digunakan")
    return sub


@router.get("/plans")
async def registration_plans():
    docs = await db.subscription_plans.find(
        {"active": True},
        {"_id": 0, "id": 1, "name": 1, "price": 1, "duration_days": 1, "description": 1},
    ).sort("display_order", 1).to_list(100)
    return docs


@router.post("")
async def create_registration(body: RegistrationBody):
    name = body.name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Nama minimal 2 karakter")

    try:
        whatsapp = normalize_phone(body.whatsapp)
    except ValueError:
        raise HTTPException(status_code=400, detail="Nomor WhatsApp tidak valid")

    plan = await db.subscription_plans.find_one(
        {"id": body.plan_id, "active": True},
        {"_id": 0, "id": 1, "name": 1, "price": 1, "duration_days": 1},
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Paket subscription tidak ditemukan atau sudah tidak aktif")

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "whatsapp": whatsapp,
        "plan_id": plan["id"],
        "plan_name": plan["name"],
        "amount": plan["price"],
        "duration_days": plan["duration_days"],
        "status": "PAYMENT_REPORTED",
        "payment_reported_at": now,
        "created_at": now,
        "updated_at": now,
    }
    await db.subadmin_applications.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/payment-info/{registration_id}")
async def payment_info(registration_id: str):
    application = await db.subadmin_applications.find_one(
        {"id": registration_id},
        {"_id": 0, "id": 1, "name": 1, "whatsapp": 1, "plan_name": 1, "amount": 1, "status": 1},
    )
    if not application:
        raise HTTPException(status_code=404, detail="Nomor pendaftaran tidak ditemukan")
    if application.get("status") not in {"PENDING_PAYMENT", "PAYMENT_REPORTED"}:
        raise HTTPException(status_code=400, detail="Pendaftaran ini tidak berada pada tahap pembayaran")

    settings = await db.system_settings.find_one({"key": "payment_settings"}, {"_id": 0})
    value = (settings or {}).get("value") or {}
    return {
        **application,
        "payment": {
            "whatsapp": value.get("whatsapp", ""),
            "bank_accounts": value.get("bank_accounts", []),
            "ewallets": value.get("ewallets", []),
            "qris_image": value.get("qris_image"),
        },
    }


@router.post("/{registration_id}/confirm-payment")
async def confirm_payment(registration_id: str):
    application = await db.subadmin_applications.find_one({"id": registration_id})
    if not application:
        raise HTTPException(status_code=404, detail="Nomor pendaftaran tidak ditemukan")
    if application.get("status") == "PAYMENT_REPORTED":
        return {"status": "PAYMENT_REPORTED", "payment_reported_at": application.get("payment_reported_at")}
    if application.get("status") != "PENDING_PAYMENT":
        raise HTTPException(status_code=400, detail="Konfirmasi pembayaran sudah diproses atau tidak valid")
    now = datetime.now(timezone.utc).isoformat()
    result = await db.subadmin_applications.update_one(
        {"id": registration_id, "status": "PENDING_PAYMENT"},
        {"$set": {"status": "PAYMENT_REPORTED", "payment_reported_at": now, "updated_at": now}},
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="Status pendaftaran berubah. Silakan muat ulang halaman.")
    return {"status": "PAYMENT_REPORTED", "payment_reported_at": now}


@router.get("/admin/applications")
async def admin_applications(user: dict = Depends(require_roles(SUPER_ADMIN))):
    docs = await db.subadmin_applications.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for doc in docs:
        if doc.get("status") == "ACTIVATION_PENDING" and doc.get("activation_token"):
            expires = doc.get("activation_expires_at")
            try:
                expired = expires and datetime.fromisoformat(expires.replace("Z", "+00:00")) <= datetime.now(timezone.utc)
            except (TypeError, ValueError):
                expired = True
            if not expired:
                doc["activation_url"] = _activation_url(doc["activation_token"])
                doc["activation_expires_at"] = expires
            doc.pop("activation_token", None)
            doc.pop("activation_token_hash", None)
    return docs


@router.post("/admin/applications/bulk-delete")
async def bulk_delete_applications(body: dict, user: dict = Depends(require_roles(SUPER_ADMIN))):
    ids = body.get("ids") or []
    if not isinstance(ids, list) or not ids:
        raise HTTPException(status_code=400, detail="Pilih minimal satu pendaftaran.")
    ids = [str(x) for x in ids if x]
    result = await db.subadmin_applications.delete_many({"id": {"$in": ids}})
    return {"deleted_count": result.deleted_count}


@router.delete("/admin/applications/all")
async def delete_all_applications(user: dict = Depends(require_roles(SUPER_ADMIN))):
    result = await db.subadmin_applications.delete_many({})
    return {"deleted_count": result.deleted_count}


@router.post("/admin/applications/{registration_id}/verify")
async def verify_application(registration_id: str, user: dict = Depends(require_roles(SUPER_ADMIN))):
    application = await db.subadmin_applications.find_one({"id": registration_id})
    if not application:
        raise HTTPException(status_code=404, detail="Pendaftaran tidak ditemukan")
    if application.get("status") not in {"PAYMENT_REPORTED", "PENDING_PAYMENT"}:
        raise HTTPException(status_code=400, detail="Pendaftaran ini sudah diproses dan tidak dapat diverifikasi lagi")

    now = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(32)
    expires = now + timedelta(hours=ACTIVATION_HOURS)
    now_iso = now.isoformat()
    expires_iso = expires.isoformat()

    result = await db.subadmin_applications.update_one(
        {"id": registration_id, "status": {"$in": ["PAYMENT_REPORTED", "PENDING_PAYMENT"]}},
        {"$set": {
            "status": "ACTIVATION_PENDING",
            "payment_verified_at": now_iso,
            "verified_by": user["id"],
            "activation_token": token,
            "activation_token_hash": _activation_hash(token),
            "activation_expires_at": expires_iso,
            "updated_at": now_iso,
        }},
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="Status pendaftaran berubah. Silakan muat ulang.")
    return {
        "status": "ACTIVATION_PENDING",
        "payment_verified_at": now_iso,
        "activation_url": _activation_url(token),
        "activation_expires_at": expires_iso,
    }


@router.post("/admin/applications/{registration_id}/reject")
async def reject_application(registration_id: str, user: dict = Depends(require_roles(SUPER_ADMIN))):
    application = await db.subadmin_applications.find_one({"id": registration_id})
    if not application:
        raise HTTPException(status_code=404, detail="Pendaftaran tidak ditemukan")
    if application.get("status") not in {"PAYMENT_REPORTED", "PENDING_PAYMENT"}:
        raise HTTPException(status_code=400, detail="Pendaftaran tidak dapat ditolak pada status ini")
    now = datetime.now(timezone.utc).isoformat()
    result = await db.subadmin_applications.update_one(
        {"id": registration_id, "status": {"$in": ["PAYMENT_REPORTED", "PENDING_PAYMENT"]}},
        {"$set": {"status": "REJECTED", "rejected_at": now, "rejected_by": user["id"], "updated_at": now}},
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="Status pendaftaran berubah. Silakan muat ulang.")
    return {"status": "REJECTED", "rejected_at": now}


@router.get("/activation-info/{token}")
async def activation_info(token: str):
    if not token or len(token) < 20:
        raise HTTPException(status_code=400, detail="Link aktivasi tidak valid")
    application = await db.subadmin_applications.find_one({
        "activation_token_hash": _activation_hash(token),
        "status": "ACTIVATION_PENDING",
    }, {"_id": 0, "id": 1, "name": 1, "whatsapp": 1, "plan_name": 1, "amount": 1, "activation_expires_at": 1})
    if not application:
        raise HTTPException(status_code=404, detail="Link aktivasi tidak valid, sudah digunakan, atau sudah tidak tersedia")
    try:
        expires = datetime.fromisoformat(application["activation_expires_at"].replace("Z", "+00:00"))
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Link aktivasi tidak valid")
    if expires <= datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Link aktivasi sudah kedaluwarsa")
    return application


@router.post("/activate/{token}")
async def activate_application(token: str, body: ActivationBody):
    token_hash = _activation_hash(token)
    application = await db.subadmin_applications.find_one({
        "activation_token_hash": token_hash,
        "status": "ACTIVATION_PENDING",
    })
    if not application:
        raise HTTPException(status_code=404, detail="Link aktivasi tidak valid, sudah digunakan, atau sudah tidak tersedia")

    try:
        expires = datetime.fromisoformat(application["activation_expires_at"].replace("Z", "+00:00"))
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Link aktivasi tidak valid")
    if expires <= datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Link aktivasi sudah kedaluwarsa")

    username = body.username.strip().lower()
    if not username or not __import__("re").fullmatch(r"^[a-z0-9](?:[a-z0-9._-]{1,48}[a-z0-9])?$", username):
        raise HTTPException(status_code=400, detail="Username hanya boleh huruf kecil, angka, titik, garis bawah, dan tanda -")
    subdomain = _clean_subdomain(body.subdomain)

    if await db.users.find_one({"username": username}):
        raise HTTPException(status_code=409, detail="Username sudah digunakan. Silakan pilih username lain.")
    if await db.tenants.find_one({"subdomain": subdomain}):
        raise HTTPException(status_code=409, detail="Subdomain sudah digunakan. Silakan pilih subdomain lain.")

    email = (body.email or "").strip().lower()
    if email:
        if await db.users.find_one({"email": email}):
            raise HTTPException(status_code=409, detail="Email sudah digunakan.")
    else:
        email = f"{username}@subadmin.local"

    now = datetime.now(timezone.utc).isoformat()
    tenant_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    tenant = {
        "id": tenant_id,
        "name": application["name"],
        "subdomain": subdomain,
        "is_default": False,
        "status": "ACTIVE",
        "logo_url": None,
        "wifi_name": body.wifi_name.strip(),
        "website_title": (body.website_title or "").strip() or body.wifi_name.strip(),
        "description": (body.description or "").strip() or "Cek ketersediaan jaringan di lokasi Anda.",
        "primary_color": "#6D28D9",
        "whatsapp_number": application["whatsapp"],
        "created_at": now,
        "updated_at": now,
    }
    admin = {
        "id": user_id,
        "email": email,
        "username": username,
        "password_hash": hash_password(body.password),
        "name": application["name"],
        "role": "SUB_ADMIN",
        "tenant_id": tenant_id,
        "session_version": 0,
        "created_at": now,
    }
    subscription = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "plan_id": application["plan_id"],
        "plan_name": application["plan_name"],
        "status": "ACTIVE",
        "started_at": now,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=int(application.get("duration_days") or 30))).isoformat(),
        "notes": "Aktivasi dari pendaftaran Sub-Admin dan verifikasi pembayaran.",
        "created_at": now,
        "updated_at": now,
    }

    claimed = await db.subadmin_applications.update_one(
        {"id": application["id"], "activation_token_hash": token_hash, "status": "ACTIVATION_PENDING"},
        {"$set": {"status": "ACTIVATING", "updated_at": now}},
    )
    if claimed.modified_count != 1:
        raise HTTPException(status_code=409, detail="Link aktivasi sedang digunakan. Silakan coba lagi.")

    try:
        await db.tenants.insert_one(tenant)
        await db.users.insert_one(admin)
        await db.subscriptions.insert_one(subscription)
        await db.subadmin_applications.update_one(
            {"id": application["id"], "status": "ACTIVATING"},
            {"$set": {
                "status": "ACTIVATED",
                "tenant_id": tenant_id,
                "user_id": user_id,
                "activation_used_at": now,
                "updated_at": now,
            }, "$unset": {"activation_token": "", "activation_token_hash": ""}},
        )
    except Exception as exc:
        await db.users.delete_one({"id": user_id})
        await db.subscriptions.delete_one({"id": subscription["id"]})
        await db.tenants.delete_one({"id": tenant_id})
        await db.subadmin_applications.update_one(
            {"id": application["id"], "status": "ACTIVATING"},
            {"$set": {"status": "ACTIVATION_PENDING", "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        if "duplicate" in str(exc).lower() or "e11000" in str(exc).lower():
            raise HTTPException(status_code=409, detail="Username, email, atau subdomain sudah digunakan.")
        raise HTTPException(status_code=500, detail="Gagal membuat akun Sub-Admin. Silakan coba lagi.")

    return {
        "status": "ACTIVATED",
        "tenant_id": tenant_id,
        "username": username,
        "email": email,
        "password": body.password,
        "tenant_name": application["name"],
        "wifi_name": body.wifi_name.strip(),
        "subdomain": subdomain,
        "whatsapp": application["whatsapp"],
    }
