import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import db
from security import get_current_user, require_roles, SUPER_ADMIN, audit_log

router = APIRouter(prefix="/api/billing", tags=["billing"])

VALID_STATUSES = {"NOT_CONFIGURED", "TRIAL", "ACTIVE", "EXPIRED", "LOCKED"}


class PlanBody(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    price: float = Field(ge=0)
    duration_days: int = Field(ge=1, le=3650)
    description: Optional[str] = Field(default="", max_length=1000)
    active: bool = True
    display_order: int = 0


@router.get("/plans")
async def list_plans(user: dict = Depends(require_roles(SUPER_ADMIN))):
    return await db.subscription_plans.find({}, {"_id": 0}).sort("display_order", 1).to_list(500)


@router.post("/plans")
async def create_plan(body: PlanBody, user: dict = Depends(require_roles(SUPER_ADMIN))):
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        **body.model_dump(),
        "created_at": now,
        "updated_at": now,
    }
    await db.subscription_plans.insert_one(doc)
    await audit_log(user["tenant_id"], user["id"], "SUBSCRIPTION_PLAN_CREATE", {"plan_id": doc["id"], "name": body.name})
    doc.pop("_id", None)
    return doc


@router.put("/plans/{plan_id}")
async def update_plan(plan_id: str, body: PlanBody, user: dict = Depends(require_roles(SUPER_ADMIN))):
    existing = await db.subscription_plans.find_one({"id": plan_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Paket subscription tidak ditemukan")
    updates = {**body.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.subscription_plans.update_one({"id": plan_id}, {"$set": updates})
    await audit_log(user["tenant_id"], user["id"], "SUBSCRIPTION_PLAN_UPDATE", {"plan_id": plan_id})
    return await db.subscription_plans.find_one({"id": plan_id}, {"_id": 0})


@router.delete("/plans/{plan_id}")
async def delete_plan(plan_id: str, user: dict = Depends(require_roles(SUPER_ADMIN))):
    existing = await db.subscription_plans.find_one({"id": plan_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Paket subscription tidak ditemukan")
    used = await db.subscriptions.count_documents({"plan_id": plan_id})
    if used:
        raise HTTPException(status_code=409, detail="Paket masih digunakan oleh tenant")
    await db.subscription_plans.delete_one({"id": plan_id})
    await audit_log(user["tenant_id"], user["id"], "SUBSCRIPTION_PLAN_DELETE", {"plan_id": plan_id})
    return {"ok": True}


def public_subscription(doc: dict | None):
    if not doc:
        return None

    status = doc.get("status")
    expires_at = doc.get("expires_at")
    now = datetime.now(timezone.utc)

    if status in {"ACTIVE", "TRIAL"} and expires_at:
        try:
            expires_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            # Data lama bisa tersimpan tanpa timezone; anggap UTC agar tidak
            # terjadi perbandingan naive vs aware yang membuat /billing/me 500.
            if expires_dt.tzinfo is None:
                expires_dt = expires_dt.replace(tzinfo=timezone.utc)
            if expires_dt <= now:
                status = "EXPIRED"
        except (TypeError, ValueError):
            status = "EXPIRED"

    is_active = status in {"ACTIVE", "TRIAL"} and bool(expires_at)
    return {
        "id": doc.get("id"),
        "tenant_id": doc.get("tenant_id"),
        "plan_id": doc.get("plan_id"),
        "plan_name": doc.get("plan_name"),
        "status": status,
        "is_active": is_active,
        "started_at": doc.get("started_at"),
        "expires_at": expires_at,
        "notes": doc.get("notes"),
        "updated_at": doc.get("updated_at"),
    }


class SubscriptionUpdate(BaseModel):
    plan_id: Optional[str] = Field(default=None, max_length=100)
    plan_name: Optional[str] = Field(default=None, max_length=100)
    status: str
    started_at: Optional[str] = None
    expires_at: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=1000)


async def record_subscription_history(tenant_id: str, action: str, before: dict | None, after: dict | None, user: dict):
    now = datetime.now(timezone.utc).isoformat()
    await db.subscription_history.insert_one({
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "action": action,
        "before": {
            "plan_id": before.get("plan_id"),
            "plan_name": before.get("plan_name"),
            "status": before.get("status"),
            "started_at": before.get("started_at"),
            "expires_at": before.get("expires_at"),
        } if before else None,
        "after": {
            "plan_id": after.get("plan_id"),
            "plan_name": after.get("plan_name"),
            "status": after.get("status"),
            "started_at": after.get("started_at"),
            "expires_at": after.get("expires_at"),
        } if after else None,
        "changed_by": user.get("id"),
        "created_at": now,
    })


async def ensure_subscription(tenant_id: str):
    existing = await db.subscriptions.find_one({"tenant_id": tenant_id})
    if existing:
        return existing

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "plan_id": None,
        "plan_name": None,
        "status": "NOT_CONFIGURED",
        "started_at": None,
        "expires_at": None,
        "notes": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.subscriptions.insert_one(doc)
    return doc


@router.get("/me")
async def billing_me(user: dict = Depends(get_current_user)):
    doc = await ensure_subscription(user["tenant_id"])
    result = public_subscription(doc)
    tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0, "status": 1})
    if result is not None:
        result["tenant_status"] = tenant.get("status") if tenant else "LOCKED"
        if user.get("role") == SUPER_ADMIN:
            result["is_active"] = True
    return result


@router.get("/subscriptions")
async def list_subscriptions(user: dict = Depends(require_roles(SUPER_ADMIN))):
    docs = await db.subscriptions.find({}, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    return [public_subscription(doc) for doc in docs]


@router.get("/subscriptions/{tenant_id}/history")
async def subscription_history(
    tenant_id: str,
    user: dict = Depends(require_roles(SUPER_ADMIN)),
):
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0, "id": 1})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant tidak ditemukan")
    return await db.subscription_history.find(
        {"tenant_id": tenant_id},
        {"_id": 0},
    ).sort("created_at", -1).to_list(100)


@router.post("/subscriptions/{tenant_id}/renew")
async def renew_subscription(
    tenant_id: str,
    user: dict = Depends(require_roles(SUPER_ADMIN)),
):
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant tidak ditemukan")

    existing = await db.subscriptions.find_one({"tenant_id": tenant_id})
    if not existing or not existing.get("plan_id"):
        raise HTTPException(status_code=400, detail="Tenant belum memiliki paket subscription")

    plan = await db.subscription_plans.find_one({"id": existing["plan_id"]}, {"_id": 0})
    if not plan or not plan.get("active"):
        raise HTTPException(status_code=400, detail="Paket subscription sudah tidak aktif")

    now_dt = datetime.now(timezone.utc)
    start_dt = now_dt
    current_expiry = existing.get("expires_at")
    if current_expiry:
        try:
            expiry_dt = datetime.fromisoformat(current_expiry.replace("Z", "+00:00"))
            if expiry_dt.tzinfo is None:
                expiry_dt = expiry_dt.replace(tzinfo=timezone.utc)
            if expiry_dt > now_dt:
                start_dt = expiry_dt
        except (TypeError, ValueError):
            start_dt = now_dt

    started_at = start_dt.isoformat()
    expires_at = (start_dt + timedelta(days=plan["duration_days"])).isoformat()
    now = now_dt.isoformat()
    updates = {
        "plan_id": plan["id"],
        "plan_name": plan["name"],
        "status": "ACTIVE",
        "started_at": started_at,
        "expires_at": expires_at,
        "updated_at": now,
    }
    await db.subscriptions.update_one({"tenant_id": tenant_id}, {"$set": updates})
    await audit_log(
        user["tenant_id"],
        user["id"],
        "SUBSCRIPTION_RENEW",
        {"tenant_id": tenant_id, "plan_id": plan["id"], "expires_at": expires_at},
    )
    doc = await db.subscriptions.find_one({"tenant_id": tenant_id}, {"_id": 0})
    await record_subscription_history(tenant_id, "RENEW", existing, doc, user)
    return public_subscription(doc)


@router.put("/subscriptions/{tenant_id}")
async def update_subscription(
    tenant_id: str,
    body: SubscriptionUpdate,
    user: dict = Depends(require_roles(SUPER_ADMIN)),
):
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant tidak ditemukan")

    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Status subscription tidak valid")

    plan = None
    if body.plan_id:
        plan = await db.subscription_plans.find_one({"id": body.plan_id}, {"_id": 0})
        if not plan:
            raise HTTPException(status_code=404, detail="Paket subscription tidak ditemukan")
        if not plan.get("active"):
            raise HTTPException(status_code=400, detail="Paket subscription sedang nonaktif")

    existing = await db.subscriptions.find_one({"tenant_id": tenant_id})
    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()

    started_at = body.started_at
    expires_at = body.expires_at
    plan_name = body.plan_name

    if plan:
        plan_name = plan["name"]
        if not started_at:
            started_at = now
        if not expires_at:
            try:
                started_dt = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
            except ValueError:
                raise HTTPException(status_code=400, detail="Format started_at tidak valid")
            expires_at = (started_dt + timedelta(days=plan["duration_days"])).isoformat()

    updates = {
        "plan_id": body.plan_id,
        "plan_name": plan_name,
        "status": body.status,
        "started_at": started_at,
        "expires_at": expires_at,
        "notes": body.notes,
        "updated_at": now,
    }

    if existing:
        await db.subscriptions.update_one({"tenant_id": tenant_id}, {"$set": updates})
    else:
        updates.update({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "created_at": now,
        })
        await db.subscriptions.insert_one(updates)

    await audit_log(
        user["tenant_id"],
        user["id"],
        "SUBSCRIPTION_UPDATE",
        {"tenant_id": tenant_id, "status": body.status, "plan_id": body.plan_id},
    )

    doc = await db.subscriptions.find_one({"tenant_id": tenant_id}, {"_id": 0})
    await record_subscription_history(tenant_id, "UPDATE", existing, doc, user)
    return public_subscription(doc)
