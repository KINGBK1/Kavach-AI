import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  Search,
  Zap,
  Plus,
  X,
  ExternalLink,
  AlertCircle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Sparkles,
  Globe,
  Database,
  Brain,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Link2,
  ShieldCheck,
  Radio,
  Satellite,
  BookOpen,
} from "lucide-react";
import PageShell from "../Layout/PageShell";
import { getAllSources, getAllAnalyses, analyzeIncident } from "../../api/varunaApi";
import { SeverityBadge, PriorityScore, ConfidenceBadge } from "../common/Severity";
import { SEVERITY_ORDER } from "../common/severityConfig";
import "./Reports.css";

const SEVERITY_COLORS = {
  Low: "#16a34a",
  Moderate: "#ca8a04",
  High: "#ea580c",
  Critical: "#dc2626",
};

const PAGE_SIZE = 25;

const formatDate = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const AGENT_STEPS = [
  { id: "search", icon: Globe, label: "Searching web sources..." },
  { id: "db", icon: Database, label: "Checking incident database..." },
  { id: "analyze", icon: Brain, label: "Analyzing with AI..." },
  { id: "verify", icon: ShieldCheck, label: "Verifying & saving..." },
];

const ManualAnalyzeModal = ({ onClose, onResult }) => {
  const [description, setDescription] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const stepTimerRef = useRef(null);

  useEffect(() => {
    if (!loading) {
      setActiveStep(0);
      return;
    }
    const advance = () => {
      setActiveStep((prev) => Math.min(prev + 1, AGENT_STEPS.length - 1));
    };
    stepTimerRef.current = setInterval(advance, 2500);
    return () => clearInterval(stepTimerRef.current);
  }, [loading]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setActiveStep(0);
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
      if (err.response?.status === 429) {
        setError("You've submitted several reports in the last hour. Please wait a bit before submitting another.");
      } else {
        setError("Analysis failed. Check the backend is reachable and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const isVerified = result?.analysis?.verification?.is_verified ?? (result?.status === "corroborated" || result?.status === "verified");
  const sourcesChecked = result?.analysis?.verification?.sources_checked || [];
  const webSummary = result?.analysis?.verification?.web_search_summary || "";

  return (
    <div className="v-modal-backdrop" onClick={onClose}>
      <div className="v-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="v-modal-header">
          <h3>Analyze an incident</h3>
          <button className="v-modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {!result && !loading && (
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
        )}

        {loading && (
          <div className="v-agent-steps">
            {AGENT_STEPS.map((step, i) => {
              const StepIcon = step.icon;
              const isActive = i === activeStep;
              const isDone = i < activeStep;
              const isPending = i > activeStep;
              return (
                <div
                  key={step.id}
                  className={`v-agent-step ${isActive ? "v-agent-step--active" : ""} ${isDone ? "v-agent-step--done" : ""} ${isPending ? "v-agent-step--pending" : ""}`}
                >
                  <div className="v-agent-step-icon">
                    {isDone ? (
                      <CheckCircle2 size={18} className="v-step-check" />
                    ) : isActive ? (
                      <Loader2 size={18} className="v-step-spinner" />
                    ) : (
                      <StepIcon size={18} className="v-step-icon" />
                    )}
                  </div>
                  <div className="v-agent-step-content">
                    <span className="v-agent-step-label">{step.label}</span>
                    {isActive && <span className="v-agent-step-sub">Processing...</span>}
                    {isDone && <span className="v-agent-step-sub">Complete</span>}
                  </div>
                  {isActive && <div className="v-agent-step-bar" />}
                </div>
              );
            })}
          </div>
        )}

        {result && !loading && (
          <div className="v-modal-result">
            <div className={`v-verification-badge ${isVerified ? "v-verification-badge--verified" : "v-verification-badge--rejected"}`}>
              {isVerified ? (
                <>
                  <ShieldCheck size={20} />
                  <div>
                    <strong>Verified Incident</strong>
                    <span>Web sources confirm this event</span>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle size={20} />
                  <div>
                    <strong>Unverified Report</strong>
                    <span>No web evidence found</span>
                  </div>
                </>
              )}
            </div>

            <div className="v-critical-card-top">
              <SeverityBadge severity={result.analysis.severity} />
              <ConfidenceBadge confidence={result.analysis.confidence} />
              <PriorityScore score={result.analysis.priority_score} severity={result.analysis.severity} />
            </div>
            <h4>{result.analysis.incident_type}</h4>
            <p>{result.analysis.summary}</p>

            {!!result.analysis.recommended_actions?.length && (
              <div className="v-sources-section">
                <div className="v-sources-section-header">
                  <FileText size={14} />
                  <span>Recommended Actions</span>
                </div>
                <ul className="v-critical-card-actions">
                  {result.analysis.recommended_actions.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}

            {sourcesChecked.length > 0 && (
              <div className="v-sources-section">
                <div className="v-sources-section-header">
                  <BookOpen size={14} />
                  <span>Sources Checked ({sourcesChecked.length})</span>
                </div>
                <div className="v-sources-list">
                  {sourcesChecked.map((url, i) => {
                    const domain = url.replace(/^https?:\/\//, "").split("/")[0];
                    return (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="v-source-item"
                        style={{ animationDelay: `${i * 80}ms` }}
                      >
                        <Link2 size={12} />
                        <span>{domain}</span>
                        <ExternalLink size={10} className="v-source-external" />
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {webSummary && (
              <div className="v-sources-section v-web-summary">
                <div className="v-sources-section-header">
                  <Globe size={14} />
                  <span>Web Search Summary</span>
                </div>
                <p>{webSummary}</p>
              </div>
            )}

            <div className="v-timeline-time v-mono" style={{ marginTop: 12 }}>
              <Radio size={12} />
              {result.metadata?.model} · {(result.metadata?.processing_time_ms / 1000).toFixed(1)}s
            </div>
            <button className="v-btn" onClick={onClose} style={{ marginTop: 14 }}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
};

const SORT_OPTIONS = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "severity", label: "Severity (high → low)" },
  { key: "title", label: "Title (A → Z)" },
];

const SEVERITY_RANK = { Critical: 3, High: 2, Moderate: 1, Low: 0 };

const Reports = () => {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [activeSeverities, setActiveSeverities] = useState(new Set(SEVERITY_ORDER));
  const [showModal, setShowModal] = useState(false);
  const [sortKey, setSortKey] = useState("newest");
  const [page, setPage] = useState(1);

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
    setPage(1);
    setActiveSeverities((prev) => {
      const next = new Set(prev);
      next.has(sev) ? next.delete(sev) : next.add(sev);
      return next;
    });
  };

  const clearFilters = () => {
    setActiveSeverities(new Set(SEVERITY_ORDER));
    setSearch("");
    setPage(1);
  };

  const hasActiveFilters = activeSeverities.size < SEVERITY_ORDER.length || search.trim().length > 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = sources.filter((s) => {
      if (!activeSeverities.has(s.severity)) return false;
      if (!q) return true;
      return (
        s.title?.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q) ||
        s.source?.toLowerCase().includes(q)
      );
    });

    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case "oldest":
          return new Date(a.timestamp || 0) - new Date(b.timestamp || 0);
        case "severity":
          return (SEVERITY_RANK[b.severity] ?? -1) - (SEVERITY_RANK[a.severity] ?? -1);
        case "title":
          return (a.title || "").localeCompare(b.title || "");
        case "newest":
        default:
          return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
      }
    });

    return list;
  }, [sources, search, activeSeverities, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const severityCounts = useMemo(() => {
    const out = { Low: 0, Moderate: 0, High: 0, Critical: 0 };
    sources.forEach((s) => { if (out[s.severity] !== undefined) out[s.severity] += 1; });
    return out;
  }, [sources]);

  const exportCsv = () => {
    const header = ["Severity", "Title", "Category", "Source", "Reported", "URL"];
    const rows = filtered.map((inc) => [
      inc.severity || "",
      (inc.title || "").replace(/"/g, '""'),
      inc.category || "",
      inc.source || "",
      inc.timestamp ? new Date(inc.timestamp).toISOString() : "",
      inc.url || "",
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kavach-incidents-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
            <Plus size={16} /> Report an Incident
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

      {/* Severity overview strip */}
      <div className="v-severity-summary-strip">
        {SEVERITY_ORDER.map((sev) => (
          <div key={sev} className="v-severity-summary-chip" style={{ "--chip-color": SEVERITY_COLORS[sev] }}>
            <span className="v-severity-summary-dot" />
            <span className="v-severity-summary-label">{sev}</span>
            <span className="v-severity-summary-count v-mono">{loading ? "—" : severityCounts[sev]}</span>
          </div>
        ))}
      </div>

      {(analyzing || freshResults) && (
        <div className="v-panel v-fresh-analysis-panel">
          <div className="v-panel-title">
            <Sparkles size={16} /> Fresh analysis results {freshResults ? `(${freshResults.length})` : ""}
          </div>
          {analyzing ? (
            <div className="v-fresh-analysis-loading">
              <span className="v-loading-spinner" />
              <span>Running AI analysis on the latest incidents — this usually takes 30–60 seconds…</span>
            </div>
          ) : freshResults.length === 0 ? (
            <div className="v-empty-state v-empty-state-inline">
              <p>No new incidents were found to analyze.</p>
            </div>
          ) : (
            <div className="v-critical-grid">
              {freshResults.map((r) => (
                <div
                  key={r.incident_id ?? `${r.source}-${r.analysis?.incident_type}`}
                  className={`v-incident-card v-sev-${(r.analysis?.severity || "moderate").toLowerCase()} v-critical-card`}
                >
                  <div className="v-critical-card-top">
                    <SeverityBadge severity={r.analysis?.severity} size="sm" />
                    <PriorityScore score={r.analysis?.priority_score} severity={r.analysis?.severity} />
                  </div>
                  <h4 className="v-critical-card-title">{r.analysis?.incident_type}</h4>
                  <div className="v-critical-card-meta v-mono">{r.source} · {r.incident_id}</div>
                  <p className="v-critical-card-summary">{r.analysis?.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="v-incidents-toolbar">
        <div className="v-search-box">
          <Search size={16} />
          <input
            placeholder="Search title, category, source…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          {search && (
            <button className="v-search-clear" onClick={() => setSearch("")} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="v-map-legend">
          {SEVERITY_ORDER.map((sev) => (
            <button
              key={sev}
              className={`v-map-legend-chip ${activeSeverities.has(sev) ? "active" : ""}`}
              style={{ "--chip-color": SEVERITY_COLORS[sev] }}
              onClick={() => toggleSeverity(sev)}
            >
              <span className="v-map-legend-dot" /> {sev}
            </button>
          ))}
        </div>

        <div className="v-toolbar-right-group">
          <div className="v-sort-select-wrap">
            <ArrowUpDown size={14} className="v-sort-select-icon" />
            <select
              className="v-sort-select"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              aria-label="Sort incidents"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <button className="v-btn" onClick={clearFilters}>
              <X size={14} /> Clear
            </button>
          )}

          <button className="v-btn" onClick={exportCsv} disabled={loading || filtered.length === 0}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      <div className="v-panel v-incidents-table-panel">
        {(loading) && (
          <div className="v-loading-overlay">
            <span className="v-loading-spinner" />
            <p>Loading incident list…</p>
          </div>
        )}
        {loading ? (
          <div className="v-skeleton" style={{ height: 300, width: "100%" }} />
        ) : filtered.length === 0 ? (
          <div className="v-empty-state">
            <h4>No incidents match</h4>
            <p>Try clearing filters or search.</p>
            {hasActiveFilters && (
              <button className="v-btn v-btn-primary" onClick={clearFilters} style={{ marginTop: 12 }}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="v-incidents-table">
              <div className="v-incidents-row v-incidents-head">
                <span>Severity</span>
                <span>Title</span>
                <span>Category</span>
                <span>Source</span>
                <span>Reported</span>
                <span></span>
              </div>
              {paginated.map((inc) => (
                <div key={inc.id} className="v-incidents-row">
                  <SeverityBadge severity={inc.severity} size="sm" />
                  <span className="v-incidents-title" title={inc.title}>{inc.title}</span>
                  <span className="v-incidents-cell v-mono" title={inc.category}>{inc.category}</span>
                  <span className="v-incidents-cell v-mono" title={inc.source}>
                    {inc.source === "citizen-report" ? (
                      <span className="v-source-badge-citizen">
                        <Sparkles size={10} /> Citizen
                      </span>
                    ) : (
                      inc.source
                    )}
                  </span>
                  <span className="v-incidents-cell v-mono">{formatDate(inc.timestamp)}</span>
                  {inc.url ? (
                    <a href={inc.url} target="_blank" rel="noopener noreferrer" className="v-incidents-link" title="Open source">
                      <ExternalLink size={14} />
                    </a>
                  ) : <span />}
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="v-pagination-bar">
                <span className="v-pagination-info">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
                </span>
                <div className="v-pagination-controls">
                  <button
                    className="v-btn v-pagination-btn"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="v-pagination-page v-mono">{currentPage} / {totalPages}</span>
                  <button
                    className="v-btn v-pagination-btn"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    aria-label="Next page"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showModal && (
        <ManualAnalyzeModal onClose={() => setShowModal(false)} />
      )}
    </PageShell>
  );
};

export default Reports;