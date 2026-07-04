import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { useLocation } from "react-router-dom";
import {
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Globe,
  Maximize2,
  Minimize2,
  Search,
  X,
  Layers,
  Navigation,
  Clock,
  LocateFixed
} from "lucide-react";
import PageShell from "../Layout/PageShell";
import { getDashboard, invalidateDashboardCache } from "../../api/varunaApi";
import { SeverityBadge } from "../common/Severity";
import { SEVERITY_ORDER } from "../common/severityConfig";
import ProximityAlertModal from "./ProximityAlertModal";
import "./LiveMap.css";
import "./ProximityAlertModal.css";

const SEVERITY_RADIUS = { Low: 6, Moderate: 8, High: 10, Critical: 13 };
const SEVERITY_STROKE = {
  Low: "#16a34a",
  Moderate: "#ca8a04",
  High: "#ea580c",
  Critical: "#dc2626",
};

// How close (km) the user has to be to a High/Critical incident before the
// proximity alert modal fires.
const PROXIMITY_ALERT_RADIUS_KM = 15;
// Only High/Critical incidents trigger the alert — Low/Moderate zones
// aren't urgent enough to interrupt the user.
const PROXIMITY_ALERT_SEVERITIES = new Set(["High", "Critical"]);

const BASEMAPS = {
  streets: {
    label: "Streets",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors"
  },
  satellite: {
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri"
  },
  terrain: {
    label: "Terrain",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenTopoMap contributors"
  }
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

// Haversine distance in km between two lat/lng points — used both for the
// "nearest incident" proximity check and for the distance shown in the
// alert modal.
const distanceKm = (lat1, lng1, lat2, lng2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const timeAgo = (isoLike) => {
  if (!isoLike) return "";
  const then = new Date(isoLike.replace(" ", "T"));
  if (Number.isNaN(then.getTime())) return "";
  const diffMs = Date.now() - then.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

const FlyToIncident = ({ incident }) => {
  const map = useMap();
  useEffect(() => {
    if (incident?.latitude != null && incident?.longitude != null) {
      map.flyTo([incident.latitude, incident.longitude], 8, { duration: 0.8 });
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

/** Recalculates Leaflet's internal size cache after the container's
 *  dimensions change (fullscreen toggle, sidebar collapse, etc). Without
 *  this, tiles render into the old container size and leave gray gaps. */
const ResizeMapTrigger = ({ watch }) => {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(t);
  }, [watch, map]);
  return null;
};

const LiveMap = () => {
  const routerLocation = useLocation();
  // Support both the id-only focus (older callers) and the explicit
  // lat/lng focus (dashboard "Locate" button) so a focus request always
  // has real coordinates to fly to, even if the incident list hasn't
  // finished loading yet or the id doesn't match for some reason.
  const focusId = routerLocation.state?.focusId;
  const focusLatFromState = routerLocation.state?.focusLat;
  const focusLngFromState = routerLocation.state?.focusLng;
  const mapFrameRef = useRef(null);

  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSeverities, setActiveSeverities] = useState(new Set(SEVERITY_ORDER));
  const [activeCountries, setActiveCountries] = useState(new Set());
  const [userLocation, setUserLocation] = useState([20, 0]);
  const [locationStatus, setLocationStatus] = useState("prompt");
  const [allowGlobal, setAllowGlobal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [basemap, setBasemap] = useState("streets");
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Tracks whether an explicit "focus" navigation (from the dashboard's
  // Locate button, a search jump, etc.) is in flight. While true, the
  // GPS-driven FlyToCenter is suppressed so it can't win the race and snap
  // the map back to the user's own location instead of the incident that
  // was clicked.
  const [hasPendingFocus, setHasPendingFocus] = useState(
    Boolean(focusId || (focusLatFromState != null && focusLngFromState != null))
  );

  // Proximity alert state
  const [nearbyZone, setNearbyZone] = useState(null); // { incident, distanceKm }
  const [dismissedZoneIds, setDismissedZoneIds] = useState(new Set());
  const [liveUserCoords, setLiveUserCoords] = useState(null);
  const watchIdRef = useRef(null);

  const requestLocation = useCallback(() => {
    if (!navigator?.geolocation) {
      setLocationStatus("denied");
      return;
    }
    setLocationStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserLocation([coords.latitude, coords.longitude]);
        setLiveUserCoords([coords.latitude, coords.longitude]);
        setLocationStatus("granted");
      },
      () => setLocationStatus("denied"),
      { timeout: 10000, enableHighAccuracy: true }
    );
  }, []);

  // Continuously watch the user's position (not just a one-shot fetch) so
  // the proximity check stays accurate as they move, without needing a
  // page refresh. This is intentionally separate from requestLocation's
  // one-shot getCurrentPosition, which only centers the map once.
  useEffect(() => {
    if (locationStatus !== "granted" || !navigator?.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setLiveUserCoords([coords.latitude, coords.longitude]);
      },
      () => {
        /* silently ignore watch errors — the one-shot location still stands */
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [locationStatus]);

  const showLocationOverlay =
    locationStatus === "prompt" ||
    locationStatus === "requesting" ||
    (locationStatus === "denied" && !allowGlobal);

  // Single source of truth for entering/exiting fullscreen. We no longer
  // trust the async .then() to set state — the fullscreenchange listener
  // below is now the *only* place isFullscreen gets flipped, so state can
  // never drift out of sync with the real DOM fullscreen element (this
  // drift was the root cause of the control button disappearing: the
  // button's visibility/position depended on isFullscreen, and if the
  // event fired before the promise resolved, or the promise rejected
  // silently, the two could disagree indefinitely).
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      mapFrameRef.current?.requestFullscreen?.().catch((err) => {
        console.error("Error enabling fullscreen:", err);
      });
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const activeElement =
        document.fullscreenElement ||
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

  // Escape key also exits fullscreen on some browsers without firing a
  // fullscreenchange event reliably before repaint — keep state in sync.
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape" && document.fullscreenElement) {
        document.exitFullscreen?.();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      if (isRefresh) invalidateDashboardCache();
      const data = await getDashboard({ force: isRefresh });
      const list = Array.isArray(data?.all_incidents) ? data.all_incidents : [];
      setIncidents(list);
      setLastUpdated(new Date());
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

  // Auto-refresh every 3 minutes so the map stays live without manual polling.
  useEffect(() => {
    const interval = setInterval(() => load(true), 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

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
    return incidents.map((i) => ({
      ...i,
      severity: normalizeSeverity(i.severity),
      country: getOfflineCountry(i.latitude, i.longitude),
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

  const searchedIncidents = useMemo(() => {
    if (!searchTerm.trim()) return processedIncidents;
    const q = searchTerm.trim().toLowerCase();
    return processedIncidents.filter((i) =>
      [i.title, i.category, i.source, i.country].filter(Boolean).some((f) => f.toLowerCase().includes(q))
    );
  }, [processedIncidents, searchTerm]);

  const visibleIncidents = useMemo(() => {
    return searchedIncidents.filter((i) => {
      const hasValidGeoRange = isValidCoordinateRange(i.latitude, i.longitude);
      const isSeverityActive = activeSeverities.has(i.severity);
      const isCountryActive = activeCountries.size === 0 || activeCountries.has(i.country);
      return hasValidGeoRange && isSeverityActive && isCountryActive;
    });
  }, [searchedIncidents, activeSeverities, activeCountries]);

  // Resolve the incident to fly to: prefer an id match against the loaded
  // list (gives us the full incident record for the popup), but fall back
  // to a synthetic incident built directly from the coordinates passed in
  // router state — this is what fixes "Locate" always landing on your own
  // position: even if the id lookup misses (list still loading, id shape
  // mismatch, etc.) we still have real coordinates to fly to.
  const focusIncident = useMemo(() => {
    const byId = processedIncidents.find((i) => i.id === focusId || i.incident_id === focusId);
    if (byId) return byId;
    if (focusLatFromState != null && focusLngFromState != null) {
      return {
        incident_id: focusId || "focus-target",
        latitude: focusLatFromState,
        longitude: focusLngFromState,
      };
    }
    return null;
  }, [processedIncidents, focusId, focusLatFromState, focusLngFromState]);

  useEffect(() => {
    if (focusIncident) {
      setHasPendingFocus(true);
    }
  }, [focusIncident]);

  const severityCounts = useMemo(() => {
    const out = { Low: 0, Moderate: 0, High: 0, Critical: 0 };
    processedIncidents.forEach((i) => {
      if (isValidCoordinateRange(i.latitude, i.longitude)) {
        if (out[i.severity] !== undefined) out[i.severity] += 1;
      }
    });
    return out;
  }, [processedIncidents]);

  const searchMatchToFly = useMemo(() => {
    if (!searchTerm.trim() || visibleIncidents.length !== 1) return null;
    return visibleIncidents[0];
  }, [searchTerm, visibleIncidents]);

  const clearAllFilters = () => {
    setActiveSeverities(new Set(SEVERITY_ORDER));
    setActiveCountries(new Set());
    setSearchTerm("");
  };

  const hasActiveFilters =
    activeCountries.size > 0 || activeSeverities.size < SEVERITY_ORDER.length || searchTerm.trim().length > 0;

  // --- Proximity disaster-zone detection ----------------------------------
  // Runs whenever the user's live position or the incident list changes.
  // Finds the nearest High/Critical incident; if it's within the alert
  // radius and hasn't already been dismissed/shown for this zone, surface
  // the modal. Moving away and coming back re-triggers it (the dismissed
  // set is cleared once you leave the radius).
  useEffect(() => {
    if (!liveUserCoords || !processedIncidents.length) return;

    const [uLat, uLng] = liveUserCoords;
    let closest = null;
    let closestDist = Infinity;

    processedIncidents.forEach((incident) => {
      if (!PROXIMITY_ALERT_SEVERITIES.has(incident.severity)) return;
      if (!isValidCoordinateRange(incident.latitude, incident.longitude)) return;
      const d = distanceKm(uLat, uLng, incident.latitude, incident.longitude);
      if (d < closestDist) {
        closestDist = d;
        closest = incident;
      }
    });

    if (!closest || closestDist > PROXIMITY_ALERT_RADIUS_KM) {
      // User is outside every danger radius — clear dismissal memory so a
      // future re-entry (to this or another zone) can alert again.
      if (dismissedZoneIds.size > 0) setDismissedZoneIds(new Set());
      if (nearbyZone) setNearbyZone(null);
      return;
    }

    const zoneKey = closest.incident_id ?? closest.id;
    if (dismissedZoneIds.has(zoneKey)) return;

    setNearbyZone({ incident: closest, distanceKm: closestDist });
  }, [liveUserCoords, processedIncidents, dismissedZoneIds, nearbyZone]);

  const dismissProximityAlert = () => {
    if (nearbyZone?.incident) {
      const zoneKey = nearbyZone.incident.incident_id ?? nearbyZone.incident.id;
      setDismissedZoneIds((prev) => new Set(prev).add(zoneKey));
    }
    setNearbyZone(null);
  };

  const viewProximityZoneOnMap = () => {
    if (nearbyZone?.incident) {
      setSelectedIncident(nearbyZone.incident);
      setHasPendingFocus(true);
    }
    dismissProximityAlert();
  };

  return (
    <PageShell noFooter>
      {nearbyZone && (
        <ProximityAlertModal
          incident={nearbyZone.incident}
          distanceKm={nearbyZone.distanceKm}
          onDismiss={dismissProximityAlert}
          onViewOnMap={viewProximityZoneOnMap}
        />
      )}

      <div className="v-dash-header">
        <div>
          <h1 className="v-dash-title">Live Map</h1>
          <p className="v-dash-subtitle">
            {loading
              ? "Loading incidents…"
              : `${visibleIncidents.length} of ${incidents.length} verified incidents shown`}
            {!loading && lastUpdated && (
              <span className="v-dash-subtitle-meta">
                <Clock size={12} /> Updated {timeAgo(lastUpdated.toISOString())}
              </span>
            )}
          </p>
        </div>
        <div className="v-dash-header-actions">
          {hasActiveFilters && (
            <button className="v-btn" onClick={clearAllFilters}>
              <X size={14} /> Clear filters
            </button>
          )}
          <button className="v-btn v-btn-primary" onClick={() => load(true)} disabled={loading}>
            {loading ? <span className="v-loading-spinner" /> : <RefreshCw size={16} />}
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="v-alert-banner">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button className="v-btn" onClick={() => load()}>Retry</button>
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
            <span className="v-panel-title">Search Incidents</span>
          </div>
          <div className="v-map-search-box">
            <Search size={14} className="v-map-search-icon" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Title, category, source, or country…"
              className="v-map-search-input"
            />
            {searchTerm && (
              <button className="v-map-search-clear" onClick={() => setSearchTerm("")} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
          {searchMatchToFly && (
            <button
              className="v-map-search-jump"
              onClick={() => {
                setSelectedIncident(searchMatchToFly);
                setHasPendingFocus(true);
              }}
            >
              <Navigation size={12} /> Jump to match: {searchMatchToFly.title}
            </button>
          )}
        </div>

        <div className="v-panel-col text-left">
          <div className="v-panel-title-wrapper">
            <span className="v-panel-title">Filter by Country</span>
            {activeCountries.size > 0 && (
              <button className="v-panel-reset-btn" onClick={() => setActiveCountries(new Set())}>
                Reset
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

      {/* Map Element Container Canvas Frame */}
      <div className={`v-map-frame ${isFullscreen ? "is-fullscreen" : ""}`} ref={mapFrameRef}>

        {/* Control cluster lives in its own always-on-top overlay layer,
            independent of Leaflet's internal panes, so it can never be
            occluded by tile/control z-index changes on fullscreen toggle. */}
        <div className="v-map-controls-overlay">
          <button
            className="v-map-control-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            aria-label="Toggle fullscreen"
          >
            {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>

          <div className="v-map-layer-switcher">
            <button
              className="v-map-control-btn"
              onClick={() => setShowLayerMenu((v) => !v)}
              title="Change base map"
              aria-label="Change base map"
            >
              <Layers size={17} />
            </button>
            {showLayerMenu && (
              <div className="v-map-layer-menu">
                {Object.entries(BASEMAPS).map(([key, cfg]) => (
                  <button
                    key={key}
                    className={`v-map-layer-option ${basemap === key ? "active" : ""}`}
                    onClick={() => {
                      setBasemap(key);
                      setShowLayerMenu(false);
                    }}
                  >
                    {cfg.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {locationStatus === "granted" && (
            <button
              className="v-map-control-btn"
              onClick={() => {
                // Recentering on "me" is now an explicit focus action too,
                // so it correctly overrides any pending incident focus and
                // is the ONLY thing that flies back to the user.
                setHasPendingFocus(false);
                setSelectedIncident(null);
                setUserLocation((loc) => [...loc]);
              }}
              title="Recenter on my location"
              aria-label="Recenter on my location"
            >
              <Navigation size={16} />
            </button>
          )}
        </div>

        {(showLocationOverlay || loading) && (
          <div className="v-loading-overlay">
            <span className="v-loading-spinner" />
            <div className="v-overlay-card">
              <p>{loading ? "Loading map incidents…" : "Allow location access to center the map on you."}</p>
              <div className="v-overlay-actions">
                {!loading && (
                  <button className="v-btn v-btn-primary" onClick={requestLocation}>
                    Allow location
                  </button>
                )}
                {!loading && (
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
          preferCanvas={true}
        >
          <TileLayer
            key={basemap}
            attribution={BASEMAPS[basemap].attribution}
            url={BASEMAPS[basemap].url}
          />
          <ResizeMapTrigger watch={isFullscreen} />

          {/* GPS auto-center is suppressed whenever an explicit focus
              (Locate button, search jump, proximity "View on map") is
              pending — this is what stops the map snapping back to the
              user's own position instead of the incident they asked for. */}
          {locationStatus === "granted" && !hasPendingFocus && (
            <FlyToCenter center={userLocation} zoom={6} />
          )}
          {hasPendingFocus && focusIncident && <FlyToIncident incident={focusIncident} />}
          {hasPendingFocus && selectedIncident && <FlyToIncident incident={selectedIncident} />}

          {/* User's own live location — a distinct marker + accuracy halo
              so it's visually obvious which dot is "you" versus incidents. */}
          {locationStatus === "granted" && liveUserCoords && (
            <>
              <CircleMarker
                center={liveUserCoords}
                radius={16}
                pathOptions={{
                  color: "#2563eb",
                  fillColor: "#2563eb",
                  fillOpacity: 0.12,
                  weight: 0,
                }}
              />
              <CircleMarker
                center={liveUserCoords}
                radius={7}
                pathOptions={{
                  color: "#ffffff",
                  fillColor: "#2563eb",
                  fillOpacity: 1,
                  weight: 3,
                }}
                className="v-user-location-marker"
              >
                <Popup>
                  <div className="v-map-popup">
                    <strong>Your current location</strong>
                    <div className="v-map-popup-coords v-mono">
                      {liveUserCoords[0].toFixed(4)}, {liveUserCoords[1].toFixed(4)}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            </>
          )}

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
                  fillOpacity: 0.5,
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
                    {incident.analyzed_at && (
                      <div className="v-map-popup-time v-mono">{timeAgo(incident.analyzed_at)}</div>
                    )}
                    {incident.description && (
                      <p className="v-map-popup-desc">{incident.description.slice(0, 220)}</p>
                    )}
                    <div className="v-map-popup-coords v-mono">
                      {incident.latitude?.toFixed(3)}, {incident.longitude?.toFixed(3)}
                    </div>
                    {incident.url && (
                      <a href={incident.url} target="_blank" rel="noopener noreferrer" className="v-map-popup-link">
                        Source material <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>

        {/* Compact always-visible legend, useful once controls/filters are
            scrolled out of view or the map is fullscreen. Includes an
            entry for "You" so the blue dot is self-explanatory. */}
        <div className="v-map-mini-legend">
          {locationStatus === "granted" && (
            <div className="v-map-mini-legend-item">
              <span className="v-map-mini-legend-dot v-map-mini-legend-you-dot" />
              <LocateFixed size={11} style={{ marginRight: 2 }} /> You
            </div>
          )}
          {SEVERITY_ORDER.map((sev) => (
            <div key={sev} className="v-map-mini-legend-item">
              <span className="v-map-mini-legend-dot" style={{ backgroundColor: SEVERITY_STROKE[sev] }} />
              {sev}
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
};

export default LiveMap;