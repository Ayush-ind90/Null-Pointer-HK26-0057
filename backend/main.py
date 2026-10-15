import io, os, math, time
import pandas as pd
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()
MAP_KEY = os.getenv("FIRMS_MAP_KEY")

app = FastAPI(title="KrishiSathi GreenShield - Fire API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Approx bounding boxes: west,south,east,north (edges may include nearby areas)
STATES = {
    "Punjab": (73.8, 29.5, 76.9, 32.6),
    "Haryana": (74.4, 27.6, 77.6, 30.9),
    "Uttar Pradesh": (77.0, 23.8, 84.7, 30.5),
}

_cache = {}  # (state, days) -> (timestamp, data)
CACHE_SECONDS = 600


def fetch_fires(state: str, days: int):
    key = (state, days)
    if key in _cache and time.time() - _cache[key][0] < CACHE_SECONDS:
        return _cache[key][1]

    if not MAP_KEY:
        raise HTTPException(500, "FIRMS_MAP_KEY not set in backend/.env")
    w, s, e, n = STATES[state]
    url = (f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/"
           f"{MAP_KEY}/VIIRS_SNPP_NRT/{w},{s},{e},{n}/{days}")
    r = requests.get(url, timeout=30)
    if r.status_code != 200 or "latitude" not in r.text:
        raise HTTPException(502, f"FIRMS error: {r.text[:200]}")

    df = pd.read_csv(io.StringIO(r.text))
    df = df[["latitude", "longitude", "acq_date", "acq_time", "confidence", "frp"]]
    data = df.to_dict(orient="records")
    _cache[key] = (time.time(), data)
    return data


def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


@app.get("/api/states")
def states():
    return list(STATES.keys())


@app.get("/api/fires")
def fires(state: str = "Punjab", days: int = 1):
    if state not in STATES:
        raise HTTPException(400, "Unknown state")
    days = max(1, min(days, 5))
    data = fetch_fires(state, days)
    return {"state": state, "days": days, "count": len(data), "fires": data}


@app.get("/api/fires/nearby")
def nearby(lat: float, lon: float, state: str = "Punjab", radius_km: float = 10, days: int = 1):
    data = fetch_fires(state, max(1, min(days, 5)))
    close = []
    for f in data:
        d = haversine(lat, lon, f["latitude"], f["longitude"])
        if d <= radius_km:
            close.append({**f, "distance_km": round(d, 1)})
    close.sort(key=lambda x: x["distance_km"])
    level = "high" if len(close) >= 5 else "medium" if len(close) >= 1 else "none"
    return {"radius_km": radius_km, "count": len(close), "alert_level": level, "fires": close}