import io
import json
import zipfile
import xml.etree.ElementTree as ET

from shapely.geometry import shape, mapping, MultiPolygon
from shapely.geometry.polygon import orient
from shapely.validation import make_valid


def _local(tag: str) -> str:
    return tag.split("}")[-1]


def _iter_local(elem, name):
    for e in elem.iter():
        if _local(e.tag) == name:
            yield e


def _first_local(elem, name):
    for e in elem.iter():
        if _local(e.tag) == name:
            return e
    return None


def _parse_coords(text):
    pts = []
    if not text:
        return pts
    for tok in text.split():
        parts = tok.split(",")
        if len(parts) >= 2:
            try:
                pts.append((float(parts[0]), float(parts[1])))
            except ValueError:
                continue
    return pts


def _placemark_name(pm):
    for child in pm:
        if _local(child.tag) == "name":
            return (child.text or "").strip()
    return ""


def _placemark_desc(pm):
    for child in pm:
        if _local(child.tag) == "description":
            return (child.text or "").strip()[:500]
    return ""


def _extract_polygons(pm):
    """Return list of polygons; each polygon is list of rings; ring is list of (lng,lat)."""
    polygons = []
    for poly_el in _iter_local(pm, "Polygon"):
        rings = []
        outer = _first_local(poly_el, "outerBoundaryIs")
        if outer is not None:
            coords_el = _first_local(outer, "coordinates")
            if coords_el is not None:
                ring = _parse_coords(coords_el.text)
                if len(ring) >= 3:
                    rings.append(ring)
        for inner in _iter_local(poly_el, "innerBoundaryIs"):
            coords_el = _first_local(inner, "coordinates")
            if coords_el is not None:
                ring = _parse_coords(coords_el.text)
                if len(ring) >= 3:
                    rings.append(ring)
        if rings:
            polygons.append(rings)
    return polygons


def _normalize(geojson):
    """Validate + orient geometry, return clean GeoJSON dict (lists) or None."""
    try:
        g = shape(geojson)
    except Exception:
        return None
    if g.is_empty:
        return None
    if not g.is_valid:
        try:
            g = make_valid(g)
        except Exception:
            return None
    parts = []
    gt = g.geom_type
    if gt == "Polygon":
        parts = [g]
    elif gt == "MultiPolygon":
        parts = list(g.geoms)
    elif gt == "GeometryCollection":
        for sub in g.geoms:
            if sub.geom_type == "Polygon":
                parts.append(sub)
            elif sub.geom_type == "MultiPolygon":
                parts.extend(list(sub.geoms))
    if not parts:
        return None
    parts = [p for p in parts if not p.is_empty and p.area > 0]
    if not parts:
        return None
    oriented = [orient(p, sign=1.0) for p in parts]
    final = oriented[0] if len(oriented) == 1 else MultiPolygon(oriented)
    return json.loads(json.dumps(mapping(final)))


def _bounds_update(extent, geojson):
    g = shape(geojson)
    minx, miny, maxx, maxy = g.bounds
    if extent["minLng"] is None:
        extent.update(minLng=minx, minLat=miny, maxLng=maxx, maxLat=maxy)
    else:
        extent["minLng"] = min(extent["minLng"], minx)
        extent["minLat"] = min(extent["minLat"], miny)
        extent["maxLng"] = max(extent["maxLng"], maxx)
        extent["maxLat"] = max(extent["maxLat"], maxy)


def _kml_from_bytes(raw: bytes, file_type):
    if file_type == "kmz":
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            names = [n for n in z.namelist() if n.lower().endswith(".kml")]
            if not names:
                raise ValueError("KMZ tidak mengandung file KML")
            return z.read(names[0])
    return raw


def detect_file_type(filename: str, head: bytes = b"") -> str:
    lower = filename.lower()
    if head[:2] == b"PK":
        return "kmz"
    if lower.endswith(".kmz"):
        return "kmz"
    if lower.endswith(".geojson") or lower.endswith(".json"):
        return "geojson"
    if lower.endswith(".kml"):
        return "kml"
    # fallback by content
    stripped = head.lstrip()[:1]
    if stripped in (b"{", b"["):
        return "geojson"
    return "kml"


def parse_bytes(raw: bytes, file_type: str, source_file: str):
    """Synchronous parse from in-memory bytes. Returns (geometries, extent, stats)."""
    extent = {"minLng": None, "minLat": None, "maxLng": None, "maxLat": None}
    geometries = []
    stats = {"placemarks": 0, "skipped": 0}

    if file_type == "geojson":
        data = json.loads(raw)
        features = []
        if data.get("type") == "FeatureCollection":
            features = data.get("features", [])
        elif data.get("type") == "Feature":
            features = [data]
        else:
            features = [{"geometry": data, "properties": {}}]
        for feat in features:
            stats["placemarks"] += 1
            geom = feat.get("geometry")
            props = feat.get("properties", {}) or {}
            if not geom or geom.get("type") not in ("Polygon", "MultiPolygon"):
                stats["skipped"] += 1
                continue
            norm = _normalize(geom)
            if not norm:
                stats["skipped"] += 1
                continue
            _bounds_update(extent, norm)
            geometries.append({
                "name": str(props.get("name") or props.get("Name") or "")[:200],
                "description": str(props.get("description") or "")[:500],
                "folder": None,
                "source_file": source_file,
                "geometry": norm,
            })
        return geometries, extent, stats

    # KML / KMZ streamed
    kml_bytes = _kml_from_bytes(raw, file_type)
    context = ET.iterparse(io.BytesIO(kml_bytes), events=("end",))
    for event, elem in context:
        if _local(elem.tag) != "Placemark":
            continue
        stats["placemarks"] += 1
        name = _placemark_name(elem)
        polys = _extract_polygons(elem)
        elem.clear()
        if not polys:
            stats["skipped"] += 1
            continue
        if len(polys) == 1:
            geojson = {"type": "Polygon", "coordinates": polys[0]}
        else:
            geojson = {"type": "MultiPolygon", "coordinates": [p for p in polys]}
        norm = _normalize(geojson)
        if not norm:
            stats["skipped"] += 1
            continue
        _bounds_update(extent, norm)
        geometries.append({
            "name": name[:200],
            "description": "",
            "folder": None,
            "source_file": source_file,
            "geometry": norm,
        })
    return geometries, extent, stats


def parse_file(path: str, file_type: str, source_file: str):
    with open(path, "rb") as f:
        raw = f.read()
    return parse_bytes(raw, file_type, source_file)
