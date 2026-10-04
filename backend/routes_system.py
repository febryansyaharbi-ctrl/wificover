import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List

from database import db
from security import require_roles, SUPER_ADMIN

router = APIRouter(prefix="/api/system", tags=["system"])

DEFAULT_LOGIN_PROMO = "Jadilah Sub-Admin WiFi dan kembangkan layanan internet Anda. Dapatkan dashboard mandiri, branding WiFi sendiri, coverage GIS, leads terisolasi, dan billing mulai dari {PRICE_START}/bulan."


class LoginPromoBody(BaseModel):
    text: str = Field(min_length=20, max_length=500)


class BankAccount(BaseModel):
    bank: str = Field(min_length=2, max_length=60)
    account_name: str = Field(min_length=2, max_length=120)
    account_number: str = Field(min_length=3, max_length=80)


class EWallet(BaseModel):
    provider: str = Field(min_length=2, max_length=60)
    account_name: str = Field(min_length=2, max_length=120)
    account_number: str = Field(min_length=3, max_length=80)


class PaymentSettingsBody(BaseModel):
    whatsapp: str = Field(default="", max_length=25)
    bank_accounts: List[BankAccount] = Field(default_factory=list, max_length=10)
    ewallets: List[EWallet] = Field(default_factory=list, max_length=10)
    qris_image: str | None = Field(default=None, max_length=4_000_000)


@router.get("/login-promo")
async def get_login_promo():
    doc = await db.system_settings.find_one({"key": "login_promo"}, {"_id": 0})
    text = (doc or {}).get("value") or DEFAULT_LOGIN_PROMO
    # Normalisasi newline yang tersimpan sebagai teks literal (mis. \\n atau \\\\n).
    while "\\n" in text:
        text = text.replace("\\n", "\n")
    while "\\r" in text:
        text = text.replace("\\r", "\r")
    plan = await db.subscription_plans.find_one({"active": True}, {"_id": 0, "price": 1}, sort=[("price", 1)])
    price = f"Rp {int(plan.get("price", 0)):,}".replace(",", ".") if plan else "harga paket aktif"
    return {"text": text.replace("{PRICE_START}", price), "price_start": price}


@router.put("/login-promo")
async def update_login_promo(body: LoginPromoBody, user: dict = Depends(require_roles(SUPER_ADMIN))):
    now = datetime.now(timezone.utc).isoformat()
    await db.system_settings.update_one(
        {"key": "login_promo"},
        {"$set": {"key": "login_promo", "value": body.text.strip(), "updated_at": now, "updated_by": user["id"]}},
        upsert=True,
    )
    return {"text": body.text.strip()}


@router.get("/payment-settings")
async def get_payment_settings(user: dict = Depends(require_roles(SUPER_ADMIN))):
    doc = await db.system_settings.find_one({"key": "payment_settings"}, {"_id": 0})
    value = (doc or {}).get("value") or {}
    return {
        "whatsapp": value.get("whatsapp", ""),
        "bank_accounts": value.get("bank_accounts", []),
        "ewallets": value.get("ewallets", []),
        "qris_image": value.get("qris_image"),
    }


@router.put("/payment-settings")
async def update_payment_settings(body: PaymentSettingsBody, user: dict = Depends(require_roles(SUPER_ADMIN))):
    now = datetime.now(timezone.utc).isoformat()
    qris = body.qris_image
    if qris and not qris.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="QRIS harus berupa gambar")
    value = body.model_dump()
    await db.system_settings.update_one(
        {"key": "payment_settings"},
        {"$set": {"key": "payment_settings", "value": value, "updated_at": now, "updated_by": user["id"]}},
        upsert=True,
    )
    return value
