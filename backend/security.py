import os
import re
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta
from fastapi import Request, HTTPException, Depends

from database import db

JWT_ALGORITHM = "HS256"
ACCESS_MINUTES = 60 * 12
REFRESH_DAYS = 7

SUPER_ADMIN = "SUPER_ADMIN"
SUB_ADMIN = "SUB_ADMIN"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str, role: str, tenant_id: str, session_version: int = 0) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "tenant_id": tenant_id,
        "session_version": session_version,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_MINUTES),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_DAYS),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="none", max_age=ACCESS_MINUTES * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True,
                        samesite="none", max_age=REFRESH_DAYS * 86400, path="/")


def clear_auth_cookies(response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


def _extract_token(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        header = request.headers.get("Authorization", "")
        if header.startswith("Bearer "):
            token = header[7:]
    return token


async def get_current_user(request: Request) -> dict:
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Belum terautentikasi")
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token tidak valid")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesi berakhir, silakan login kembali")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token tidak valid")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Pengguna tidak ditemukan")
    if int(payload.get("session_version", 0)) != int(user.get("session_version", 0)):
        raise HTTPException(status_code=401, detail="Sesi sudah berakhir. Silakan login kembali.")
    return user


def require_roles(*roles):
    async def checker(user: dict = Depends(get_current_user)):
        if roles and user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Akses ditolak")
        return user
    return checker


async def require_active_subscription(user: dict = Depends(get_current_user)):
    """Block tenant features for expired SubAdmin billing; Super Admin is never blocked."""
    if user.get("role") != SUB_ADMIN:
        return user

    tenant = await db.tenants.find_one(
        {"id": user["tenant_id"]},
        {"_id": 0, "status": 1},
    )
    if not tenant or tenant.get("status") != "ACTIVE":
        raise HTTPException(status_code=402, detail="Akun nonaktif. Tenant sedang dinonaktifkan.")

    subscription = await db.subscriptions.find_one(
        {"tenant_id": user["tenant_id"]},
        {"_id": 0, "status": 1, "expires_at": 1},
    )
    if not subscription:
        raise HTTPException(status_code=402, detail="Akun nonaktif. Billing belum dikonfigurasi.")

    status = subscription.get("status")
    expires_at = subscription.get("expires_at")
    active = status in {"ACTIVE", "TRIAL"} and bool(expires_at)

    if active:
        try:
            expires_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            # Data lama tanpa timezone diperlakukan sebagai UTC.
            if expires_dt.tzinfo is None:
                expires_dt = expires_dt.replace(tzinfo=timezone.utc)
            active = expires_dt > datetime.now(timezone.utc)
        except (TypeError, ValueError):
            active = False

    if not active:
        raise HTTPException(status_code=402, detail="Akun nonaktif. Billing telah berakhir.")

    return user


# ---- Brute force protection ----
MAX_ATTEMPTS = 5
LOCK_MINUTES = 15


async def check_lockout(identifier: str):
    rec = await db.login_attempts.find_one({"identifier": identifier})
    if not rec:
        return
    if rec.get("count", 0) >= MAX_ATTEMPTS:
        locked_until = rec.get("locked_until")
        if locked_until and datetime.fromisoformat(locked_until) > datetime.now(timezone.utc):
            raise HTTPException(status_code=429, detail="Terlalu banyak percobaan. Coba lagi nanti.")


async def register_failed(identifier: str):
    now = datetime.now(timezone.utc)
    rec = await db.login_attempts.find_one({"identifier": identifier})
    count = (rec.get("count", 0) if rec else 0) + 1
    update = {"count": count, "updated_at": now.isoformat()}
    if count >= MAX_ATTEMPTS:
        update["locked_until"] = (now + timedelta(minutes=LOCK_MINUTES)).isoformat()
    await db.login_attempts.update_one({"identifier": identifier}, {"$set": update}, upsert=True)


async def clear_attempts(identifier: str):
    await db.login_attempts.delete_one({"identifier": identifier})


async def audit_log(tenant_id, user_id, action, meta=None):
    import uuid
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "user_id": user_id,
        "action": action,
        "meta": meta or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


# ---- Tenant resolution (subdomain / path fallback / default) ----
async def resolve_tenant(request: Request, subdomain: str = None) -> dict:
    """Resolve current tenant from explicit subdomain param, hostname, or default."""
    sub = subdomain
    if not sub:
        host = request.headers.get("host", "").split(":")[0]
        parts = host.split(".")
        # tenant.example.com -> len>=3 and not www
        if len(parts) >= 3 and parts[0] not in ("www", "app", "api"):
            sub = parts[0]
    tenant = None
    if sub and sub != "default":
        tenant = await db.tenants.find_one({"subdomain": sub}, {"_id": 0})
    if not tenant:
        tenant = await db.tenants.find_one({"is_default": True}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant tidak ditemukan")
    return tenant


PHONE_RE = re.compile(r"[^\d+]")


def normalize_phone(raw: str) -> str:
    """Normalize Indonesian phone numbers to 628xxxxxxxxxx format."""
    if not raw:
        raise ValueError("empty")
    s = PHONE_RE.sub("", raw.strip())
    s = s.replace("+", "")
    if s.startswith("62"):
        pass
    elif s.startswith("0"):
        s = "62" + s[1:]
    elif s.startswith("8"):
        s = "62" + s
    else:
        raise ValueError("invalid")
    digits = s
    if not digits.isdigit() or not (10 <= len(digits) <= 15):
        raise ValueError("invalid")
    return digits
