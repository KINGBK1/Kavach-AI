import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Siren,
  AlertCircle,
  Radio,
  RefreshCw,
  Search,
  X,
  Volume2,
  VolumeX,
  Clock,
  MapPin,
  ExternalLink,
  ChevronDown,
  CheckCircle2,
  BellOff,
  Download,
  ArrowUpDown,
  Filter,
  Sparkles
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import PageShell from "../Layout/PageShell";
import { getDashboard } from "../../api/varunaApi";
import { SeverityBadge, PriorityScore } from "../common/Severity";
import InfoTooltip from "../common/InfoTooltip";
import "./Alerts.css";

const POLL_MS = 60000;

// A short, unobtrusive two-tone chime, generated with the Web Audio API so
// no external asset needs to be shipped/loaded for the "new critical alert"
// sound. Falls back silently if the browser blocks autoplay audio before
// any user interaction has happened on the page (very common — this is
// expected and not an error state).
const playChime = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.14);
      osc.stop(now + i * 0.14 + 0.3);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {
    /* audio not available — non-critical, ignore */
  }
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

const SORT_OPTIONS = [
  { key: "priority", label: "Highest priority first" },
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "title", label: "Title (A → Z)" },
];

const ACK_STORAGE_KEY = "varuna_acknowledged_alerts";
const MUTE_STORAGE_KEY = "varuna_alerts_muted";

const loadAckSet = () => {
  try {
    const raw = window.localStorage.getItem(ACK_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
};

const persistAckSet = (set) => {
  try {
    window.localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* storage unavailable — acknowledgements just won't persist across reloads */
  }
};

const Alerts = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [live, setLive] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [secondsToNextPoll, setSecondsToNextPoll] = useState(POLL_MS / 1000);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("priority");
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [muted, setMuted] = useState(() => {
    try {
      return window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [acknowledged, setAcknowledged] = useState(loadAckSet);
  const [flashIds, setFlashIds] = useState(new Set());

  const timerRef = useRef(null);
  const countdownRef = useRef(null);
  const knownIdsRef = useRef(new Set());
  const isFirstLoadRef = useRef(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await getDashboard();
      setData(result);
      setLastUpdated(new Date());
      setSecondsToNextPoll(POLL_MS / 1000);
    } catch (err) {
      console.error("Failed to load alerts:", err);
      setError("Couldn't reach the Kavach analysis service. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!live) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [live, load]);

  // Visible "next refresh in Ns" countdown so the live/paused toggle feels
  // trustworthy rather than a black box.
  useEffect(() => {
    if (!live) return;
    countdownRef.current = setInterval(() => {
      setSecondsToNextPoll((s) => (s <= 1 ? POLL_MS / 1000 : s - 1));
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [live, lastUpdated]);

  const critical = (data?.top_critical_incidents || []).filter((i) => i.severity === "Critical");
  const high = (data?.top_critical_incidents || []).filter((i) => i.severity === "High");
  const allAlerts = useMemo(() => [...critical, ...high], [critical, high]);
  const total = critical.length + high.length;

  // --- New-alert detection: sound + flash highlight -----------------------
  // Compares the current critical/high incident ids against what was seen
  // on the previous load. Anything new gets a brief highlight animation
  // and (if not muted) a short chime — this is what makes "Live" mode feel
  // meaningfully different from a static page instead of just silently
  // swapping data underneath the user.
  useEffect(() => {
    if (!data) return;
    const currentIds = new Set(allAlerts.map((i) => i.incident_id));

    if (isFirstLoadRef.current) {
      knownIdsRef.current = currentIds;
      isFirstLoadRef.current = false;
      return;
    }

    const newlySeen = [...currentIds].filter((id) => !knownIdsRef.current.has(id));
    if (newlySeen.length > 0) {
      setFlashIds(new Set(newlySeen));
      if (!muted) playChime();
      const t = setTimeout(() => setFlashIds(new Set()), 4000);
      knownIdsRef.current = currentIds;
      return () => clearTimeout(t);
    }
    knownIdsRef.current = currentIds;
  }, [allAlerts, data, muted]);

  const toggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(MUTE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const toggleAcknowledge = (incidentId) => {
    setAcknowledged((prev) => {
      const next = new Set(prev);
      next.has(incidentId) ? next.delete(incidentId) : next.add(incidentId);
      persistAckSet(next);
      return next;
    });
  };

  const acknowledgedCount = allAlerts.filter((i) => acknowledged.has(i.incident_id)).length;
  const unacknowledgedCount = total - acknowledgedCount;

  // --- Filter + sort -------------------------------------------------------
  const applyFilterSort = useCallback(
    (list) => {
      const q = search.trim().toLowerCase();
      let filtered = list.filter((i) => {
        if (!showAcknowledged && acknowledged.has(i.incident_id)) return false;
        if (!q) return true;
        return (
          i.title?.toLowerCase().includes(q) ||
          i.category?.toLowerCase().includes(q) ||
          i.source?.toLowerCase().includes(q) ||
          i.summary?.toLowerCase().includes(q)
        );
      });

      filtered = [...filtered].sort((a, b) => {
        switch (sortKey) {
          case "oldest":
            return new Date(a.analyzed_at || a.timestamp || 0) - new Date(b.analyzed_at || b.timestamp || 0);
          case "title":
            return (a.title || "").localeCompare(b.title || "");
          case "newest":
            return new Date(b.analyzed_at || b.timestamp || 0) - new Date(a.analyzed_at || a.timestamp || 0);
          case "priority":
          default:
            return (b.priority_score ?? 0) - (a.priority_score ?? 0);
        }
      });

      return filtered;
    },
    [search, sortKey, showAcknowledged, acknowledged]
  );

  const filteredCritical = useMemo(() => applyFilterSort(critical), [applyFilterSort, critical]);
  const filteredHigh = useMemo(() => applyFilterSort(high), [applyFilterSort, high]);
  const visibleTotal = filteredCritical.length + filteredHigh.length;
  const hasActiveFilters = search.trim().length > 0 || showAcknowledged;

  const exportCsv = () => {
    const header = ["Severity", "Title", "Category", "Source", "Priority Score", "Reported", "Acknowledged"];
    const rows = allAlerts.map((i) => [
      i.severity || "",
      (i.title || "").replace(/"/g, '""'),
      i.category || "",
      i.source || "",
      i.priority_score ?? "",
      i.analyzed_at || i.timestamp || "",
      acknowledged.has(i.incident_id) ? "Yes" : "No",
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `varuna-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageShell noFooter>
      <div className="v-dash-header">
        <div>
          <h1 className="v-dash-title">Critical Alerts</h1>
          <p className="v-dash-subtitle">
            Highest-severity incidents, refreshed automatically every minute.
            {!loading && lastUpdated && (
              <span className="v-dash-subtitle-meta">
                <Clock size={12} /> Updated {timeAgo(lastUpdated.toISOString())}
                {live && ` · next in ${secondsToNextPoll}s`}
              </span>
            )}
          </p>
        </div>
        <div className="v-dash-header-actions">
          <button
            className="v-btn"
            onClick={toggleMute}
            title={muted ? "Unmute alert sound" : "Mute alert sound"}
            aria-label={muted ? "Unmute alert sound" : "Mute alert sound"}
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            {muted ? "Muted" : "Sound on"}
          </button>
          <button
            className={`v-live-toggle ${live ? "on" : ""}`}
            onClick={() => setLive((v) => !v)}
          >
            <Radio size={14} /> {live ? "Live" : "Paused"}
          </button>
          <button className="v-btn v-btn-primary" onClick={load} disabled={loading}>
            {loading ? <span className="v-loading-spinner" /> : <RefreshCw size={16} />} Refresh
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

      <div className="v-alert-summary-panel">
        <div className="v-alert-summary-card critical">
          <span>
            Critical alerts
            <InfoTooltip
              title="Critical alerts"
              text="Incidents the AI has classified as the highest urgency tier — these represent the most severe, time-sensitive threats currently tracked."
            />
          </span>
          <strong>{critical.length}</strong>
        </div>
        <div className="v-alert-summary-card high">
          <span>
            High alerts
            <InfoTooltip
              title="High alerts"
              text="Incidents classified as High severity — serious and worth prompt attention, one tier below Critical."
            />
          </span>
          <strong>{high.length}</strong>
        </div>
        <div className="v-alert-summary-card total">
          <span>
            Total tracked
            <InfoTooltip
              title="Total tracked"
              text="Combined count of Critical + High severity incidents currently being monitored on this page."
            />
          </span>
          <strong>{total}</strong>
        </div>
        <div className="v-alert-summary-card ack">
          <span>
            Unacknowledged
            <InfoTooltip
              title="Unacknowledged"
              text="Alerts you haven't marked as seen/handled yet. Acknowledging an alert hides it from the default view so you can focus on what's new — toggle 'Show acknowledged' to bring them back."
            />
          </span>
          <strong>{unacknowledgedCount}</strong>
        </div>
      </div>

      {!loading && total > 0 && (
        <div className="v-alerts-toolbar">
          <div className="v-search-box">
            <Search size={16} />
            <input
              placeholder="Search title, category, source, summary…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="v-search-clear" onClick={() => setSearch("")} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="v-sort-select-wrap">
            <ArrowUpDown size={14} className="v-sort-select-icon" />
            <select
              className="v-sort-select"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              aria-label="Sort alerts"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>

          <button
            className={`v-btn v-toggle-chip ${showAcknowledged ? "active" : ""}`}
            onClick={() => setShowAcknowledged((v) => !v)}
          >
            {showAcknowledged ? <CheckCircle2 size={14} /> : <BellOff size={14} />}
            {showAcknowledged ? "Showing acknowledged" : "Show acknowledged"}
            {acknowledgedCount > 0 && <span className="v-toggle-chip-count">{acknowledgedCount}</span>}
          </button>

          {hasActiveFilters && (
            <button className="v-btn" onClick={() => { setSearch(""); setShowAcknowledged(false); }}>
              <X size={14} /> Clear
            </button>
          )}

          <button className="v-btn" onClick={exportCsv} disabled={total === 0} style={{ marginLeft: "auto" }}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      )}

      {loading ? (
        <div className="v-alert-grid">
          {[1, 2, 3].map((item) => (
            <div key={item} className="v-panel v-alert-card-skeleton">
              <div className="v-skeleton" style={{ height: 18, width: '50%', marginBottom: 14 }} />
              <div className="v-skeleton" style={{ height: 14, width: '100%', marginBottom: 10 }} />
              <div className="v-skeleton" style={{ height: 14, width: '85%', marginBottom: 10 }} />
              <div className="v-skeleton" style={{ height: 14, width: '75%' }} />
            </div>
          ))}
        </div>
      ) : total === 0 ? (
        <div className="v-panel">
          <div className="v-empty-state">
            <Siren size={28} style={{ marginBottom: 10, color: "var(--v-sev-low)" }} />
            <h4>No current critical or high alerts</h4>
            <p>Everything tracked by Kavach is operating at Moderate severity or below.</p>
          </div>
        </div>
      ) : visibleTotal === 0 ? (
        <div className="v-panel">
          <div className="v-empty-state">
            <Filter size={28} style={{ marginBottom: 10, color: "var(--v-sev-moderate)" }} />
            <h4>No alerts match your filters</h4>
            <p>Try clearing the search or enabling "Show acknowledged".</p>
            <button
              className="v-btn v-btn-primary"
              onClick={() => { setSearch(""); setShowAcknowledged(true); }}
              style={{ marginTop: 12 }}
            >
              Clear filters
            </button>
          </div>
        </div>
      ) : (
        <div className="v-alert-grid">
          {filteredCritical.length > 0 && (
            <div className="v-panel v-alert-section critical">
              <div className="v-panel-title"><Siren size={17} /> Critical ({filteredCritical.length})</div>
              <div className="v-alert-feed">
                {filteredCritical.map((incident) => (
                  <AlertRow
                    key={incident.incident_id}
                    incident={incident}
                    isFlashing={flashIds.has(incident.incident_id)}
                    isAcknowledged={acknowledged.has(incident.incident_id)}
                    isExpanded={expandedId === incident.incident_id}
                    onToggleExpand={() =>
                      setExpandedId((id) => (id === incident.incident_id ? null : incident.incident_id))
                    }
                    onToggleAck={() => toggleAcknowledge(incident.incident_id)}
                    onLocate={() =>
                      navigate("/map", {
                        state: {
                          focusId: incident.incident_id,
                          focusLat: incident.latitude,
                          focusLng: incident.longitude
                        }
                      })
                    }
                  />
                ))}
              </div>
            </div>
          )}
          {filteredHigh.length > 0 && (
            <div className="v-panel v-alert-section high">
              <div className="v-panel-title"><Siren size={17} /> High ({filteredHigh.length})</div>
              <div className="v-alert-feed">
                {filteredHigh.map((incident) => (
                  <AlertRow
                    key={incident.incident_id}
                    incident={incident}
                    isFlashing={flashIds.has(incident.incident_id)}
                    isAcknowledged={acknowledged.has(incident.incident_id)}
                    isExpanded={expandedId === incident.incident_id}
                    onToggleExpand={() =>
                      setExpandedId((id) => (id === incident.incident_id ? null : incident.incident_id))
                    }
                    onToggleAck={() => toggleAcknowledge(incident.incident_id)}
                    onLocate={() =>
                      navigate("/map", {
                        state: {
                          focusId: incident.incident_id,
                          focusLat: incident.latitude,
                          focusLng: incident.longitude
                        }
                      })
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
};

const AlertRow = ({
  incident,
  isFlashing,
  isAcknowledged,
  isExpanded,
  onToggleExpand,
  onToggleAck,
  onLocate
}) => {
  const hasCoords = incident.latitude != null && incident.longitude != null;
  const reportedAt = incident.analyzed_at || incident.timestamp;

  return (
    <div
      className={[
        "v-incident-card",
        `v-sev-${incident.severity.toLowerCase()}`,
        "v-alert-row",
        isFlashing ? "v-alert-row-flash" : "",
        isAcknowledged ? "v-alert-row-acked" : ""
      ].filter(Boolean).join(" ")}
    >
      {isFlashing && (
        <span className="v-alert-new-pill">
          <Sparkles size={11} /> New
        </span>
      )}

      <div className="v-alert-row-top">
        <SeverityBadge severity={incident.severity} size="sm" />
        <PriorityScore score={incident.priority_score} severity={incident.severity} />
      </div>

      <h4>{incident.title}</h4>
      <div className="v-critical-card-meta v-mono">{incident.category} · {incident.source}</div>

      <div className="v-alert-row-meta-line">
        {reportedAt && (
          <span className="v-alert-row-meta-chip">
            <Clock size={11} /> {timeAgo(reportedAt)}
          </span>
        )}
        {hasCoords && (
          <span className="v-alert-row-meta-chip v-mono">
            <MapPin size={11} /> {incident.latitude.toFixed(3)}, {incident.longitude.toFixed(3)}
          </span>
        )}
      </div>

      {incident.summary && <p className="v-critical-card-summary">{incident.summary}</p>}

      {!!incident.recommended_actions?.length && (
        <>
          <button className="v-alert-expand-toggle" onClick={onToggleExpand}>
            <ChevronDown size={13} className={isExpanded ? "v-alert-expand-icon-open" : ""} />
            {isExpanded ? "Hide recommended actions" : `Show recommended actions (${incident.recommended_actions.length})`}
          </button>
          {isExpanded && (
            <ul className="v-critical-card-actions">
              {incident.recommended_actions.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          )}
        </>
      )}

      <div className="v-alert-row-actions">
        <button className="v-btn v-alert-row-btn" onClick={onLocate} disabled={!hasCoords}>
          <MapPin size={13} /> Locate on map
        </button>
        {incident.url && (
          <a
            href={incident.url}
            target="_blank"
            rel="noopener noreferrer"
            className="v-btn v-alert-row-btn"
          >
            <ExternalLink size={13} /> Source
          </a>
        )}
        <button
          className={`v-btn v-alert-row-btn v-alert-ack-btn ${isAcknowledged ? "acked" : ""}`}
          onClick={onToggleAck}
        >
          <CheckCircle2 size={13} /> {isAcknowledged ? "Acknowledged" : "Acknowledge"}
        </button>
      </div>
    </div>
  );
};

export default Alerts;