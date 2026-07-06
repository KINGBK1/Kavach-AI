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
  Crosshair,
  CalendarDays
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Legend,
  PieChart,
  Pie,
  Cell
} from "recharts";
import PageShell from "../Layout/PageShell";
import { getDashboard } from "../../api/varunaApi";
import { lookUpLocationName } from "../../utils/geolocation";
import { SeverityBadge } from "../common/Severity";
import InfoTooltip from "../common/InfoTooltip";
import "./UserDashboard.css";

// Cap the number of individually-colored donut slices / legend rows so the
// UI stays readable even when the backend reports 100+ distinct sources.
const MAX_SOURCE_SLICES = 8;
const MAX_CATEGORY_ROWS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

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

const parseIncidentDate = (item) => {
  const rawDate = item?.timestamp || item?.analyzed_at;
  if (!rawDate) return null;
  const parsed = new Date(String(rawDate).replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const StatCard = ({ label, value, loading, icon: Icon, trend, trendClass = "positive", info }) => (
  <div className="v-premium-kpi-card">
    <div className="v-kpi-header">
      <span className="v-kpi-label">
        {label}
        {info && <InfoTooltip text={info} title={label} />}
      </span>
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
          <div className={`v-kpi-trend ${trendClass}`}>
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
  // Full incident set (same field LiveMap consumes) — this is what the
  // scatter plot below needs so it represents everything in the DB, not
  // just the handful of items in the "recent" feed.
  const allIncidents = data?.all_incidents || [];

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

  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }),
    []
  );

  const dailyIncidentData = useMemo(() => {
    const datedIncidents = allIncidents
      .map((item) => ({ ...item, parsedDate: parseIncidentDate(item) }))
      .filter((item) => item.parsedDate);

    if (!datedIncidents.length) return [];

    const latestTime = Math.max(...datedIncidents.map((item) => item.parsedDate.getTime()));
    const latestDay = new Date(latestTime);
    latestDay.setHours(0, 0, 0, 0);
    const startDay = new Date(latestDay.getTime() - 13 * DAY_MS);

    const rows = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(startDay.getTime() + index * DAY_MS);
      const key = date.toISOString().slice(0, 10);
      return {
        key,
        day: dayFormatter.format(date),
        incidents: 0
      };
    });
    const rowByKey = new Map(rows.map((row) => [row.key, row]));

    datedIncidents.forEach((item) => {
      const day = new Date(item.parsedDate);
      day.setHours(0, 0, 0, 0);
      const key = day.toISOString().slice(0, 10);
      const row = rowByKey.get(key);
      if (row) row.incidents += 1;
    });

    return rows;
  }, [allIncidents, dayFormatter]);

  const totalDailyIncidents = dailyIncidentData.reduce((sum, row) => sum + row.incidents, 0);
  const peakDayRow = dailyIncidentData.reduce(
    (peak, row) => (row.incidents > (peak?.incidents ?? -1) ? row : peak),
    null
  );

  const incidentTrend = useMemo(() => {
    const datedIncidents = allIncidents
      .map(parseIncidentDate)
      .filter(Boolean);

    if (!datedIncidents.length) return null;

    const latestTime = Math.max(...datedIncidents.map((date) => date.getTime()));
    const latestDay = new Date(latestTime);
    latestDay.setHours(23, 59, 59, 999);
    const currentStart = latestDay.getTime() - 7 * DAY_MS + 1;
    const previousStart = currentStart - 7 * DAY_MS;

    let currentCount = 0;
    let previousCount = 0;
    datedIncidents.forEach((date) => {
      const time = date.getTime();
      if (time >= currentStart && time <= latestDay.getTime()) currentCount += 1;
      else if (time >= previousStart && time < currentStart) previousCount += 1;
    });

    if (currentCount === 0 && previousCount === 0) return null;
    if (previousCount === 0) {
      return { label: currentCount > 0 ? "+100%" : "0%", className: currentCount > 0 ? "positive" : "neutral" };
    }

    const change = ((currentCount - previousCount) / previousCount) * 100;
    const sign = change > 0 ? "+" : "";
    return {
      label: `${sign}${change.toFixed(1)}%`,
      className: change > 0 ? "positive" : change < 0 ? "negative" : "neutral"
    };
  }, [allIncidents]);

  // --- Incidents by hour, split by severity -------------------------------
  // The previous bubble scatter (size = count, y = avg priority score,
  // color = severity) was unreadable: color barely showed at small bubble
  // sizes, low-priority incidents all collapsed onto a flat line near
  // y=0, and there was no way to read "how many" or "how severe" at a
  // glance. A stacked bar chart is the standard, legible way to show this:
  // one bar per hour of day, height = total incidents in that hour, and
  // the bar is divided into colored segments for Critical/High/Moderate/Low
  // so both volume AND severity mix are visible immediately, for the full
  // incident set (not just a small "recent" sample).
  const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
  const SEVERITY_KEYS = ["Critical", "High", "Moderate", "Low"];

  const hourlySeverityData = useMemo(() => {
    const source = allIncidents.length ? allIncidents : recentAnalyses;
    if (!source.length) return [];

    // One row per hour, pre-seeded so every hour appears even with 0 incidents.
    const rows = HOUR_LABELS.map((label, hour) => ({
      hour,
      label,
      Critical: 0,
      High: 0,
      Moderate: 0,
      Low: 0,
      total: 0
    }));

    source.forEach((item) => {
      const rawDate = item.analyzed_at || item.timestamp;
      const incidentDate = new Date((rawDate || "").replace(" ", "T") || Date.now());
      const hourOfDay = Number.isNaN(incidentDate.getTime()) ? 0 : incidentDate.getHours();
      const rawSeverity = (item.severity || "").toLowerCase();
      const severityKey =
        SEVERITY_KEYS.find((s) => s.toLowerCase() === rawSeverity) || "Low";

      rows[hourOfDay][severityKey] += 1;
      rows[hourOfDay].total += 1;
    });

    return rows;
  }, [allIncidents, recentAnalyses]);

  const totalHourlyIncidents = hourlySeverityData.reduce((sum, r) => sum + r.total, 0);
  const peakHourRow = hourlySeverityData.reduce(
    (peak, row) => (row.total > (peak?.total ?? -1) ? row : peak),
    null
  );

  const priorityDistributionData = useMemo(() => {
    const total = Object.values(severityBreakdown).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(severityBreakdown).map(([key, val]) => ({
      name: key,
      value: val,
      percentage: ((val / total) * 100).toFixed(0)
    }));
  }, [severityBreakdown]);

  // --- Action button handlers --------------------------------------------
  // Previously "Open" / "Locate" / "Analyze" had no onClick of their own,
  // so clicks bubbled up to the parent card's handler (which navigates to
  // /map with the same focusId regardless of which button was pressed).
  // Each button now does something distinct and stops propagation so it
  // doesn't also trigger the card's own click.
  const handleOpenIncident = (e, incident) => {
    e.stopPropagation();
    if (incident.url) {
      window.open(incident.url, "_blank", "noopener,noreferrer");
    } else {
      navigate("/map", { state: { focusId: incident.incident_id } });
    }
  };

  const handleLocateIncident = (e, incident) => {
    e.stopPropagation();
    navigate("/map", {
      state: {
        focusId: incident.incident_id,
        // Explicit coordinates so the map can fly straight there even if
        // the id lookup in LiveMap's incident list momentarily misses.
        focusLat: incident.latitude,
        focusLng: incident.longitude
      }
    });
  };

  const handleAnalyzeIncident = (e, incident) => {
    e.stopPropagation();
    navigate("/reports", { state: { analyzeId: incident.incident_id } });
  };

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
          <StatCard
            label="TOTAL INCIDENTS TRACKED"
            value={summary.total_incidents ?? "0"}
            loading={loading}
            icon={TrendingUp}
            trend={incidentTrend?.label}
            trendClass={incidentTrend?.className}
            info="Every incident Varuna has ingested from all connected sources, regardless of severity or whether it's been AI-analyzed yet."
          />
          <StatCard
            label="CRITICAL THREATS ISOLATED"
            value={severityBreakdown.Critical ?? "0"}
            loading={loading}
            icon={ShieldAlert}
            info="Incidents the AI classified as Critical severity — the highest urgency tier, requiring immediate attention."
          />
          <StatCard
            label="CONNECTED NETWORK SOURCES"
            value={Object.keys(sourceBreakdown).length ?? "0"}
            loading={loading}
            icon={Radio}
            info="Number of distinct data feeds (news APIs, sensor networks, alert systems, etc.) currently reporting incidents."
          />
          <StatCard
            label="AI ANALYSIS EFFICIENCY"
            value={summary.total_analyzed != null ? `${summary.total_analyzed} units` : "—"}
            loading={loading}
            icon={Zap}
            info="How many raw incident reports have been fully processed by the AI analysis pipeline (severity scored, categorized, actions generated)."
          />
          <StatCard
            label="AVG PRIORITY VECTOR"
            value={summary.average_priority_score != null ? summary.average_priority_score.toFixed(1) : "—"}
            loading={loading}
            icon={Siren}
            info="The average priority score (0-100) across all analyzed incidents. Higher means the overall incident pool skews more urgent right now."
          />
        </div>

        {/* Trend + Source attribution */}
        <div className="v-dashboard-matrix-row matching-twin">
          <div className="v-premium-chart-card">
            <div className="v-card-header-context">
              <Activity size={15} className="v-panel-icon" />
              <h3>Incident chronology trend</h3>
              <InfoTooltip
                title="Incident chronology trend"
                text="Counts how many incidents from the live feed were logged in each time-of-day bucket (HH:MM). A rising area means incidents are being reported more frequently around that time."
              />
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
                    <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} allowDecimals={false} label={{ value: "Incidents", angle: -90, position: "insideLeft", fontSize: 10, fill: "#94a3b8" }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "12px", boxShadow: "0 8px 24px rgba(15,23,42,0.12)" }}
                      labelStyle={{ color: "#64748b", fontWeight: 600, fontSize: 12 }}
                      itemStyle={{ color: "#0f172a", fontSize: 12 }}
                      formatter={(value) => [`${value} incident${value === 1 ? "" : "s"}`, "Logged"]}
                      labelFormatter={(label) => `Time: ${label}`}
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
              <InfoTooltip
                title="Telemetry source attribution"
                text="Breaks down which data source reported each incident (news wires, sensor feeds, citizen reports, etc.). Slice size = share of total incidents from that source. The smallest sources are grouped into 'Other'."
              />
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
                          formatter={(value, name) => [`${value} incidents`, name]}
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
              <InfoTooltip
                title="Category distribution"
                text="Shows what TYPE of incidents make up the feed (e.g. flood, fire, storm, civil unrest). Bar length and % = share of all incidents in that category. Only the top 10 categories are listed individually; the rest are grouped under 'Other'."
              />
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
              <InfoTooltip
                title="Critical vector risk volumes"
                text="A single bar split proportionally by severity level (Low / Moderate / High / Critical). Segment width = what fraction of all incidents fall in that severity tier right now."
              />
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

        {/* Incidents by day */}
        <div className="v-premium-chart-card large-fullwidth">
          <div className="v-card-header-context">
            <CalendarDays size={15} className="v-panel-icon" />
            <h3>Day vs incidents</h3>
            <InfoTooltip
              title="Day vs incidents"
              text={`Every incident in the database grouped by calendar day for the latest 14-day window in the feed. Bar height is total incidents logged that day. The KPI trend compares the latest 7 days with the previous 7 days.`}
            />
            {!loading && totalDailyIncidents > 0 && (
              <span className="v-chart-count-pill v-mono">
                {totalDailyIncidents.toLocaleString()} incidents ·{" "}
                {peakDayRow ? `peak on ${peakDayRow.day}` : ""}
              </span>
            )}
          </div>
          <div className="v-chart-container-fixed">
            {loading ? (
              <div className="v-premium-skeleton full-height" />
            ) : dailyIncidentData.length === 0 ? (
              <div className="v-empty-chart-fallback">No dated incidents available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyIncidentData} margin={{ top: 20, right: 20, bottom: 10, left: -10 }}>
                  <XAxis
                    dataKey="day"
                    stroke="#94a3b8"
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                    fontSize={10.5}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                    fontSize={11}
                    allowDecimals={false}
                    label={{ value: "Incidents", angle: -90, position: "insideLeft", fontSize: 10, fill: "#94a3b8" }}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(148,163,184,0.12)" }}
                    contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "12px", boxShadow: "0 8px 24px rgba(15,23,42,0.12)" }}
                    labelStyle={{ color: "#0f172a", fontWeight: 700, fontSize: 12.5, marginBottom: 4 }}
                    formatter={(value) => [`${value} incident${value === 1 ? "" : "s"}`, "Logged"]}
                    labelFormatter={(label) => `Day: ${label}`}
                  />
                  <Bar dataKey="incidents" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Incidents by hour, stacked by severity */}
        <div className="v-premium-chart-card large-fullwidth">
          <div className="v-card-header-context">
            <Terminal size={15} className="v-panel-icon" />
            <h3>Incidents by hour &amp; severity</h3>
            <InfoTooltip
              title="Incidents by hour & severity"
              text={`Every incident in the database (${totalHourlyIncidents ? totalHourlyIncidents.toLocaleString() : "—"} total) grouped into the 24 hours of the day it was logged. Each bar's HEIGHT is how many incidents happened that hour; the colored segments show the severity mix (red = Critical, orange = High, yellow = Moderate, green = Low). Hover a bar for the exact breakdown.`}
            />
            {!loading && totalHourlyIncidents > 0 && (
              <span className="v-chart-count-pill v-mono">
                {totalHourlyIncidents.toLocaleString()} incidents ·{" "}
                {peakHourRow ? `peak at ${peakHourRow.label}` : ""}
              </span>
            )}
          </div>
          <div className="v-chart-container-fixed">
            {loading ? (
              <div className="v-premium-skeleton full-height" />
            ) : hourlySeverityData.length === 0 ? (
              <div className="v-empty-chart-fallback">No analysis events in this window</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlySeverityData} margin={{ top: 20, right: 20, bottom: 10, left: -10 }}>
                  <XAxis
                    dataKey="label"
                    stroke="#94a3b8"
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                    fontSize={10.5}
                    interval={1}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                    fontSize={11}
                    allowDecimals={false}
                    label={{ value: "Incidents", angle: -90, position: "insideLeft", fontSize: 10, fill: "#94a3b8" }}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(148,163,184,0.12)" }}
                    contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "12px", boxShadow: "0 8px 24px rgba(15,23,42,0.12)" }}
                    labelStyle={{ color: "#0f172a", fontWeight: 700, fontSize: 12.5, marginBottom: 4 }}
                    formatter={(value, name) => [`${value} incident${value === 1 ? "" : "s"}`, name]}
                    labelFormatter={(label, payload) => {
                      const total = payload?.[0]?.payload?.total ?? 0;
                      return `${label} — ${total} incident${total === 1 ? "" : "s"} total`;
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    height={32}
                    iconType="circle"
                    iconSize={9}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="Critical" stackId="sev" fill={resolveSeverityColor("critical")} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="High" stackId="sev" fill={resolveSeverityColor("high")} />
                  <Bar dataKey="Moderate" stackId="sev" fill={resolveSeverityColor("moderate")} />
                  <Bar dataKey="Low" stackId="sev" fill={resolveSeverityColor("low")} radius={[4, 4, 0, 0]} />
                </BarChart>
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
                      onClick={() => navigate("/map", { state: { focusId: incident.incident_id, focusLat: incident.latitude, focusLng: incident.longitude } })}
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
                            <button
                              className="v-card-btn-action tertiary"
                              onClick={(e) => handleOpenIncident(e, incident)}
                            >
                              <Eye size={12} /> <span>Open</span>
                            </button>
                            <button
                              className="v-card-btn-action tertiary"
                              onClick={(e) => handleLocateIncident(e, incident)}
                            >
                              <MapPin size={12} /> <span>Locate</span>
                            </button>
                            <button
                              className="v-card-btn-action primary-glow"
                              style={{ color: sevColor }}
                              onClick={(e) => handleAnalyzeIncident(e, incident)}
                            >
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
