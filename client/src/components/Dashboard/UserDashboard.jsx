import React, { useCallback, useEffect, useState, useMemo } from "react";
import {
  RefreshCw,
  Layers,
  Siren,
  Clock,
  MapPin,
  AlertCircle,
  TrendingUp,
  ShieldAlert,
  Compass,
  Radio,
  Eye,
  Terminal,
  Zap,
  Activity,
  Crosshair
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ScatterChart,
  Scatter,
  ZAxis,
  PieChart,
  Pie,
  Cell
} from "recharts";
import PageShell from "../Layout/PageShell";
import { getDashboard } from "../../api/varunaApi";
import { lookUpLocationName } from "../../utils/geolocation";
import { SeverityBadge } from "../common/Severity";
import "./UserDashboard.css";

// Cap the number of individually-colored donut slices / legend rows so the
// UI stays readable even when the backend reports 100+ distinct sources.
const MAX_SOURCE_SLICES = 8;
const MAX_CATEGORY_ROWS = 10;

const generateHslPalette = (index, total) => {
  const hue = (index * (360 / Math.max(total, 1))) % 360;
  return `hsl(${hue}, 68%, 52%)`;
};

const SEVERITY_COLORS = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  moderate: "var(--sev-moderate)",
  low: "var(--sev-low)",
  unknown: "var(--sev-unknown)"
};

const resolveSeverityColor = (severity) =>
  SEVERITY_COLORS[severity?.toLowerCase()] || SEVERITY_COLORS.unknown;

const StatCard = ({ label, value, loading, icon: Icon, trend }) => (
  <div className="v-premium-kpi-card">
    <div className="v-kpi-header">
      <span className="v-kpi-label">{label}</span>
      {Icon && (
        <div className="v-kpi-icon-glow">
          <Icon size={16} className="v-kpi-icon" />
        </div>
      )}
    </div>
    {loading ? (
      <div className="v-premium-skeleton" style={{ height: 32, width: "70%", borderRadius: "8px" }} />
    ) : (
      <div className="v-kpi-value-wrapper">
        <div className="v-kpi-value">{value}</div>
        {trend && (
          <div className="v-kpi-trend positive">
            <TrendingUp size={12} /> {trend}
          </div>
        )}
      </div>
    )}
    <div className="v-kpi-sparkline">
      {[40, 65, 50, 85, 70, 95].map((h, i) => (
        <div key={i} className="v-spark-bar" style={{ height: `${h}%` }} />
      ))}
    </div>
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

// Recharts' built-in <Legend> has no max-height/scroll behavior, so a
// backend with 100+ sources renders an unbounded list that overflows the
// entire page. This custom legend is capped and independently scrollable.
const ScrollableLegend = ({ items }) => (
  <div className="v-legend-scroll custom-scroll-panel">
    {items.map((item, index) => (
      <div key={index} className="v-legend-scroll-item">
        <span className="v-legend-scroll-dot" style={{ backgroundColor: item.fill }} />
        <span className="v-legend-scroll-name" title={item.name}>{item.name}</span>
        <span className="v-legend-scroll-val v-mono">{item.value}</span>
      </div>
    ))}
  </div>
);

const UserDashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [locationLabels, setLocationLabels] = useState({});
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const result = await getDashboard({ force: isRefresh });
      setData(result);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to load dashboard:", err);
      setError("Couldn't reach the Kavach analysis service. Verify backend integrity pools.");
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
          if (active) labels[incident.incident_id] = label;
        })
      );
      if (active) {
        setLocationLabels((prev) => ({ ...prev, ...labels }));
      }
    };

    loadLabels();
    return () => { active = false; };
  }, [data?.top_critical_incidents, locationLabels]);

  const summary = data?.summary || {};
  const severityBreakdown = data?.severity_breakdown || {};
  const categoryBreakdown = data?.category_breakdown || {};
  const sourceBreakdown = data?.source_breakdown || {};
  const criticalIncidents = data?.top_critical_incidents || [];
  const recentAnalyses = data?.recent_analyses || [];

  // Category distribution, capped to the top N with the remainder grouped
  // into a single "Other" row so long backend lists stay scannable.
  const categoryTreeData = useMemo(() => {
    const total = Object.values(categoryBreakdown).reduce((sum, val) => sum + val, 0) || 1;
    const sorted = Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, MAX_CATEGORY_ROWS);
    const rest = sorted.slice(MAX_CATEGORY_ROWS);
    const restTotal = rest.reduce((sum, [, v]) => sum + v, 0);

    const rows = top.map(([name, value], index) => ({
      name,
      value,
      percentage: ((value / total) * 100).toFixed(1),
      fill: generateHslPalette(index, MAX_CATEGORY_ROWS + (restTotal > 0 ? 1 : 0))
    }));

    if (restTotal > 0) {
      rows.push({
        name: `Other (${rest.length} categories)`,
        value: restTotal,
        percentage: ((restTotal / total) * 100).toFixed(1),
        fill: "#94a3b8"
      });
    }
    return rows;
  }, [categoryBreakdown]);

  // Source attribution donut, capped the same way — otherwise a live feed
  // with 100+ named sources produces a slice-per-degree donut and a legend
  // that can never fit in any layout.
  const doughnutSourceData = useMemo(() => {
    const entries = Object.entries(sourceBreakdown).sort((a, b) => b[1] - a[1]);
    const top = entries.slice(0, MAX_SOURCE_SLICES);
    const rest = entries.slice(MAX_SOURCE_SLICES);
    const restTotal = rest.reduce((sum, [, v]) => sum + v, 0);

    const result = top.map(([name, value], index) => ({
      name,
      value,
      fill: generateHslPalette(index, MAX_SOURCE_SLICES + (restTotal > 0 ? 1 : 0))
    }));

    if (restTotal > 0) {
      result.push({
        name: `Other (${rest.length} sources)`,
        value: restTotal,
        fill: "#94a3b8"
      });
    }
    return result;
  }, [sourceBreakdown]);

  const historicalTrendData = useMemo(() => {
    if (!recentAnalyses.length) return [];
    const timeBuckets = {};
    recentAnalyses.forEach(item => {
      const dateStr = item.analyzed_at ? item.analyzed_at.substring(11, 16) : "00:00";
      timeBuckets[dateStr] = (timeBuckets[dateStr] || 0) + 1;
    });
    return Object.entries(timeBuckets)
      .map(([time, count]) => ({ time, count }))
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [recentAnalyses]);

  const scatterDensityData = useMemo(() => {
    return recentAnalyses.map((item, index) => {
      const incidentDate = new Date(item.analyzed_at?.replace(" ", "T") || Date.now());
      const hourOfDay = Number.isNaN(incidentDate.getTime()) ? index % 24 : incidentDate.getHours();
      return {
        hour: hourOfDay,
        score: item.priority_score || 0,
        title: item.title || "Untitled incident",
        severity: item.severity || "unknown",
        source: item.source || "System Stream",
        summary: item.summary || "No supplemental details recorded.",
        category: item.category || "General Threat"
      };
    });
  }, [recentAnalyses]);

  const priorityDistributionData = useMemo(() => {
    const total = Object.values(severityBreakdown).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(severityBreakdown).map(([key, val]) => ({
      name: key,
      value: val,
      percentage: ((val / total) * 100).toFixed(0)
    }));
  }, [severityBreakdown]);

  return (
    <PageShell>
      <div className="v-dashboard-root">
        {/* Header */}
        <div className="v-command-header">
          <div className="v-header-meta-group">
            <div className="v-brand-pill">
              <Radio size={13} className="v-pulse-icon" />
              <span>KAVACH AI AGENT ACTIVE</span>
            </div>
            <h1 className="v-command-title">Varuna</h1>
            <p className="v-command-subtitle">Emergency command system &amp; analytical matrix feed</p>
          </div>

          <div className="v-command-telemetry-meta">
            <div className="v-meta-item">
              <Clock size={14} className="v-accent-blue" />
              <span className="v-meta-val v-mono">{currentTime}</span>
            </div>
            {lastUpdated && (
              <div className="v-meta-item">
                <Zap size={14} className="v-accent-emerald" />
                <span className="v-meta-label">LAST SYNC</span>
                <span className="v-meta-val v-mono">{timeAgo(lastUpdated.toISOString()).toUpperCase()}</span>
              </div>
            )}
            <button
              className={`v-premium-action-btn ${refreshing ? "spinning" : ""}`}
              onClick={() => load(true)}
              disabled={refreshing}
              aria-label="Synchronize feeds"
            >
              <RefreshCw size={14} />
              <span>{refreshing ? "Syncing…" : "Force refresh"}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="v-premium-alert-banner" role="alert">
            <AlertCircle size={18} className="v-alert-error-icon" />
            <div className="v-alert-text">
              <strong>System connection error:</strong> {error}
            </div>
            <button className="v-alert-retry" onClick={() => load()}>Retry connection</button>
          </div>
        )}

        {/* KPI Row */}
        <div className="v-premium-kpi-grid">
          <StatCard label="TOTAL INCIDENTS TRACKED" value={summary.total_incidents ?? "0"} loading={loading} icon={TrendingUp} trend="+12.4%" />
          <StatCard label="CRITICAL THREATS ISOLATED" value={severityBreakdown.Critical ?? "0"} loading={loading} icon={ShieldAlert} />
          <StatCard label="CONNECTED NETWORK SOURCES" value={Object.keys(sourceBreakdown).length ?? "0"} loading={loading} icon={Radio} />
          <StatCard label="AI ANALYSIS EFFICIENCY" value={summary.total_analyzed != null ? `${summary.total_analyzed} units` : "—"} loading={loading} icon={Zap} />
          <StatCard label="AVG PRIORITY VECTOR" value={summary.average_priority_score != null ? summary.average_priority_score.toFixed(1) : "—"} loading={loading} icon={Siren} />
        </div>

        {/* Trend + Source attribution */}
        <div className="v-dashboard-matrix-row matching-twin">
          <div className="v-premium-chart-card">
            <div className="v-card-header-context">
              <Activity size={15} className="v-panel-icon" />
              <h3>Incident chronology trend</h3>
            </div>
            <div className="v-chart-container-fixed">
              {loading ? (
                <div className="v-premium-skeleton full-height" />
              ) : historicalTrendData.length === 0 ? (
                <div className="v-empty-chart-fallback">No data available for this window</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historicalTrendData} margin={{ top: 15, right: 15, left: -20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
                    <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "12px", boxShadow: "0 8px 24px rgba(15,23,42,0.12)" }}
                      labelStyle={{ color: "#64748b", fontWeight: 600, fontSize: 12 }}
                      itemStyle={{ color: "#0f172a", fontSize: 12 }}
                    />
                    <Area type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} fillOpacity={1} fill="url(#trendGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="v-premium-chart-card">
            <div className="v-card-header-context">
              <Crosshair size={15} className="v-panel-icon" />
              <h3>Telemetry source attribution</h3>
            </div>
            <div className="v-chart-container-fixed">
              {loading ? (
                <div className="v-premium-skeleton full-height" />
              ) : doughnutSourceData.length === 0 ? (
                <div className="v-empty-chart-fallback">No source data available</div>
              ) : (
                <div style={{ display: "flex", height: "100%", gap: 12 }}>
                  <div style={{ flex: "1 1 55%", minWidth: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={doughnutSourceData}
                          cx="50%"
                          cy="50%"
                          innerRadius={68}
                          outerRadius={95}
                          paddingAngle={2}
                          dataKey="value"
                          animationDuration={500}
                        >
                          {doughnutSourceData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} stroke="#ffffff" strokeWidth={2} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "10px", boxShadow: "0 8px 24px rgba(15,23,42,0.12)" }}
                          itemStyle={{ color: "#0f172a", fontSize: 12 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ flex: "1 1 45%", minWidth: 0, display: "flex", alignItems: "center" }}>
                    <ScrollableLegend items={doughnutSourceData} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Categories + priority mix */}
        <div className="v-dashboard-matrix-row matching-twin">
          <div className="v-premium-chart-card">
            <div className="v-card-header-context">
              <Compass size={15} className="v-panel-icon" />
              <h3>Category distribution</h3>
            </div>
            <div className="v-chart-container-fixed custom-scroll-panel">
              {loading ? (
                <div className="v-premium-skeleton full-height" />
              ) : categoryTreeData.length === 0 ? (
                <div className="v-empty-chart-fallback">No category data available</div>
              ) : (
                <div className="v-treemap-list-simulation">
                  {categoryTreeData.map((item, index) => (
                    <div key={index} className="v-treemap-row-item">
                      <div className="v-treemap-meta-info">
                        <span className="v-tree-label" title={item.name}>{item.name}</span>
                        <span className="v-tree-value v-mono">{item.value} ({item.percentage}%)</span>
                      </div>
                      <div className="v-treemap-track-bar">
                        <div
                          className="v-treemap-fill-bar"
                          style={{ width: `${item.percentage}%`, background: item.fill }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="v-premium-chart-card">
            <div className="v-card-header-context">
              <Layers size={15} className="v-panel-icon" />
              <h3>Critical vector risk volumes</h3>
            </div>
            <div className="v-chart-container-fixed flex-center">
              {loading ? (
                <div className="v-premium-skeleton full-height" />
              ) : Object.keys(severityBreakdown).length === 0 ? (
                <div className="v-empty-chart-fallback">No severity data available</div>
              ) : (
                <div className="v-horizontal-stacked-component">
                  <div className="v-stacked-bar-composite">
                    {priorityDistributionData.map((segment, index) => {
                      if (segment.value === 0) return null;
                      return (
                        <div
                          key={index}
                          className="v-composite-segment-fill"
                          style={{ width: `${segment.percentage}%`, backgroundColor: resolveSeverityColor(segment.name) }}
                          title={`${segment.name}: ${segment.value}`}
                        />
                      );
                    })}
                  </div>
                  <div className="v-stacked-legend-grid">
                    {priorityDistributionData.map((segment, index) => (
                      <div key={index} className="v-legend-item-pill">
                        <span className="v-legend-dot" style={{ backgroundColor: resolveSeverityColor(segment.name) }} />
                        <span className="v-legend-name" title={segment.name}>{segment.name}</span>
                        <span className="v-legend-val v-mono">{segment.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Priority vs time scatter */}
        <div className="v-premium-chart-card large-fullwidth">
          <div className="v-card-header-context">
            <Terminal size={15} className="v-panel-icon" />
            <h3>Priority vector vs. timeline mapping</h3>
          </div>
          <div className="v-chart-container-fixed">
            {loading ? (
              <div className="v-premium-skeleton full-height" />
            ) : scatterDensityData.length === 0 ? (
              <div className="v-empty-chart-fallback">No analysis events in this window</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 30, bottom: 10, left: -20 }}>
                  <XAxis type="number" dataKey="hour" name="Hour" unit=":00" domain={[0, 23]} stroke="#94a3b8" tickLine={false} axisLine={{ stroke: "#e2e8f0" }} fontSize={11} />
                  <YAxis type="number" dataKey="score" name="Priority Vector" domain={[0, 100]} stroke="#94a3b8" tickLine={false} axisLine={{ stroke: "#e2e8f0" }} fontSize={11} />
                  <ZAxis type="number" range={[90, 400]} />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3", stroke: "rgba(15,23,42,0.15)" }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload;
                        const sevColor = resolveSeverityColor(item.severity);
                        return (
                          <div className="v-premium-bubble-tooltip">
                            <div className="v-tooltip-head" style={{ borderLeft: `3px solid ${sevColor}`, paddingLeft: 8 }}>
                              <h4>{item.title}</h4>
                              <span className="v-tooltip-pill" style={{ backgroundColor: `${sevColor}1a`, color: sevColor }}>{item.severity}</span>
                            </div>
                            <div className="v-tooltip-body-meta">
                              <p><strong>Source:</strong> {item.source} &nbsp;•&nbsp; <strong>Category:</strong> {item.category}</p>
                              <p><strong>Score:</strong> {item.score} &nbsp;•&nbsp; Logged at {item.hour}:00</p>
                              <p className="v-tooltip-desc-summary">{item.summary}</p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Scatter name="Threat Matrices" data={scatterDensityData}>
                    {scatterDensityData.map((entry, index) => {
                      const color = resolveSeverityColor(entry.severity);
                      return <Cell key={`cell-${index}`} fill={color} fillOpacity={0.55} stroke={color} strokeWidth={1.5} />;
                    })}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Incident cards + live feed */}
        <div className="v-dashboard-matrix-row split-70-30">
          <div className="v-incident-feed-section">
            <div className="v-section-heading">
              <Siren size={17} className="v-accent-orange" />
              <h2>Critical action targets ({criticalIncidents.length})</h2>
            </div>

            {loading ? (
              <div className="v-cards-vertical-stack">
                {[1, 2].map((i) => (
                  <div key={i} className="v-premium-skeleton" style={{ height: 180, borderRadius: "18px" }} />
                ))}
              </div>
            ) : criticalIncidents.length === 0 ? (
              <div className="v-premium-empty-state-card">
                <h4>System threat channels silent</h4>
                <p>No actionable emergencies detected inside the current telemetry segment window.</p>
              </div>
            ) : (
              <div className="v-cards-vertical-stack">
                {criticalIncidents.map((incident) => {
                  const sevColor = resolveSeverityColor(incident.severity);
                  return (
                    <div
                      key={incident.incident_id}
                      className="v-wallet-linear-card"
                      style={{ "--edge-glow": sevColor }}
                      onClick={() => navigate("/map", { state: { focusId: incident.incident_id } })}
                    >
                      <div className="v-wallet-card-backlight" />
                      <div className="v-wallet-inner-layout">
                        <div className="v-wallet-top-meta-line">
                          <div className="v-identity-badge-group">
                            <span className="v-source-tag" title={incident.source}>{incident.source}</span>
                            <span className="v-category-tag">{incident.category}</span>
                          </div>
                          <div className="v-scoring-badge-cluster">
                            <SeverityBadge severity={incident.severity} size="sm" />
                            <div className="v-score-vector-pill">
                              <span>VS:</span>
                              <strong className="v-mono">{incident.priority_score}</strong>
                            </div>
                          </div>
                        </div>

                        <h4 className="v-wallet-incident-title">{incident.title}</h4>

                        {incident.summary && <p className="v-wallet-summary-text">{incident.summary}</p>}

                        {!!incident.recommended_actions?.length && (
                          <div className="v-wallet-actions-box">
                            <span className="v-action-lbl">Recommended deployment procedures</span>
                            <ul className="v-action-bullets">
                              {incident.recommended_actions.slice(0, 2).map((action, idx) => (
                                <li key={idx}>{action}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="v-wallet-footer-meta">
                          <div className="v-geo-location-string v-mono">
                            <MapPin size={12} />
                            <span>
                              {locationLabels[incident.incident_id]
                                ? locationLabels[incident.incident_id]
                                : `${incident.latitude?.toFixed(4)}, ${incident.longitude?.toFixed(4)}`}
                            </span>
                          </div>

                          <div className="v-card-interactive-buttons">
                            <button className="v-card-btn-action tertiary">
                              <Eye size={12} /> <span>Open</span>
                            </button>
                            <button className="v-card-btn-action tertiary">
                              <MapPin size={12} /> <span>Locate</span>
                            </button>
                            <button className="v-card-btn-action primary-glow" style={{ color: sevColor }}>
                              <Zap size={12} /> <span>Analyze</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="v-timeline-feed-section">
            <div className="v-section-heading">
              <Clock size={17} className="v-accent-blue" />
              <h2>Live operations feed</h2>
            </div>

            {loading ? (
              <div className="v-premium-skeleton" style={{ height: 400, borderRadius: "18px" }} />
            ) : recentAnalyses.length === 0 ? (
              <div className="v-premium-empty-state-card">
                <p>Operational stream indexes completely dry.</p>
              </div>
            ) : (
              <div className="v-premium-vertical-timeline-container custom-scroll-panel">
                <div className="v-timeline-spine-axis" />
                {recentAnalyses.map((item) => {
                  const accentColor = resolveSeverityColor(item.severity);
                  return (
                    <div key={item.incident_id} className="v-timeline-node-row">
                      <div
                        className="v-timeline-marker-pulsar"
                        style={{ backgroundColor: accentColor, boxShadow: `0 0 0 4px ${accentColor}22, 0 0 10px ${accentColor}66` }}
                      />
                      <div className="v-timeline-node-bubble">
                        <div className="v-node-header-info">
                          <span className="v-node-timestamp v-mono">{timeAgo(item.analyzed_at)}</span>
                          <span className="v-node-source-label" title={item.source}>{item.source || "STREAM"}</span>
                        </div>
                        <h5 className="v-node-incident-title">{item.title}</h5>
                        <div className="v-node-footer-metrics">
                          <span className="v-mini-pill" style={{ borderColor: `${accentColor}55`, color: accentColor }}>{item.severity}</span>
                          <span className="v-mini-score v-mono">Vector score: {item.priority_score}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
};

export default UserDashboard;