import React from "react";
import "./varunaCommon.css";
import { SEVERITY_ORDER } from "./severityConfig";

const CLASS_BY_SEVERITY = {
  Low: "v-sev-low",
  Moderate: "v-sev-moderate",
  High: "v-sev-high",
  Critical: "v-sev-critical",
};

/** Small colored pill: "● Critical" */
export const SeverityBadge = ({ severity, size = "md" }) => {
  const cls = CLASS_BY_SEVERITY[severity] || "v-sev-moderate";
  return (
    <span className={`v-badge ${cls} v-badge-${size}`}>
      <span className="v-badge-dot" />
      {severity || "Unknown"}
    </span>
  );
};

/** Numeric priority score, color-matched to severity, monospace */
export const PriorityScore = ({ score, severity }) => {
  const cls = CLASS_BY_SEVERITY[severity] || "v-sev-moderate";
  return (
    <span className={`v-priority-score v-mono ${cls}`}>
      {typeof score === "number" ? score : "—"}
    </span>
  );
};

/**
 * Segmented horizontal bar showing the proportion of each severity level.
 * This is the signature visual of the dashboard — one glance tells you
 * the shape of the current incident landscape.
 */
export const SeverityBreakdownBar = ({ breakdown = {} }) => {
  const total = SEVERITY_ORDER.reduce((sum, key) => sum + (breakdown[key] || 0), 0);
  if (!total) {
    return <div className="v-spectrum-empty">No severity data yet</div>;
  }
  return (
    <div className="v-spectrum">
      <div className="v-spectrum-bar">
        {SEVERITY_ORDER.map((key) => {
          const value = breakdown[key] || 0;
          if (!value) return null;
          const pct = (value / total) * 100;
          return (
            <div
              key={key}
              className={`v-spectrum-segment ${CLASS_BY_SEVERITY[key]}`}
              style={{ width: `${pct}%` }}
              title={`${key}: ${value}`}
            />
          );
        })}
      </div>
      <div className="v-spectrum-legend">
        {SEVERITY_ORDER.map((key) => (
          <div key={key} className="v-spectrum-legend-item">
            <span className={`v-badge-dot ${CLASS_BY_SEVERITY[key]}`} />
            <span className="v-spectrum-legend-label">{key}</span>
            <span className="v-spectrum-legend-value v-mono">{breakdown[key] || 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/** Simple horizontal bar list for category / source breakdowns */
/** Confidence score badge — colored by confidence level */
export const ConfidenceBadge = ({ confidence }) => {
  if (confidence == null) return null;
  const pct = Math.round(confidence * 100);
  const level = confidence >= 0.7 ? "high" : confidence >= 0.4 ? "medium" : "low";
  return (
    <span className={`v-confidence-badge v-confidence-${level}`} title={`Agent confidence: ${pct}%`}>
      {pct}% confidence
    </span>
  );
};

export const RankedBarList = ({ data = {}, accent = "var(--v-primary)" }) => {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] : 0;
  if (!entries.length) {
    return <div className="v-spectrum-empty">No data yet</div>;
  }
  return (
    <div className="v-ranked-list">
      {entries.map(([label, value]) => (
        <div className="v-ranked-row" key={label}>
          <span className="v-ranked-label">{label}</span>
          <div className="v-ranked-track">
            <div
              className="v-ranked-fill"
              style={{ width: `${max ? (value / max) * 100 : 0}%`, background: accent }}
            />
          </div>
          <span className="v-ranked-value v-mono">{value}</span>
        </div>
      ))}
    </div>
  );
};
