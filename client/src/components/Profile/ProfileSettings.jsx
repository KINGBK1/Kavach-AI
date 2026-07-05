import React, { useContext, useState, useEffect, useRef, useCallback } from "react";
import { LogOut, Mail, Shield, MapPin, Crosshair, Save, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { AuthContext } from "../Auth/context/authContextValue";
import { updateProfile } from "../../api/varunaApi";
import PageShell from "../Layout/PageShell";
import "./ProfileSettings.css";

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

function DraggableMarker({ position, onMove }) {
  const markerRef = useRef(null);
  useMapEvents({
    click(e) {
      onMove(e.latlng);
    },
  });
  return (
    <Marker
      position={position}
      draggable={true}
      icon={defaultIcon}
      ref={markerRef}
      eventHandlers={{
        dragend() {
          const marker = markerRef.current;
          if (marker) {
            onMove(marker.getLatLng());
          }
        },
      }}
    />
  );
}

const ProfileSettings = () => {
  const navigate = useNavigate();
  const { user, logout, setUser } = useContext(AuthContext);

  const [lat, setLat] = useState(user?.latitude ?? null);
  const [lng, setLng] = useState(user?.longitude ?? null);
  const [prefs, setPrefs] = useState(
    user?.preferences ?? { emailAlerts: true, smsAlerts: false, pushNotifications: true, weatherAlerts: true, emergencyAlerts: true }
  );
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [geoError, setGeoError] = useState(null);

  useEffect(() => {
    if (user?.latitude != null && user?.longitude != null) {
      setLat(user.latitude);
      setLng(user.longitude);
    }
    if (user?.preferences) {
      setPrefs((prev) => ({ ...prev, ...user.preferences }));
    }
  }, [user?.latitude, user?.longitude, user?.preferences]);

  const detectLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation not supported by your browser.");
      return;
    }
    setDetecting(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setDetecting(false);
      },
      (err) => {
        setGeoError(err.message);
        setDetecting(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const result = await updateProfile({
        latitude: lat,
        longitude: lng,
        preferences: prefs,
      });
      if (result.user) {
        setUser((prev) => ({
          ...prev,
          latitude: result.user.latitude,
          longitude: result.user.longitude,
          preferences: result.user.preferences,
        }));
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to update profile:", err);
    } finally {
      setSaving(false);
    }
  };

  const hasLocationChanged =
    lat !== (user?.latitude ?? null) || lng !== (user?.longitude ?? null);

  const handleLogout = () => {
    logout();
    navigate("/signin");
  };

  const togglePref = (key) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const center = lat != null && lng != null ? [lat, lng] : [20.5937, 78.9629];

  return (
    <PageShell noFooter>
      <div className="v-dash-header">
        <div>
          <h1 className="v-dash-title">Profile</h1>
          <p className="v-dash-subtitle">Manage your account and alert preferences.</p>
        </div>
      </div>

      <div className="v-panel v-profile-card">
        <div className="v-profile-avatar">
          {user?.avatar ? (
            <img src={user.avatar} alt={user.name} />
          ) : (
            <span>{(user?.name || "U").charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="v-profile-info">
          <h3>{user?.name || "Loading\u2026"}</h3>
          <div className="v-profile-row"><Mail size={14} /> {user?.email || "\u2014"}</div>
          <div className="v-profile-row"><Shield size={14} /> {user?.role || "user"}</div>
        </div>
        <button className="v-btn" onClick={handleLogout}>
          <LogOut size={16} /> Sign out
        </button>
      </div>

      <div className="v-panel v-profile-location-section">
        <h3><MapPin size={16} /> Your Location</h3>
        <p style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: 12 }}>
          Set your location so we can alert you when a disaster occurs nearby.
        </p>

        <div className="v-profile-map-container">
          <MapContainer center={center} zoom={lat != null ? 10 : 4} scrollWheelZoom={true} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {lat != null && lng != null && (
              <DraggableMarker
                position={[lat, lng]}
                onMove={(ll) => { setLat(ll.lat); setLng(ll.lng); }}
              />
            )}
          </MapContainer>
        </div>

        <div className="v-profile-coords">
          {lat != null && lng != null
            ? `${lat.toFixed(6)}, ${lng.toFixed(6)}`
            : "Location not set \u2014 click 'Detect' or tap the map"}
        </div>

        {geoError && (
          <p style={{ color: "#dc2626", fontSize: "0.8rem", marginBottom: 8 }}>{geoError}</p>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="v-btn"
            onClick={detectLocation}
            disabled={detecting}
          >
            {detecting ? (
              <Loader2 size={16} className="button__spinner" />
            ) : (
              <Crosshair size={16} />
            )}
            <span>{detecting ? "Detecting\u2026" : "Auto-detect"}</span>
          </button>

          <button
            className="v-btn v-btn-primary"
            onClick={handleSave}
            disabled={saving || (lat == null && lng == null) || (!hasLocationChanged && !saved)}
          >
            {saving ? (
              <Loader2 size={16} className="button__spinner" />
            ) : (
              <Save size={16} />
            )}
            <span>{saving ? "Saving\u2026" : saved ? "Saved!" : "Save Location"}</span>
          </button>
        </div>
      </div>

      <div className="v-panel v-profile-prefs">
        <h3>Alert Preferences</h3>
        {[
          { key: "emailAlerts", label: "Email Alerts", desc: "Receive disaster alerts via email" },
          { key: "smsAlerts", label: "SMS Alerts", desc: "Receive alerts via SMS" },
          { key: "pushNotifications", label: "Push Notifications", desc: "In-app browser notifications" },
          { key: "weatherAlerts", label: "Weather Alerts", desc: "Weather-based warnings and forecasts" },
          { key: "emergencyAlerts", label: "Emergency Alerts", desc: "Critical emergency broadcasts" },
        ].map(({ key, label, desc }) => (
          <div key={key} className="v-pref-toggle">
            <div>
              <div className="v-pref-label">{label}</div>
              <div className="v-pref-desc">{desc}</div>
            </div>
            <label className="v-toggle-switch">
              <input
                type="checkbox"
                checked={prefs[key] ?? false}
                onChange={() => togglePref(key)}
              />
              <span className="v-toggle-slider" />
            </label>
          </div>
        ))}
      </div>
    </PageShell>
  );
};

export default ProfileSettings;
