// src/components/LiveMap/ProximityAlertModal.jsx
//
// Shown when the user's live GPS position enters the danger radius of a
// High/Critical incident. Fires once per zone (won't re-trigger every
// position update while you're still inside the same zone), and resets so
// it can fire again if you leave and re-enter, or a new zone appears.

import React from "react";
import { AlertTriangle, X, MapPin, Navigation } from "lucide-react";
import "./ProximityAlertModal.css";

const ProximityAlertModal = ({ incident, distanceKm, onDismiss, onViewOnMap }) => {
  if (!incident) return null;

  const severity = incident.severity || "High";

  return (
    <div className="v-proximity-modal-backdrop" role="alertdialog" aria-modal="true">
      <div className={`v-proximity-modal v-proximity-sev-${severity.toLowerCase()}`}>
        <button className="v-proximity-modal-close" onClick={onDismiss} aria-label="Dismiss alert">
          <X size={16} />
        </button>

        <div className="v-proximity-modal-icon-ring">
          <AlertTriangle size={28} />
        </div>

        <h3 className="v-proximity-modal-title">Disaster zone nearby</h3>
        <p className="v-proximity-modal-subtitle">
          You are approximately <strong>{distanceKm.toFixed(1)} km</strong> from an active {severity.toLowerCase()}-severity incident.
        </p>

        <div className="v-proximity-modal-incident-card">
          <div className="v-proximity-modal-incident-head">
            <span className={`v-proximity-sev-chip v-proximity-sev-${severity.toLowerCase()}`}>{severity}</span>
            <span className="v-proximity-modal-category">{incident.category || "Unclassified"}</span>
          </div>
          <h4>{incident.title || "Untitled incident"}</h4>
          {incident.summary && <p className="v-proximity-modal-desc">{incident.summary}</p>}
        </div>

        <div className="v-proximity-modal-actions">
          <button className="v-btn v-btn-primary" onClick={onViewOnMap}>
            <MapPin size={14} /> View on map
          </button>
          <button className="v-btn" onClick={onDismiss}>
            Dismiss
          </button>
        </div>

        <p className="v-proximity-modal-footnote">
          <Navigation size={11} /> Based on your device's current location. Stay alert and follow local authority guidance.
        </p>
      </div>
    </div>
  );
};

export default ProximityAlertModal;