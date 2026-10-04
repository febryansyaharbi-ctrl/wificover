import os
import uuid
import asyncio
import logging
from datetime import datetime, timezone

from database import db
from security import hash_password, verify_password, SUPER_ADMIN
from coverage_service import process_file

logger = logging.getLogger("seed")

SEED_DIR = os.path.join(os.path.dirname(__file__), "seed_data")
DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"

SEED_FILES = [
    ("BOUNDARY JBG PRO.kmz", "kmz"),
    ("BOUNDARY JULI PRO 2026.kmz", "kmz"),
    ("BOUNDERY RFS NGANJUK-1.kmz", "kmz"),
    ("ALL BOUNDARY DAN FDT BLITAR.kmz.kml", "kml"),
]

DEMO_PACKAGES = [
    {"name": "Home 20 Mbps", "speed": "20 Mbps", "price": 165000,
     "description": "Cocok untuk streaming & browsing harian keluarga kecil.", "display_order": 1},
    {"name": "Home 50 Mbps", "speed": "50 Mbps", "price": 265000,
     "description": "Ideal untuk keluarga, WFH, dan gaming lancar.", "display_order": 2},
    {"name": "Home 100 Mbps", "speed": "100 Mbps", "price": 385000,
     "description": "Kecepatan maksimal untuk rumah dengan banyak perangkat.", "display_order": 3},
]


async def seed_core():
    now = datetime.now(timezone.utc).isoformat()
    tenant = await db.tenants.find_one({"is_default": True})
    if not tenant:
        await db.tenants.insert_one({
            "id": DEFAULT_TENANT_ID,
            "name": "Default ISP",
            "subdomain": "default",
            "is_default": True,
            "status": "ACTIVE",
            "logo_url": None,
            "wifi_name": "MyRepublic WiFi",
            "website_title": "Internet Fiber Cepat & Stabil untuk Rumah Anda",
            "description": "Cek ketersediaan jaringan fiber di lokasi Anda dan nikmati internet super cepat tanpa batas.",
            "primary_color": "#6D28D9",
            "whatsapp_number": "6281234567890",
            "created_at": now,
            "updated_at": now,
        })
        logger.info("Seeded default tenant")

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "username": "superadmin",
            "password_hash": hash_password(admin_password),
            "name": "Super Admin",
            "role": SUPER_ADMIN,
            "tenant_id": DEFAULT_TENANT_ID,
            "created_at": now,
        })
        logger.info("Seeded super admin %s", admin_email)
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": hash_password(admin_password), "username": existing.get("username") or "superadmin"}})

    if await db.internet_packages.count_documents({"tenant_id": DEFAULT_TENANT_ID}) == 0:
        for p in DEMO_PACKAGES:
            await db.internet_packages.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": DEFAULT_TENANT_ID,
                "active": True, "created_at": now, "updated_at": now,
                "_demo": True, **p,
            })
        logger.info("Seeded demo packages")

    tenants = await db.tenants.find({}, {"_id": 0, "id": 1}).to_list(1000)
    for tenant_doc in tenants:
        if not await db.subscriptions.find_one({"tenant_id": tenant_doc["id"]}):
            await db.subscriptions.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_doc["id"],
                "plan_id": None,
                "plan_name": None,
                "status": "NOT_CONFIGURED",
                "started_at": None,
                "expires_at": None,
                "notes": None,
                "created_at": now,
                "updated_at": now,
            })
    logger.info("Billing subscription foundation checked")


async def seed_gis():
    """Import the four initial GIS files into the default tenant (idempotent, sequential)."""
    if await db.coverage_files.count_documents({"tenant_id": DEFAULT_TENANT_ID}) > 0:
        return
    now = datetime.now(timezone.utc).isoformat()
    for filename, ftype in SEED_FILES:
        path = os.path.join(SEED_DIR, filename)
        if not os.path.exists(path):
            logger.warning("Seed GIS file missing: %s", filename)
            continue
        file_id = str(uuid.uuid4())
        await db.coverage_files.insert_one({
            "id": file_id, "tenant_id": DEFAULT_TENANT_ID, "filename": filename,
            "file_type": ftype, "status": "UPLOADED", "geometry_count": 0,
            "extent": None, "active": False, "error": None, "is_seed": True,
            "created_at": now, "updated_at": now,
        })
        with open(path, "rb") as f:
            data = f.read()
        logger.info("Processing seed GIS %s (%d KB)", filename, len(data) // 1024)
        await process_file(file_id, DEFAULT_TENANT_ID, data, ftype, filename, activate=True)


async def run_seed():
    await db.system_settings.update_one(
        {"key": "login_promo"},
        {"$setOnInsert": {"key": "login_promo", "value": "Jadilah Sub-Admin WiFi dan kembangkan layanan internet Anda. Dapatkan dashboard mandiri, branding WiFi sendiri, coverage GIS, leads terisolasi, dan billing mulai dari {PRICE_START}/bulan."}},
        upsert=True,
    )
    await seed_core()
    asyncio.create_task(seed_gis())
