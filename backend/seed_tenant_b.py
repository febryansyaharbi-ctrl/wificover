from dotenv import load_dotenv; load_dotenv("/app/backend/.env")
import asyncio, uuid
from datetime import datetime, timezone
from database import db
from security import hash_password, SUB_ADMIN

TENANT_B_ID = "00000000-0000-0000-0000-0000000000b2"
SUB_EMAIL = "subadmin.tenantb@coverage.app"
SUB_PASSWORD = "SubAdmin!2026"


async def main():
    now = datetime.now(timezone.utc).isoformat()
    t = await db.tenants.find_one({"id": TENANT_B_ID})
    if not t:
        await db.tenants.insert_one({
            "id": TENANT_B_ID, "name": "Tenant B Demo", "subdomain": "tenantb",
            "is_default": False, "status": "ACTIVE", "logo_url": None,
            "wifi_name": "TenantB Net", "website_title": "Internet Cepat TenantB",
            "description": "Demo tenant kedua untuk verifikasi isolasi.",
            "primary_color": "#2563EB", "whatsapp_number": "6289900001111",
            "created_at": now, "updated_at": now,
        })
        print("Created Tenant B")
    u = await db.users.find_one({"email": SUB_EMAIL})
    if not u:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": SUB_EMAIL,
            "password_hash": hash_password(SUB_PASSWORD), "name": "Sub Admin TenantB",
            "role": SUB_ADMIN, "tenant_id": TENANT_B_ID, "created_at": now,
        })
        print("Created Sub-Admin for Tenant B")
    # Give Tenant B one demo package so packages isolation is observable; NO coverage.
    if await db.internet_packages.count_documents({"tenant_id": TENANT_B_ID}) == 0:
        await db.internet_packages.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": TENANT_B_ID, "name": "TenantB 30 Mbps",
            "speed": "30 Mbps", "price": 200000, "description": "Paket demo Tenant B",
            "active": True, "display_order": 1, "_demo": True,
            "created_at": now, "updated_at": now,
        })
    cov = await db.coverage_files.count_documents({"tenant_id": TENANT_B_ID})
    geo = await db.coverage_geometries.count_documents({"tenant_id": TENANT_B_ID})
    print("Tenant B coverage files:", cov, "geometries:", geo, "(should be 0/0)")


asyncio.run(main())
