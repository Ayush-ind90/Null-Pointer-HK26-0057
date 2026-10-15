import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Circle } from "react-leaflet";
import axios from "axios";
import "leaflet/dist/leaflet.css";

const API = "http://localhost:8000";
const CENTERS = {
  Punjab: [31.0, 75.3],
  Haryana: [29.2, 76.1],
  "Uttar Pradesh": [26.8, 80.9],
};
const colorFor = (c) => (String(c).startsWith("h") ? "#dc2626" : String(c).startsWith("n") ? "#f97316" : "#eab308");

export default function FireMap() {
  const [state, setState] = useState("Punjab");
  const [days, setDays] = useState(1);
  const [fires, setFires] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [alert, setAlert] = useState(null);
  const [me, setMe] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    axios
      .get(`${API}/api/fires`, { params: { state, days } })
      .then((r) => setFires(r.data.fires))
      .catch((e) => setError(e.response?.data?.detail || "Data load nahi hua"))
      .finally(() => setLoading(false));
  }, [state, days]);

  const checkMyArea = () => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        setMe([lat, lon]);
        const r = await axios.get(`${API}/api/fires/nearby`, { params: { lat, lon, state, days, radius_km: 10 } });
        setAlert(r.data);
      },
      () => setError("Location permission do ya manually district chuno")
    );
  };

  return (
    <div style={{ padding: 16 }}>
      <h2>🔥 Fire Hotspot Monitor</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <select value={state} onChange={(e) => setState(e.target.value)}>
          {Object.keys(CENTERS).map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={days} onChange={(e) => setDays(+e.target.value)}>
          {[1, 2, 3, 5].map((d) => <option key={d} value={d}>Last {d} day</option>)}
        </select>
        <button onClick={checkMyArea}>📍 Mere area mein aag?</button>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!loading && !error && <p>Total hotspots: <b>{fires.length}</b></p>}

      {alert && (
        <p style={{ padding: 8, borderRadius: 6, background: alert.alert_level === "none" ? "#dcfce7" : "#fee2e2" }}>
          {alert.alert_level === "none"
            ? "✅ Aapke 10 km ke andar koi hotspot nahi mila."
            : `⚠️ Aapke 10 km ke andar ${alert.count} hotspot mile (nearest: ${alert.fires[0].distance_km} km).`}
        </p>
      )}

      <MapContainer center={CENTERS[state]} zoom={7} key={state} style={{ height: 480, borderRadius: 8 }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
        {fires.map((f, i) => (
          <CircleMarker key={i} center={[f.latitude, f.longitude]} radius={5}
            pathOptions={{ color: colorFor(f.confidence), fillOpacity: 0.7 }}>
            <Popup>
              Date: {f.acq_date} {String(f.acq_time).padStart(4, "0")} UTC<br />
              Confidence: {f.confidence}<br />FRP: {f.frp} MW
            </Popup>
          </CircleMarker>
        ))}
        {me && <Circle center={me} radius={10000} pathOptions={{ color: "#2563eb" }} />}
      </MapContainer>
      <small>Source: NASA FIRMS (VIIRS S-NPP NRT). Hotspot ≠ confirmed stubble burning; ye satellite-detected heat anomaly hai.</small>
    </div>
  );
}