import os
from motor.motor_asyncio import AsyncIOMotorClient

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]


async def create_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("username", unique=True, sparse=True)
    await db.users.create_index("tenant_id")
    await db.tenants.create_index("subdomain", unique=True)
    await db.tenants.create_index("is_default")
    await db.coverage_files.create_index("tenant_id")
    await db.coverage_geometries.create_index([("geometry", "2dsphere")])
    await db.coverage_geometries.create_index([("tenant_id", 1), ("active", 1)])
    await db.coverage_geometries.create_index("file_id")
    await db.leads.create_index("tenant_id")
    await db.leads.create_index("phone")
    await db.leads.create_index("created_at")
    await db.leads.create_index("coverage_status")
    await db.internet_packages.create_index([("tenant_id", 1), ("display_order", 1)])
    await db.subscriptions.create_index("tenant_id", unique=True)
    await db.subscription_plans.create_index("id", unique=True)
    await db.subscription_plans.create_index([("active", 1), ("display_order", 1)])
    await db.subscriptions.create_index([("status", 1), ("expires_at", 1)])
    await db.login_attempts.create_index("identifier")
    await db.subadmin_applications.create_index("id", unique=True)
    await db.subadmin_applications.create_index([("status", 1), ("created_at", -1)])
    await db.subadmin_applications.create_index("whatsapp")
    await db.subadmin_applications.create_index([("status", 1), ("activation_expires_at", 1)])
    await db.audit_logs.create_index("tenant_id")
    await db.audit_logs.create_index("created_at")
