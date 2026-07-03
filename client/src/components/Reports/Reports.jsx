import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Zap, Plus, X, ExternalLink, AlertCircle } from "lucide-react";
import PageShell from "../Layout/PageShell";
import { getAllSources, getAllAnalyses, analyzeIncident } from "../../api/varunaApi";
import { SeverityBadge, PriorityScore } from "../common/Severity";
import { SEVERITY_ORDER } from "../common/severityConfig";
import "./Reports.css";

const ManualAnalyzeModal = ({ onClose, onResult }) => {
  const [description, setDescription] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await analyzeIncident({
        description,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      });
      setResult(res);
      onResult?.(res);
    } catch (err) {
      console.error("Manual analysis failed:", err);
      setError("Analysis failed. Check the backend is reachable and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="v-modal-backdrop" onClick={onClose}>
      <div className="v-modal" onClick={(e) => e.stopPropagation()}>
        <div className="v-modal-header">
          <h3>Analyze an incident</h3>
          <button className="v-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {!result ? (
          <form onSubmit={submit} className="v-modal-form">
            <label>
              Description
              <textarea
                required
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Major flood in coastal area, water levels rising rapidly near residential zones"
              />
            </label>
            <div className="v-modal-coords">
              <label>
                Latitude
                <input
                  required
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="22.57"
                />
              </label>
              <label>
                Longitude
                <input
                  required
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="88.36"
                />
              </label>
            </div>
            {error && <div className="v-modal-error">{error}</div>}
            <button type="submit" className="v-btn v-btn-primary" disabled={loading}>
              {loading ? <span className="v-loading-spinner" /> : <Zap size={16} />}
              {loading ? "Analyzing…" : "Run analysis"}
            </button>
          </form>
        ) : (
          <div className="v-modal-result">
            <div className="v-critical-card-top">
              <SeverityBadge severity={result.analysis.severity} />
              <PriorityScore score={result.analysis.priority_score} severity={result.analysis.severity} />
            </div>
            <h4>{result.analysis.incident_type}</h4>
            <p>{result.analysis.summary}</p>
            {!!result.analysis.recommended_actions?.length && (
              <ul className="v-critical-card-actions">
                {result.analysis.recommended_actions.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            )}
            <div className="v-timeline-time v-mono">
              {result.metadata?.model} · {(result.metadata?.processing_time_ms / 1000).toFixed(1)}s
            </div>
            <button className="v-btn" onClick={onClose} style={{ marginTop: 14 }}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
};

const Reports = () => {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [activeSeverities, setActiveSeverities] = useState(new Set(SEVERITY_ORDER));
  const [showModal, setShowModal] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [freshResults, setFreshResults] = useState(null);
  const [analyzeError, setAnalyzeError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllSources();
      setSources(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load sources:", err);
      setError("Couldn't reach the Kavach analysis service. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runFreshAnalysis = async () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    setFreshResults(null);
    try {
      const results = await getAllAnalyses(10);
      setFreshResults(Array.isArray(results) ? results : []);
    } catch (err) {
      console.error("Fresh analysis failed:", err);
      setAnalyzeError(
        err?.code === "ECONNABORTED"
          ? "This can take 30-60s and it timed out. It may still be finishing on the backend — try refreshing the dashboard shortly."
          : "Couldn't run analysis. Check that the backend is reachable."
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleSeverity = (sev) => {
    setActiveSeverities((prev) => {
      const next = new Set(prev);
      next.has(sev) ? next.delete(sev) : next.add(sev);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sources.filter((s) => {
      if (!activeSeverities.has(s.severity)) return false;
      if (!q) return true;
      return (
        s.title?.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q) ||
        s.source?.toLowerCase().includes(q)
      );
    });
  }, [sources, search, activeSeverities]);

  return (
    <PageShell noFooter>
      <div className="v-dash-header">
        <div>
          <h1 className="v-dash-title">Incidents</h1>
          <p className="v-dash-subtitle">
            {loading ? "Loading…" : `${filtered.length} of ${sources.length} raw incidents`}
          </p>
        </div>
        <div className="v-dash-header-actions">
          <button className="v-btn" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Analyze one
          </button>
          <button className="v-btn v-btn-primary" onClick={runFreshAnalysis} disabled={analyzing}>
            {analyzing ? <span className="v-loading-spinner" /> : <Zap size={16} />}
            {analyzing ? "Analyzing (30–60s)…" : "Run fresh analysis"}
          </button>
        </div>
      </div>

      {error && (
        <div className="v-alert-banner">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button className="v-btn" onClick={load}>Retry</button>
        </div>
      )}
      {analyzeError && (
        <div className="v-alert-banner">
          <AlertCircle size={18} />
          <span>{analyzeError}</span>
        </div>
      )}

      {freshResults && (
        <div className="v-panel" style={{ marginBottom: 20 }}>
          <div className="v-panel-title">
            <Zap size={17} /> Fresh analysis results ({freshResults.length})
          </div>
          <div className="v-critical-grid">
            {freshResults.map((r) => (
              <div key={r.incident_id} className={`v-incident-card v-sev-${(r.analysis.severity || "moderate").toLowerCase()} v-critical-card`}>
                <div className="v-critical-card-top">
                  <SeverityBadge severity={r.analysis.severity} size="sm" />
                  <PriorityScore score={r.analysis.priority_score} severity={r.analysis.severity} />
                </div>
                <h4 className="v-critical-card-title">{r.analysis.incident_type}</h4>
                <div className="v-critical-card-meta v-mono">{r.source} · {r.incident_id}</div>
                <p className="v-critical-card-summary">{r.analysis.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="v-incidents-toolbar">
        <div className="v-search-box">
          <Search size={16} />
          <input
            placeholder="Search title, category, source…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="v-map-legend">
          {SEVERITY_ORDER.map((sev) => (
            <button
              key={sev}
              className={`v-map-legend-chip ${activeSeverities.has(sev) ? "active" : ""}`}
              style={{ "--chip-color": { Low: "#16a34a", Moderate: "#eab308", High: "#f97316", Critical: "#dc2626" }[sev] }}
              onClick={() => toggleSeverity(sev)}
            >
              <span className="v-map-legend-dot" /> {sev}
            </button>
          ))}
        </div>
      </div>

      <div className="v-panel v-incidents-table-panel">
        {(loading || analyzing) && (
          <div className="v-loading-overlay">
            <span className="v-loading-spinner" />
            <p>{loading ? "Loading incident list…" : "Running fresh analysis…"}</p>
          </div>
        )}
        {loading ? (
          <div className="v-skeleton" style={{ height: 300, width: "100%" }} />
        ) : filtered.length === 0 ? (
          <div className="v-empty-state">
            <h4>No incidents match</h4>
            <p>Try clearing filters or search.</p>
          </div>
        ) : (
          <div className="v-incidents-table">
            <div className="v-incidents-row v-incidents-head">
              <span>Severity</span>
              <span>Title</span>
              <span>Category</span>
              <span>Source</span>
              <span>Reported</span>
              <span></span>
            </div>
            {filtered.map((inc) => (
              <div key={inc.id} className="v-incidents-row">
                <SeverityBadge severity={inc.severity} size="sm" />
                <span className="v-incidents-title">{inc.title}</span>
                <span className="v-incidents-cell v-mono">{inc.category}</span>
                <span className="v-incidents-cell v-mono">{inc.source}</span>
                <span className="v-incidents-cell v-mono">
                  {inc.timestamp ? new Date(inc.timestamp).toLocaleDateString() : "—"}
                </span>
                {inc.url ? (
                  <a href={inc.url} target="_blank" rel="noopener noreferrer" className="v-incidents-link">
                    <ExternalLink size={14} />
                  </a>
                ) : <span />}
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <ManualAnalyzeModal onClose={() => setShowModal(false)} onResult={() => load()} />
      )}
    </PageShell>
  );
};

export default Reports;
