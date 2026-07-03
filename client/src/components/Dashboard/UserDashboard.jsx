import React, { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  Radio,
  Layers,
  Siren,
  Clock,
  MapPin,
  AlertCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import PageShell from "../Layout/PageShell";
import { getDashboard } from "../../api/varunaApi";
import { lookUpLocationName } from "../../utils/geolocation";
import {
  SeverityBadge,
  PriorityScore,
  SeverityBreakdownBar,
  RankedBarList,
} from "../common/Severity";
import "./UserDashboard.css";

const StatCard = ({ label, value, loading }) => (
  <div className="v-stat-card">
    <div className="v-stat-label">{label}</div>
    {loading ? (
      <div className="v-skeleton" style={{ height: 32, width: "60%", marginTop: 8 }} />
    ) : (
      <div className="v-stat-value">{value}</div>
    )}
  </div>
);

const timeAgo = (isoLike) => {
  if (!isoLike) return "";
  const then = new Date(isoLike.replace(" ", "T"));
  if (Number.isNaN(then.getTime())) return isoLike;
  const diffMs = Date.now() - then.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

const UserDashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [locationLabels, setLocationLabels] = useState({});

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const result = await getDashboard({ force: isRefresh });
      setData(result);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to load dashboard:", err);
      setError(
        err?.code === "ECONNABORTED"
          ? "The analysis service timed out. Try again in a moment."
          : "Couldn't reach the Kavach analysis service. Check that the backend is running."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const pending = (data?.top_critical_incidents || []).filter(
      (incident) =>
        incident.latitude != null &&
        incident.longitude != null &&
        !locationLabels[incident.incident_id]
    );

    if (!pending.length) return;

    let active = true;
    const loadLabels = async () => {
      const labels = {};
      await Promise.all(
        pending.map(async (incident) => {
          const label = await lookUpLocationName(incident.latitude, incident.longitude);
          if (active) {
            labels[incident.incident_id] = label;
          }
        })
      );
      if (active) {
        setLocationLabels((prev) => ({ ...prev, ...labels }));
      }
    };

    loadLabels();
    return () => {
      active = false;
    };
  }, [data?.top_critical_incidents, locationLabels]);

  const summary = data?.summary || {};
  const severityBreakdown = data?.severity_breakdown || {};
  const categoryBreakdown = data?.category_breakdown || {};
  const sourceBreakdown = data?.source_breakdown || {};
  const criticalIncidents = data?.top_critical_incidents || [];
  const recentAnalyses = data?.recent_analyses || [];

  return (
    <PageShell>
      <div className="v-dash-header">
        <div>
          <h1 className="v-dash-title">Command Dashboard</h1>
          <p className="v-dash-subtitle">
            Live synthesis of incidents pulled from NASA EONET, USGS, GDACS and Bluesky, scored by Kavach AI.
          </p>
        </div>
        <div className="v-dash-header-actions">
          {lastUpdated && (
            <span className="v-dash-updated v-mono">
              Updated {timeAgo(lastUpdated.toISOString())}
            </span>
          )}
          <button className="v-btn v-btn-primary" onClick={() => load(true)} disabled={refreshing}>
            {refreshing ? <span className="v-loading-spinner" /> : <RefreshCw size={16} />}
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

      <div className="v-stat-strip">
        <StatCard label="Total Incidents" value={summary.total_incidents ?? "—"} loading={loading} />
        <StatCard label="Analyzed by AI" value={summary.total_analyzed ?? "—"} loading={loading} />
        <StatCard
          label="Average Priority Score"
          value={summary.average_priority_score != null ? summary.average_priority_score.toFixed(1) : "—"}
          loading={loading}
        />
      </div>

      <div className="v-panel v-spectrum-panel">
        {loading && !error && (
          <div className="v-loading-overlay">
            <span className="v-loading-spinner" />
            <p>Refreshing dashboard…</p>
          </div>
        )}
        <div className="v-panel-title">
          <Layers size={17} /> Severity spectrum
        </div>
        {loading ? (
          <div className="v-skeleton" style={{ height: 14, width: "100%" }} />
        ) : (
          <SeverityBreakdownBar breakdown={severityBreakdown} />
        )}
      </div>

      <div className="v-dash-grid">
        <div className="v-panel">
          <div className="v-panel-title">
            <Layers size={17} /> By category
          </div>
          {loading ? (
            <div className="v-skeleton" style={{ height: 120, width: "100%" }} />
          ) : (
            <RankedBarList data={categoryBreakdown} accent="var(--v-primary)" />
          )}
        </div>
        <div className="v-panel">
          <div className="v-panel-title">
            <Radio size={17} /> By source
          </div>
          {loading ? (
            <div className="v-skeleton" style={{ height: 120, width: "100%" }} />
          ) : (
            <RankedBarList data={sourceBreakdown} accent="var(--v-saffron)" />
          )}
        </div>
      </div>

      <div className="v-panel">
        <div className="v-panel-title">
          <Siren size={17} /> Top critical incidents
        </div>
        {loading ? (
          <div className="v-critical-grid">
            {[1, 2, 3].map((i) => (
              <div key={i} className="v-skeleton" style={{ height: 140, width: "100%" }} />
            ))}
          </div>
        ) : criticalIncidents.length === 0 ? (
          <div className="v-empty-state">
            <h4>Nothing critical right now</h4>
            <p>Once incidents cross the priority threshold, they'll surface here first.</p>
          </div>
        ) : (
          <div className="v-critical-grid">
            {criticalIncidents.map((incident) => (
              <div
                key={incident.incident_id}
                className={`v-incident-card v-sev-${(incident.severity || "moderate").toLowerCase()} v-critical-card`}
                onClick={() => navigate("/map", { state: { focusId: incident.incident_id } })}
              >
                <div className="v-critical-card-top">
                  <SeverityBadge severity={incident.severity} size="sm" />
                  <PriorityScore score={incident.priority_score} severity={incident.severity} />
                </div>
                <h4 className="v-critical-card-title">{incident.title}</h4>
                <div className="v-critical-card-meta v-mono">
                  {incident.category} · {incident.source}
                </div>
                {incident.summary && <p className="v-critical-card-summary">{incident.summary}</p>}
                {!!incident.recommended_actions?.length && (
                  <ul className="v-critical-card-actions">
                    {incident.recommended_actions.slice(0, 2).map((action, idx) => (
                      <li key={idx}>{action}</li>
                    ))}
                  </ul>
                )}
                <div className="v-critical-card-coords v-mono">
                  <MapPin size={12} />
                  {locationLabels[incident.incident_id]
                    ? locationLabels[incident.incident_id]
                    : `${incident.latitude?.toFixed(2)}, ${incident.longitude?.toFixed(2)}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="v-panel">
        <div className="v-panel-title">
          <Clock size={17} /> Recent analyses
        </div>
        {loading ? (
          <div className="v-skeleton" style={{ height: 160, width: "100%" }} />
        ) : recentAnalyses.length === 0 ? (
          <div className="v-empty-state">
            <h4>No analyses yet</h4>
            <p>Run an analysis from the Incidents page to populate this feed.</p>
          </div>
        ) : (
          <div className="v-timeline">
            {recentAnalyses.map((item) => (
              <div key={item.incident_id} className="v-timeline-row">
                <SeverityBadge severity={item.severity} size="sm" />
                <span className="v-timeline-title">{item.title}</span>
                <PriorityScore score={item.priority_score} severity={item.severity} />
                <span className="v-timeline-time v-mono">{timeAgo(item.analyzed_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
};

export default UserDashboard;
