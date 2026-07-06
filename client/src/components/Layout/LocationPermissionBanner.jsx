import React, { useContext } from "react";
import { MapPin } from "lucide-react";
import { AuthContext } from "../Auth/context/authContextValue";
import "./LocationPermissionBanner.css";

/**
 * Shown on every authenticated page when we don't have the user's location.
 * Without this, the mail service's nearby-user query (see mailservice/app/
 * geolocation.py find_nearby_users) has nothing to match against, so
 * disaster alerts silently never reach anyone. Browser auto-capture on
 * login already tries once (AuthContext) — this exists specifically for
 * when that attempt fails (permission denied, non-HTTPS, timeout) so the
 * gap is visible instead of a silent, permanent no-op.
 */
const LocationPermissionBanner = () => {
  const { locationPromptNeeded, retryLocationCapture } = useContext(AuthContext);

  if (!locationPromptNeeded) return null;

  return (
    <div className="v-location-banner">
      <MapPin size={16} />
      <span>
        We couldn't detect your location, so you won't receive disaster alerts for your area.
      </span>
      <button onClick={retryLocationCapture} className="v-location-banner-btn">
        Enable location
      </button>
    </div>
  );
};

export default LocationPermissionBanner;