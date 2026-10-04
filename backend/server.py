from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from database import client, create_indexes
from routes_auth import router as auth_router
from routes_tenant import router as tenant_router
from routes_coverage import router as coverage_router
from routes_leads import router as leads_router
from routes_packages import router as packages_router
from routes_dashboard import router as dashboard_router
from routes_tenants import router as tenants_router
from routes_billing import router as billing_router
from routes_system import router as system_router
from routes_registration import router as registration_router
from seed import run_seed


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("server")

app = FastAPI(title="WiFi Coverage Checker SaaS")

health_router = APIRouter(prefix="/api")


@health_router.get("/")
async def root():
    return {"status": "ok", "service": "wifi-coverage-saas"}


app.include_router(health_router)
app.include_router(auth_router)
app.include_router(tenant_router)
app.include_router(coverage_router)
app.include_router(leads_router)
app.include_router(packages_router)
app.include_router(dashboard_router)
app.include_router(tenants_router)
app.include_router(billing_router)
app.include_router(system_router)
app.include_router(registration_router)

_frontend = os.environ.get("FRONTEND_URL", "").strip()
_origins = [o for o in os.environ.get("CORS_ORIGINS", "").split(",") if o and o != "*"]
if _frontend and _frontend not in _origins:
    _origins.append(_frontend)
if not _origins:
    _origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await create_indexes()
    await run_seed()
    logger.info("Startup complete")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
