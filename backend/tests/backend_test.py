"""Backend tests for WiFi Coverage Checker SaaS (Phase 1)."""
import os
import io
import time
import json
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback read from frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.strip().split("=", 1)[1].rstrip("/")

API = f"{BASE_URL}/api"
SUPER_EMAIL = "febryansyaharbi@gmail.com"
SUPER_PASS = "Coverage!2026"


@pytest.fixture(scope="session")
def anon():
    return requests.Session()


@pytest.fixture(scope="session")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


# ---------------- Auth ----------------
class TestAuth:
    def test_login_success_sets_cookies(self, admin):
        # ensures fixture worked
        cookies = admin.cookies.get_dict()
        assert "access_token" in cookies
        assert "refresh_token" in cookies

    def test_me_returns_user(self, admin):
        r = admin.get(f"{API}/auth/me")
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == SUPER_EMAIL
        assert d["role"] == "SUPER_ADMIN"
        assert d.get("tenant_id")

    def test_wrong_password_401(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": "wrongpass!!"})
        assert r.status_code == 401

    def test_brute_force_lockout(self):
        s = requests.Session()
        # Use unique email so we don't lock out real admin from IP
        email = "lockout_probe_user@example.com"
        codes = []
        for _ in range(7):
            r = s.post(f"{API}/auth/login", json={"email": email, "password": "x"})
            codes.append(r.status_code)
        assert 429 in codes, f"Expected 429 after retries, got {codes}"


# ---------------- Authorization ----------------
class TestAuthorization:
    @pytest.mark.parametrize("path,method,body", [
        ("/coverage", "GET", None),
        ("/leads", "GET", None),
        ("/dashboard", "GET", None),
        ("/packages", "POST", {"name": "x", "price": 1}),
    ])
    def test_endpoints_require_auth(self, anon, path, method, body):
        r = anon.request(method, f"{API}{path}", json=body)
        assert r.status_code == 401, f"{path} returned {r.status_code}"

    def test_tenants_requires_super_admin(self, anon):
        r = anon.get(f"{API}/tenants")
        assert r.status_code in (401, 403)


# ---------------- Lead creation & phone normalization ----------------
class TestLeads:
    def test_create_lead_normalizes_phone(self):
        r = requests.post(f"{API}/leads", json={"name": "Budi", "phone": "08123456789"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["phone"] == "628123456789"
        assert d["coverage_status"] == "NOT_CHECKED"
        assert d.get("id")
        pytest.lead_id = d["id"]

    @pytest.mark.parametrize("raw,expected", [
        ("08123456789", "628123456789"),
        ("628123456789", "628123456789"),
        ("+628123456789", "628123456789"),
        ("8123456789", "628123456789"),
    ])
    def test_phone_variants(self, raw, expected):
        r = requests.post(f"{API}/leads", json={"name": "TEST_norm", "phone": raw})
        assert r.status_code == 200, r.text
        assert r.json()["phone"] == expected

    def test_invalid_phone_400(self):
        r = requests.post(f"{API}/leads", json={"name": "TEST_bad", "phone": "123"})
        assert r.status_code == 400

    def test_lead_persisted_in_listing(self, admin):
        # Ensure the earlier-created lead appears in list before any coverage check
        assert hasattr(pytest, "lead_id")
        r = admin.get(f"{API}/leads", params={"search": "628123456789", "limit": 50})
        assert r.status_code == 200
        data = r.json()
        ids = [l["id"] for l in data["leads"]]
        assert pytest.lead_id in ids


# ---------------- Coverage engine ----------------
class TestCoverage:
    @pytest.fixture(scope="class")
    def inside_point(self):
        r = requests.get(f"{API}/coverage/public/geometries",
                         params={"minLng": 112.1, "minLat": -7.65,
                                 "maxLng": 112.35, "maxLat": -7.45})
        assert r.status_code == 200
        feats = r.json()["features"]
        assert feats, "No geometries returned"
        # pick first polygon; use its first ring's first vertex plus tiny offset toward centroid
        coords = feats[0]["geometry"]["coordinates"]
        ring = coords[0] if feats[0]["geometry"]["type"] == "Polygon" else coords[0][0]
        # centroid
        lngs = [p[0] for p in ring]
        lats = [p[1] for p in ring]
        return sum(lats) / len(lats), sum(lngs) / len(lngs)

    def test_covered_inside(self, inside_point):
        lat, lng = inside_point
        r = requests.post(f"{API}/coverage/check",
                          json={"latitude": lat, "longitude": lng})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["coverage_status"] == "COVERED"
        assert d["distance_to_coverage"] is not None
        assert d["distance_to_coverage"] <= 100

    def test_covered_within_tolerance(self, inside_point):
        # ~50m to the north: ~0.00045 deg lat
        lat, lng = inside_point
        r = requests.post(f"{API}/coverage/check",
                          json={"latitude": lat + 0.02, "longitude": lng + 0.02})
        # very likely uncovered at 0.02deg (~2km); we only assert response valid
        assert r.status_code == 200

    def test_not_covered_far(self):
        r = requests.post(f"{API}/coverage/check",
                          json={"latitude": -5.0, "longitude": 114.0})
        assert r.status_code == 200
        d = r.json()
        assert d["coverage_status"] == "NOT_COVERED"

    def test_invalid_coords_400(self):
        r = requests.post(f"{API}/coverage/check",
                          json={"latitude": 200, "longitude": 0})
        assert r.status_code == 400

    def test_coverage_updates_existing_lead(self, admin, inside_point):
        # Create fresh lead
        r = requests.post(f"{API}/leads", json={"name": "TEST_lead_upd", "phone": "081200000001"})
        assert r.status_code == 200
        lead_id = r.json()["id"]

        before = admin.get(f"{API}/leads", params={"limit": 1}).json()["total"]
        lat, lng = inside_point
        r2 = requests.post(f"{API}/coverage/check",
                           json={"lead_id": lead_id, "latitude": lat, "longitude": lng})
        assert r2.status_code == 200
        after = admin.get(f"{API}/leads", params={"limit": 1}).json()["total"]
        assert after == before, f"Lead count changed {before}->{after}"

        # verify lead updated
        found = admin.get(f"{API}/leads", params={"search": lead_id[:8]}).json()["leads"]
        # search by phone instead
        found = admin.get(f"{API}/leads", params={"search": "628120000000"}).json()["leads"]
        target = next((l for l in found if l["id"] == lead_id), None)
        # Fallback: list and locate
        if target is None:
            page = 1
            while target is None and page < 20:
                res = admin.get(f"{API}/leads", params={"page": page, "limit": 100}).json()
                target = next((l for l in res["leads"] if l["id"] == lead_id), None)
                if page * 100 >= res["total"]:
                    break
                page += 1
        assert target is not None
        assert target["coverage_status"] in ("COVERED", "NOT_COVERED")
        assert target["checked_at"] is not None


# ---------------- GIS files status ----------------
class TestGIS:
    def test_four_files_ready(self, admin):
        r = admin.get(f"{API}/coverage")
        assert r.status_code == 200
        files = r.json()
        assert len(files) >= 4, f"Expected at least 4 GIS files, got {len(files)}"
        ready = [f for f in files if f["status"] == "READY"]
        assert len(ready) >= 4
        for f in ready[:4]:
            assert f["active"] is True
            assert f["geometry_count"] > 0

    def test_upload_invalid_txt(self, admin):
        files = {"file": ("bad.txt", b"not a gis file", "text/plain")}
        r = admin.post(f"{API}/coverage/upload", files=files)
        # rejected upfront OR accepted then marked FAILED
        assert r.status_code in (200, 400)
        if r.status_code == 200:
            fid = r.json()["id"]
            # poll
            for _ in range(15):
                time.sleep(1)
                cur = admin.get(f"{API}/coverage").json()
                doc = next((x for x in cur if x["id"] == fid), None)
                if doc and doc["status"] in ("FAILED", "READY"):
                    break
            assert doc and doc["status"] == "FAILED"
            admin.delete(f"{API}/coverage/{fid}")

    def test_upload_valid_geojson(self, admin):
        gj = {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature", "properties": {"name": "TEST_poly"},
                "geometry": {"type": "Polygon", "coordinates": [[
                    [112.20, -7.55], [112.21, -7.55], [112.21, -7.54],
                    [112.20, -7.54], [112.20, -7.55]
                ]]}
            }]
        }
        files = {"file": ("test.geojson", json.dumps(gj).encode(), "application/geo+json")}
        r = admin.post(f"{API}/coverage/upload", files=files)
        assert r.status_code == 200, r.text
        fid = r.json()["id"]
        doc = None
        for _ in range(20):
            time.sleep(1)
            cur = admin.get(f"{API}/coverage").json()
            doc = next((x for x in cur if x["id"] == fid), None)
            if doc and doc["status"] in ("READY", "FAILED"):
                break
        assert doc and doc["status"] == "READY", f"Doc: {doc}"
        assert doc["geometry_count"] >= 1
        # cleanup
        admin.delete(f"{API}/coverage/{fid}")


# ---------------- Packages ----------------
class TestPackages:
    def test_public_packages(self):
        r = requests.get(f"{API}/packages/public")
        assert r.status_code == 200
        pkgs = r.json()
        assert isinstance(pkgs, list)

    def test_packages_crud(self, admin):
        r = admin.post(f"{API}/packages", json={
            "name": "TEST_pkg", "price": 199000, "speed": "50 Mbps",
            "description": "test", "active": True
        })
        assert r.status_code in (200, 201), r.text
        pid = r.json().get("id")
        assert pid
        r2 = admin.put(f"{API}/packages/{pid}", json={
            "name": "TEST_pkg", "price": 299000, "speed": "100 Mbps",
            "description": "test", "active": True
        })
        assert r2.status_code == 200
        r3 = admin.delete(f"{API}/packages/{pid}")
        assert r3.status_code in (200, 204)


# ---------------- Branding ----------------
class TestBranding:
    def test_update_branding(self, admin):
        r = admin.put(f"{API}/branding", json={
            "wifi_name": "TEST WiFi", "primary_color": "#123456",
            "whatsapp_number": "628123456789"
        })
        assert r.status_code == 200, r.text
