import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { useLocation } from "react-router-dom";
import { RefreshCw, AlertCircle, ExternalLink } from "lucide-react";
import PageShell from "../Layout/PageShell";
// import { getIncidents } from "../../api/varunaApi";
import { getDashboard, invalidateDashboardCache } from "../../api/varunaApi";
import { SeverityBadge } from "../common/Severity";
import { SEVERITY_ORDER } from "../common/severityConfig";
import { lookUpLocationName } from "../../utils/geolocation";
import "./LiveMap.css";

const SEVERITY_RADIUS = { Low: 6, Moderate: 8, High: 10, Critical: 13 };
const SEVERITY_STROKE = {
  Low: "#16a34a",
  Moderate: "#eab308",
  High: "#f97316",
  Critical: "#dc2626",
};

/** Recenters the map when a specific incident is focused (e.g. from the Dashboard) */
const FlyToIncident = ({ incident }) => {
  const map = useMap();
  useEffect(() => {
    if (incident?.latitude != null && incident?.longitude != null) {
      map.flyTo([incident.latitude, incident.longitude], 6, { duration: 0.8 });
    }
  }, [incident, map]);
  return null;
};

const FlyToCenter = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (center?.length === 2) {
      map.flyTo(center, zoom, { duration: 0.8 });
    }
  }, [center, zoom, map]);
  return null;
};

const LiveMap = () => {
  const routerLocation = useLocation();
  const focusId = routerLocation.state?.focusId;

  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSeverities, setActiveSeverities] = useState(new Set(SEVERITY_ORDER));
  const [userLocation, setUserLocation] = useState([20, 0]);
  const [locationStatus, setLocationStatus] = useState("prompt");
  const [locationError, setLocationError] = useState("");
  const [allowGlobal, setAllowGlobal] = useState(false);
  const [locationNames, setLocationNames] = useState({});

  const requestLocation = useCallback(() => {
    if (!navigator?.geolocation) {
      setLocationStatus("denied");
      setLocationError("Geolocation is unavailable in this browser.");
      return;
    }

    setLocationStatus("requesting");
    setLocationError("");

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserLocation([coords.latitude, coords.longitude]);
        setLocationStatus("granted");
      },
      (err) => {
        const message =
          err.code === 1
            ? "Location permission denied. Allow location to center the map."
            : err.code === 2
            ? "Unable to determine your location."
            : err.code === 3
            ? "Location request timed out."
            : err.message || "Unable to access location.";
        setLocationStatus("denied");
        setLocationError(message);
      },
      { timeout: 15000, maximumAge: 60000, enableHighAccuracy: true }
    );
  }, []);

  const showLocationOverlay =
    locationStatus === "prompt" ||
    locationStatus === "requesting" ||
    (locationStatus === "denied" && !allowGlobal);

  const load = useCallback(async (isRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      if (isRefresh) invalidateDashboardCache();
      const data = await getDashboard({ force: isRefresh });
      setIncidents(Array.isArray(data?.all_incidents) ? data.all_incidents : []);
    } catch (err) {
      console.error("Failed to load sources:", err);
      setError("Couldn't reach the Kavach analysis service. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    requestLocation();
    load();
  }, [load, requestLocation]);

  const toggleSeverity = (sev) => {
    setActiveSeverities((prev) => {
      const next = new Set(prev);
      next.has(sev) ? next.delete(sev) : next.add(sev);
      return next;
    });
  };

  const visibleIncidents = useMemo(
    () => incidents.filter((i) => activeSeverities.has(i.severity) && i.latitude != null && i.longitude != null),
    [incidents, activeSeverities]
  );

  useEffect(() => {
    const pending = visibleIncidents.filter(
      (incident) => !locationNames[incident.incident_id ?? incident.id]
    );
    if (!pending.length) return;

    let active = true;
    const fetchNames = async () => {
      const names = {};
      await Promise.all(
        pending.map(async (incident) => {
          const name = await lookUpLocationName(incident.latitude, incident.longitude);
          if (active) {
            names[incident.incident_id ?? incident.id] = name;
          }
        })
      );
      if (active) {
        setLocationNames((prev) => ({ ...prev, ...names }));
      }
    };

    fetchNames();
    return () => {
      active = false;
    };
  }, [visibleIncidents, locationNames]);

  const focusIncident = useMemo(
    () => incidents.find((i) => i.id === focusId || i.incident_id === focusId),
    [incidents, focusId]
  );

  const counts = useMemo(() => {
    const out = { Low: 0, Moderate: 0, High: 0, Critical: 0 };
    incidents.forEach((i) => { if (out[i.severity] !== undefined) out[i.severity] += 1; });
    return out;
  }, [incidents]);

  return (
    <PageShell noFooter>
      <div className="v-dash-header">
        <div>
          <h1 className="v-dash-title">Live Map</h1>
          <p className="v-dash-subtitle">
            {loading ? "Loading incidents…" : `${visibleIncidents.length} of ${incidents.length} incidents shown`}
          </p>
        </div>
        <button className="v-btn v-btn-primary" onClick={() => load(true)} disabled={loading}>
          {loading ? <span className="v-loading-spinner" /> : <RefreshCw size={16} />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="v-alert-banner">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button className="v-btn" onClick={load}>Retry</button>
        </div>
      )}

      <div className="v-map-legend">
        {SEVERITY_ORDER.map((sev) => (
          <button
            key={sev}
            className={`v-map-legend-chip ${activeSeverities.has(sev) ? "active" : ""}`}
            style={{ "--chip-color": SEVERITY_STROKE[sev] }}
            onClick={() => toggleSeverity(sev)}
          >
            <span className="v-map-legend-dot" />
            {sev} <span className="v-mono">({counts[sev]})</span>
          </button>
        ))}
      </div>

      <div className="v-map-frame">
        {(showLocationOverlay || loading) && (
          <div className="v-loading-overlay">
            <span className="v-loading-spinner" />
            <div>
              <p>
                {locationStatus === "prompt"
                  ? "Allow location access to center the map on your area."
                  : locationStatus === "requesting"
                  ? "Requesting location permission…"
                  : loading
                  ? "Loading map incidents…"
                  : locationError || "Allow location access to view the map."}
              </p>
              <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
                {(locationStatus === "prompt" || locationStatus === "denied") && (
                  <button className="v-btn v-btn-primary" onClick={requestLocation}>
                    Allow location
                  </button>
                )}
                {(locationStatus === "denied" || locationStatus === "prompt") && (
                  <button className="v-btn" onClick={() => setAllowGlobal(true)}>
                    Continue without location
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        <MapContainer
          center={userLocation}
          zoom={locationStatus === "granted" ? 6 : 2}
          minZoom={2}
          worldCopyJump
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {locationStatus === "granted" && <FlyToCenter center={userLocation} zoom={6} />}
          {focusIncident && <FlyToIncident incident={focusIncident} />}
          {visibleIncidents.map((incident) => (
            <CircleMarker
              key={incident.id}
              center={[incident.latitude, incident.longitude]}
              radius={SEVERITY_RADIUS[incident.severity] || 7}
              pathOptions={{
                color: SEVERITY_STROKE[incident.severity] || "#64748b",
                fillColor: SEVERITY_STROKE[incident.severity] || "#64748b",
                fillOpacity: 0.55,
                weight: 2,
              }}
            >
              <Popup>
                <div className="v-map-popup">
                  <SeverityBadge severity={incident.severity} size="sm" />
                  <h4>{incident.title}</h4>
                  <div className="v-map-popup-meta v-mono">
                    {incident.category} · {incident.source}
                  </div>
                  {incident.description && (
                    <p className="v-map-popup-desc">{incident.description.slice(0, 220)}</p>
                  )}
                  <div className="v-map-popup-coords v-mono">
                    {locationNames[incident.incident_id ?? incident.id] || `${incident.latitude?.toFixed(3)}, ${incident.longitude?.toFixed(3)}`}
                  </div>
                  {incident.url && (
                    <a href={incident.url} target="_blank" rel="noopener noreferrer" className="v-map-popup-link">
                      Source <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </PageShell>
  );
};

export default LiveMap;
