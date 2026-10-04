import uuid
import re
from datetime import datetime, timezone
from fastapi import APIRouter, Request, Response, HTTPException, Depends
from pydantic import BaseModel

from database import db
from security import (
    hash_password, verify_password, create_access_token, create_refresh_token,
    set_auth_cookies, clear_auth_cookies, get_current_user, audit_log,
    check_lockout, register_failed, clear_attempts,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginReq(BaseModel):
    identifier: str
    password: str


class ChangePasswordReq(BaseModel):
    current_password: str
    new_password: str


@router.post("/login")
async def login(req: LoginReq, request: Request, response: Response):
    identifier_value = req.identifier.strip()
    email = identifier_value.lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    await check_lockout(identifier)
    user = await db.users.find_one({
        "$or": [{"email": email}, {"username": identifier_value.lower()}]
    })
    # Backward compatibility: older Sub-Admin accounts created from the
    # Super Admin tenant form did not store a username. In that case, allow
    # the local-part of the registered email to act as the username.
    if not user and "@" not in identifier_value:
        local = re.escape(identifier_value.lower())
        user = await db.users.find_one({
            "username": {"$exists": False},
            "email": {"$regex": f"^{local}@"}
        })
    if not user or not verify_password(req.password, user.get("password_hash", "")):
        await register_failed(identifier)
        raise HTTPException(status_code=401, detail="Username/email atau password salah")
    await clear_attempts(identifier)
    access = create_access_token(user["id"], user.get("email", ""), user["role"], user["tenant_id"], user.get("session_version", 0))
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    await audit_log(user["tenant_id"], user["id"], "LOGIN")
    return {
        "id": user["id"], "email": user["email"], "name": user.get("name"),
        "role": user["role"], "tenant_id": user["tenant_id"],
    }


@router.post("/change-password")
async def change_password(req: ChangePasswordReq, response: Response, user: dict = Depends(get_current_user)):
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password baru minimal 8 karakter")
    stored = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 1})
    if not stored or not verify_password(req.current_password, stored.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Password saat ini salah")
    if req.current_password == req.new_password:
        raise HTTPException(status_code=400, detail="Password baru harus berbeda dari password saat ini")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(req.new_password), "updated_at": datetime.now(timezone.utc).isoformat()}, "$inc": {"session_version": 1}})
    clear_auth_cookies(response)
    await audit_log(user["tenant_id"], user["id"], "PASSWORD_CHANGE")
    return {"ok": True, "message": "Password berhasil diubah. Silakan login kembali."}


@router.post("/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    clear_auth_cookies(response)
    await db.users.update_one({"id": user["id"]}, {"$inc": {"session_version": 1}})
    await audit_log(user["tenant_id"], user["id"], "LOGOUT")
    return {"ok": True}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user
