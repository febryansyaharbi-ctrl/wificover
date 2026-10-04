import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from openpyxl import Workbook

from database import db
from security import resolve_tenant, get_current_user, require_active_subscription, normalize_phone
from coverage_service import reverse_geocode_city

router = APIRouter(prefix="/api/leads", tags=["leads"])


class LeadCreate(BaseModel):
    name: str
    phone: str
    subdomain: Optional[str] = None


def build_lead_query(user: dict, search: str = None, status: str = None,
                     date_from: str = None, date_to: str = None):
    query = {"tenant_id": user["tenant_id"]}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
        ]
    if status and status != "ALL":
        query["coverage_status"] = status
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to + "T23:59:59"
        query["created_at"] = rng
    return query


@router.post("")
async def create_lead(body: LeadCreate, request: Request):
    tenant = await resolve_tenant(request, body.subdomain)
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nama wajib diisi.")
    try:
        phone = normalize_phone(body.phone)
    except ValueError:
        raise HTTPException(status_code=400, detail="Masukkan nomor WhatsApp/telepon yang valid.")
    now = datetime.now(timezone.utc).isoformat()
    lead = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant["id"],
        "name": name,
        "phone": phone,
        "latitude": None,
        "longitude": None,
        "coverage_status": "NOT_CHECKED",
        "coverage_distance": None,
        "city": None,
        "matched_coverage_area": None,
        "checked_at": None,
        "created_at": now,
    }
    await db.leads.insert_one(lead)
    lead.pop("_id", None)
    return lead


@router.get("")
async def list_leads(user: dict = Depends(require_active_subscription),
                     page: int = 1, limit: int = 20, search: str = None,
                     status: str = None, date_from: str = None, date_to: str = None):
    query = build_lead_query(user, search, status, date_from, date_to)
    page = max(1, page)
    limit = min(max(1, limit), 100)
    total = await db.leads.count_documents(query)
    docs = await db.leads.find(query, {"_id": 0}).sort("created_at", -1) \
        .skip((page - 1) * limit).limit(limit).to_list(limit)
    # Backfill city for older leads that already have coordinates.
    for lead in docs:
        if not lead.get("city") and lead.get("latitude") is not None and lead.get("longitude") is not None:
            city = await reverse_geocode_city(lead["latitude"], lead["longitude"])
            if city:
                lead["city"] = city
                await db.leads.update_one(
                    {"id": lead["id"], "tenant_id": user["tenant_id"]},
                    {"$set": {"city": city}},
                )
    return {"total": total, "page": page, "limit": limit, "leads": docs}


@router.post("/bulk-delete")
async def bulk_delete_leads(body: dict, user: dict = Depends(require_active_subscription)):
    ids = body.get("ids") or []
    if not isinstance(ids, list) or not ids:
        raise HTTPException(status_code=400, detail="Pilih minimal satu DataLead.")
    ids = [str(x) for x in ids if x]
    result = await db.leads.delete_many({"id": {"$in": ids}, "tenant_id": user["tenant_id"]})
    return {"deleted_count": result.deleted_count}


@router.delete("/all")
async def delete_all_leads(user: dict = Depends(require_active_subscription)):
    result = await db.leads.delete_many({"tenant_id": user["tenant_id"]})
    return {"deleted_count": result.deleted_count}


@router.get("/export")
async def export_leads(user: dict = Depends(require_active_subscription),
                       search: str = None, status: str = None,
                       date_from: str = None, date_to: str = None):
    query = build_lead_query(user, search, status, date_from, date_to)
    docs = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(None)

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "DataLead"
    headers = [
        "Nama", "Nomor WhatsApp", "Latitude", "Longitude", "Status Coverage",
        "Jarak (m)", "Kota", "Area Coverage", "Waktu Cek", "Dibuat"
    ]
    sheet.append(headers)

    for lead in docs:
        sheet.append([
            lead.get("name", ""),
            lead.get("phone", ""),
            lead.get("latitude"),
            lead.get("longitude"),
            lead.get("coverage_status", ""),
            lead.get("coverage_distance"),
            lead.get("city", ""),
            lead.get("matched_coverage_area", ""),
            lead.get("checked_at", ""),
            lead.get("created_at", ""),
        ])

    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    for column_cells in sheet.columns:
        max_length = max(len(str(cell.value or "")) for cell in column_cells)
        sheet.column_dimensions[column_cells[0].column_letter].width = min(max_length + 2, 35)

    output = __import__("io").BytesIO()
    workbook.save(output)
    output.seek(0)

    filename = "DataLead.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/{lead_id}")
async def delete_lead(lead_id: str, user: dict = Depends(require_active_subscription)):
    result = await db.leads.delete_one({
        "id": lead_id,
        "tenant_id": user["tenant_id"],
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead tidak ditemukan.")
    return {"message": "Lead berhasil dihapus.", "id": lead_id}
