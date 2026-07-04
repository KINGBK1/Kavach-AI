import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { useLocation } from "react-router-dom";
import { RefreshCw, AlertCircle, ExternalLink, Globe, Maximize2, Minimize2 } from "lucide-react";
import PageShell from "../Layout/PageShell";
import { getDashboard, invalidateDashboardCache } from "../../api/varunaApi";
import { SeverityBadge } from "../common/Severity";
import { SEVERITY_ORDER } from "../common/severityConfig";
import L from "leaflet";
import "./LiveMap.css";

const SEVERITY_RADIUS = { Low: 6, Moderate: 8, High: 10, Critical: 13 };
const SEVERITY_STROKE = {
  Low: "#16a34a",
  Moderate: "#eab308",
  High: "#f97316",
  Critical: "#dc2626",
};

// Client side geo boundary configurations
const GEO_BOUNDS = [
  { country: "India", latMin: 6.5, latMax: 35.5, lngMin: 68.0, lngMax: 97.4 },
  { country: "United States", latMin: 24.5, latMax: 49.4, lngMin: -124.8, lngMax: -66.9 },
  { country: "Japan", latMin: 30.0, latMax: 45.0, lngMin: 128.0, lngMax: 146.0 },
  { country: "United Kingdom", latMin: 49.9, latMax: 60.8, lngMin: -8.6, lngMax: 1.7 },
  { country: "Australia", latMin: -44.0, latMax: -10.0, lngMin: 112.0, lngMax: 154.0 },
  { country: "Canada", latMin: 42.0, latMax: 83.0, lngMin: -141.0, lngMax: -52.0 },
  { country: "Germany", latMin: 47.2, latMax: 55.1, lngMin: 5.8, lngMax: 15.0 },
  { country: "France", latMin: 42.3, latMax: 51.1, lngMin: -4.8, lngMax: 8.2 },
  { country: "China", latMin: 18.0, latMax: 53.6, lngMin: 73.5, lngMax: 134.8 },
  { country: "Russia", latMin: 41.0, latMax: 82.0, lngMin: 19.0, lngMax: 180.0 },
  { country: "Brazil", latMin: -33.8, latMax: 5.3, lngMin: -74.0, lngMax: -34.7 }
];

const getOfflineCountry = (lat, lng) => {
  if (lat == null || lng == null) return "Unknown Region";
  const match = GEO_BOUNDS.find(b => lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax);
  if (match) return match.country;

  if (lat > 0 && lng > 60 && lng < 150) return "Asia-Pacific Region";
  if (lat > 20 && lng > -30 && lng < 60) return "Europe & Middle East";
  if (lat < 0 && lng > 110 && lng < 180) return "Oceania Region";
  if (lng > -170 && lng < -30) return "Americas Region";
  if (lat < 0 && lng > -20 && lng < 55) return "African Region";
  
  return "International Waters / Other";
};

const normalizeSeverity = (sev) => {
  if (!sev) return "Low";
  const normalized = sev.charAt(0).toUpperCase() + sev.slice(1).toLowerCase();
  return SEVERITY_RADIUS[normalized] ? normalized : "Low";
};

const isValidCoordinateRange = (lat, lng) => {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return false;
  if (Math.abs(lat) < 0.1 && Math.abs(lng) < 0.1) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

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

/** Component that triggers invalidation recalculation sizes when fullscreen switches toggled */
const ResizeMapTrigger = ({ isFullscreen }) => {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => {
      map.invalidateSize();
    }, 200);
  }, [isFullscreen, map]);
  return null;
};

const LiveMap = () => {
  const routerLocation = useLocation();
  const focusId = routerLocation.state?.focusId;
  const mapFrameRef = useRef(null);

  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSeverities, setActiveSeverities] = useState(new Set(SEVERITY_ORDER));
  const [activeCountries, setActiveCountries] = useState(new Set());
  const [userLocation, setUserLocation] = useState([20, 0]);
  const [locationStatus, setLocationStatus] = useState("prompt");
  const [locationError, setLocationError] = useState("");
  const [allowGlobal, setAllowGlobal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const requestLocation = useCallback(() => {
    if (!navigator?.geolocation) {
      setLocationStatus("denied");
      setLocationError("Geolocation unavailable.");
      return;
    }
    setLocationStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserLocation([coords.latitude, coords.longitude]);
        setLocationStatus("granted");
      },
      () => {
        setLocationStatus("denied");
        setLocationError("Access to local position disabled.");
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }, []);

  const showLocationOverlay =
    locationStatus === "prompt" ||
    locationStatus === "requesting" ||
    (locationStatus === "denied" && !allowGlobal);

const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      mapFrameRef.current?.requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(err => console.error("Error enabling fullscreen:", err));
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Listens directly to standard browser window level changes (including the Escape key)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const activeElement = document.fullscreenElement || 
                            document.webkitFullscreenElement || 
                            document.mozFullScreenElement || 
                            document.msFullscreenElement;
      
      setIsFullscreen(!!activeElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      if (isRefresh) invalidateDashboardCache();
      const data = await getDashboard({ force: isRefresh });
      const list = Array.isArray(data?.all_incidents) ? data.all_incidents : [];
      setIncidents(list);
    } catch (err) {
      setError("Couldn't reach the Kavach analysis service.");
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

  const toggleCountry = (country) => {
    setActiveCountries((prev) => {
      const next = new Set(prev);
      next.has(country) ? next.delete(country) : next.add(country);
      return next;
    });
  };

  const processedIncidents = useMemo(() => {
    return incidents.map(i => ({
      ...i,
      severity: normalizeSeverity(i.severity),
      country: getOfflineCountry(i.latitude, i.longitude)
    }));
  }, [incidents]);

  const countryData = useMemo(() => {
    const list = {};
    processedIncidents.forEach((i) => {
      if (isValidCoordinateRange(i.latitude, i.longitude)) {
        list[i.country] = (list[i.country] || 0) + 1;
      }
    });
    return Object.entries(list).sort((a, b) => b[1] - a[1]);
  }, [processedIncidents]);

  const visibleIncidents = useMemo(() => {
    return processedIncidents.filter((i) => {
      const hasValidGeoRange = isValidCoordinateRange(i.latitude, i.longitude);
      const isSeverityActive = activeSeverities.has(i.severity);
      const isCountryActive = activeCountries.size === 0 || activeCountries.has(i.country);
      return hasValidGeoRange && isSeverityActive && isCountryActive;
    });
  }, [processedIncidents, activeSeverities, activeCountries]);

  const focusIncident = useMemo(
    () => processedIncidents.find((i) => i.id === focusId || i.incident_id === focusId),
    [processedIncidents, focusId]
  );

  const severityCounts = useMemo(() => {
    const out = { Low: 0, Moderate: 0, High: 0, Critical: 0 };
    processedIncidents.forEach((i) => { 
      if (isValidCoordinateRange(i.latitude, i.longitude)) {
        if (out[i.severity] !== undefined) out[i.severity] += 1; 
      }
    });
    return out;
  }, [processedIncidents]);

  return (
    <PageShell noFooter>
      <div className="v-dash-header">
        <div>
          <h1 className="v-dash-title">Live Map</h1>
          <p className="v-dash-subtitle">
            {loading ? "Loading incidents…" : `${visibleIncidents.length} of ${incidents.length} verified incidents shown`}
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

      <div className="v-filter-dashboard-panel">
        <div className="v-panel-col text-left">
          <span className="v-panel-title">Filter by Severity</span>
          <div className="v-map-legend">
            {SEVERITY_ORDER.map((sev) => (
              <button
                key={sev}
                className={`v-map-legend-chip ${activeSeverities.has(sev) ? "active" : ""}`}
                style={{ "--chip-color": SEVERITY_STROKE[sev] }}
                onClick={() => toggleSeverity(sev)}
              >
                <span className="v-map-legend-dot" />
                <span className="v-chip-text-label">{sev}</span> 
                <span className="v-chip-count">({severityCounts[sev]})</span>
              </button>
            ))}
          </div>
        </div>

        <div className="v-panel-col text-left">
          <div className="v-panel-title-wrapper">
            <span className="v-panel-title">Filter by Country Location</span>
            {activeCountries.size > 0 && (
              <button className="v-panel-reset-btn" onClick={() => setActiveCountries(new Set())}>
                Reset Selection
              </button>
            )}
          </div>
          <div className="v-country-wrap-grid">
            {countryData.map(([country, count]) => (
              <button
                key={country}
                className={`v-country-badge ${activeCountries.has(country) ? "active" : ""}`}
                onClick={() => toggleCountry(country)}
              >
                <Globe size={12} />
                <span className="v-country-label-txt">{country}</span>
                <span className="v-country-count-val">{count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Map Element Container Canvas Frame with React Ref hook bindings */}
      <div className={`v-map-frame ${isFullscreen ? "is-fullscreen" : ""}`} ref={mapFrameRef}>
        
        {/* Native Floating UI Fullscreen Trigger Button control element */}
        <button className="v-map-fullscreen-trigger" onClick={toggleFullscreen} title="Toggle Fullscreen View">
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>

        {(showLocationOverlay || loading) && (
          <div className="v-loading-overlay">
            <span className="v-loading-spinner" />
            <div className="v-overlay-card">
              <p>{loading ? "Loading map incidents…" : "Allow location access to center map."}</p>
              <div className="v-overlay-actions">
                {!loading && (
                  <button className="v-btn v-btn-primary" onClick={requestLocation}>
                    Allow location
                  </button>
                )}
                {!loading && (
                  <button className="v-btn" onClick={() => setAllowGlobal(true)}>
                    Continue Without Location
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
          preferCanvas={true}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ResizeMapTrigger isFullscreen={isFullscreen} />
          {locationStatus === "granted" && <FlyToCenter center={userLocation} zoom={6} />}
          {focusIncident && <FlyToIncident incident={focusIncident} />}
          {visibleIncidents.map((incident) => {
            const currentId = incident.incident_id ?? incident.id;
            return (
              <CircleMarker
                key={currentId}
                center={[incident.latitude, incident.longitude]}
                radius={SEVERITY_RADIUS[incident.severity] || 7}
                pathOptions={{
                  color: SEVERITY_STROKE[incident.severity] || "#64748b",
                  fillColor: SEVERITY_STROKE[incident.severity] || "#64748b",
                  fillOpacity: 0.45,
                  weight: 1.5,
                }}
              >
                <Popup>
                  <div className="v-map-popup">
                    <div className="v-map-popup-header">
                      <SeverityBadge severity={normalizeSeverity(incident.severity)} size="sm" />
                      <span className="v-map-popup-country-tag">{incident.country}</span>
                    </div>
                    <h4>{incident.title || "Untitled Incident"}</h4>
                    <div className="v-map-popup-meta v-mono">
                      {incident.category || "Unknown Category"} · {incident.source || "Unknown Source"}
                    </div>
                    {incident.description && (
                      <p className="v-map-popup-desc">{incident.description.slice(0, 220)}</p>
                    )}
                    <div className="v-map-popup-coords v-mono">
                      {incident.latitude?.toFixed(3)}, {incident.longitude?.toFixed(3)}
                    </div>
                    {incident.url && (
                      <a href={incident.url} target="_blank" rel="noopener noreferrer" className="v-map-popup-link">
                        Source Material <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </PageShell>
  );
};

export default LiveMap;