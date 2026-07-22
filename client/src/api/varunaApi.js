// src/api/varunaApi.js
// Client for the KAVACH Rust backend (Axum). This is the ONLY backend the
// frontend talks to — it never calls the Python ML service directly.
//
// Real, documented endpoints (nothing else exists):
//   GET  /incidents            -> raw incident list
//   GET  /incidents/analyze    -> AI-analyzed incident list
//   POST /chat                 -> { question } -> { answer, relevant_incidents, confidence, model, processing_time_ms }
//   POST /report               -> { description, latitude, longitude, category } -> AI analysis of the report
import axios from "axios";
import Cookies from "js-cookie";
import { API_BASE_URL } from "../config";

const BASE_URL = API_BASE_URL;

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 90000,
});

client.interceptors.request.use((config) => {
  const token = Cookies.get("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** GET /incidents — raw deduplicated incidents, no AI analysis */
export const getIncidents = async (limit = 50000) => {
  const { data } = await client.get("/incidents", { params: { limit } });
  return Array.isArray(data) ? data : [];
};

/** GET /incidents/analyze — AI-analyzed incidents */
export const getAnalyzedIncidents = async (limit = 70) => {
  const { data } = await client.get("/incidents/analyze", { params: { limit } });
  return Array.isArray(data) ? data : [];
};

/** Back-compat alias: raw incidents, used where the old code called getAllSources() */
export const getAllSources = getIncidents;

/** Back-compat alias: analyzed incidents, used where the old code called getAllAnalyses() */
export const getAllAnalyses = getAnalyzedIncidents;

/** POST /chat — natural language Q&A over current incidents */
export const askAI = async (question) => {
  const { data } = await client.post("/chat", { question });
  return data;
};

// Backwards-compatible aliases for legacy imports.
export const askKavach = askAI;
export const askVaruna = askAI;

/** POST /report — citizen report submission, returns AI analysis of the report */
export const submitReport = async ({ description, latitude, longitude, category }) => {
  const { data } = await client.post("/incidents/report", { description, latitude, longitude, category });
  return data;
};

/**
 * There is no /analyze/dashboard endpoint on the real backend.
 * Build the same shape the Dashboard/Alerts pages expect by combining
 * /incidents and /incidents/analyze on the client.
 *
 * Dashboard, LiveMap, and Alerts all call this independently. Without a
 * shared cache, navigating between those three pages fired 6 backend
 * requests (2 each) every single time, even for data that was seconds old.
 * We share one in-flight promise across simultaneous callers and cache the
 * resolved result for DASHBOARD_CACHE_MS so a page revisit within that
 * window is instant and makes zero network calls.
 */
const DASHBOARD_CACHE_MS = 60 * 1000; // backend data itself only refreshes every 30 min via the scheduler
let dashboardCache = null; // { data, fetchedAt }
let dashboardInFlight = null; // Promise, shared by concurrent callers

const buildDashboard = async () => {
  const [incidents, analyzed] = await Promise.all([
    getIncidents(),
    getAnalyzedIncidents(),
  ]);

  const analysisByIncidentId = new Map(analyzed.map((a) => [a.incident_id, a]));

  const merged = incidents.map((inc) => {
    const a = analysisByIncidentId.get(inc.id);
    return {
      incident_id: inc.id,
      title: inc.title,
      category: inc.category,
      source: inc.source,
      latitude: inc.latitude,
      longitude: inc.longitude,
      timestamp: inc.timestamp,
      updated_at: inc.updated_at ?? null,
      // --- Real lifecycle fields (see backend migration 0005) ---
      // 'active' | 'resolved' | 'unknown' — source-native status when
      // available (GDACS, USGS); 'unknown' for everything else.
      status: inc.status ?? null,
      // Source's own last-modified time, when the source provides one.
      source_updated_at: inc.source_updated_at ?? null,
      // Source-provided estimated/actual end of the event, when available.
      expected_end: inc.expected_end ?? null,
      // How many consecutive ingest cycles have re-confirmed this incident
      // is still present in its source feed — the fallback "still active"
      // signal for sources with no native status field.
      confirmation_streak: inc.confirmation_streak ?? 0,
      last_seen_at: inc.last_seen_at ?? null,
      url: inc.url,
      severity: a?.analysis?.severity ?? inc.severity ?? null,
      priority_score: a?.analysis?.priority_score ?? null,
      confidence: a?.analysis?.confidence ?? null,
      summary: a?.analysis?.summary ?? inc.description ?? "",
      recommended_actions: a?.analysis?.recommended_actions ?? [],
      analyzed_at: a ? inc.timestamp : null,
    };
  });

  const severity_breakdown = {};
  const category_breakdown = {};
  const source_breakdown = {};
  let scoreSum = 0;
  let scoreCount = 0;

  for (const item of merged) {
    if (item.severity) {
      severity_breakdown[item.severity] = (severity_breakdown[item.severity] || 0) + 1;
    }
    if (item.category) {
      category_breakdown[item.category] = (category_breakdown[item.category] || 0) + 1;
    }
    if (item.source) {
      source_breakdown[item.source] = (source_breakdown[item.source] || 0) + 1;
    }
    if (typeof item.priority_score === "number") {
      scoreSum += item.priority_score;
      scoreCount += 1;
    }
  }

  const top_critical_incidents = [...merged]
    .filter((i) => i.priority_score != null)
    .sort((a, b) => b.priority_score - a.priority_score)
    .slice(0, 6);

  const recent_analyses = [...merged]
    .filter((i) => i.analyzed_at)
    .sort((a, b) => new Date(b.analyzed_at) - new Date(a.analyzed_at))
    .slice(0, 10);

  return {
    summary: {
      total_incidents: incidents.length,
      total_analyzed: analyzed.length,
      average_priority_score: scoreCount ? scoreSum / scoreCount : null,
    },
    severity_breakdown,
    category_breakdown,
    source_breakdown,
    top_critical_incidents,
    recent_analyses,
    all_incidents: merged,
  };
};

/**
 * Cached, deduped entry point used by Dashboard/LiveMap/Alerts.
 * Pass { force: true } (e.g. from a Refresh button) to bypass the cache.
 */
export const getDashboard = async ({ force = false } = {}) => {
  const isFresh = dashboardCache && Date.now() - dashboardCache.fetchedAt < DASHBOARD_CACHE_MS;
  if (!force && isFresh) {
    return dashboardCache.data;
  }

  if (!force && dashboardInFlight) {
    return dashboardInFlight;
  }

  dashboardInFlight = buildDashboard()
    .then((data) => {
      dashboardCache = { data, fetchedAt: Date.now() };
      return data;
    })
    .finally(() => {
      dashboardInFlight = null;
    });

  return dashboardInFlight;
};

/** Clears the dashboard cache, e.g. after submitting a new report. */
export const invalidateDashboardCache = () => {
  dashboardCache = null;
};

/**
 * There is no /analyze endpoint for a single ad-hoc incident either.
 * The closest real equivalent is POST /report, which returns an AI
 * analysis for a description + location. Shaped to match what
 * Reports.jsx already expects to render (result.analysis / result.metadata).
 */
export const analyzeIncident = async ({ description, latitude, longitude, category = "Other" }) => {
  return submitReport({ description, latitude, longitude, category });
};

// Severity is always one of these four values.
export const SEVERITY_ORDER = ["Low", "Moderate", "High", "Critical"];

export const SEVERITY_COLORS = {
  Low: "#16a34a",
  Moderate: "#eab308",
  High: "#f97316",
  Critical: "#dc2626",
};

/** PATCH /auth/profile — update lat/lng and preferences */
export const updateProfile = async ({ latitude, longitude, preferences }) => {
  console.log("[updateProfile] → PATCH /auth/profile", { latitude, longitude, preferences });
  try {
    const { data } = await client.patch("/auth/profile", { latitude, longitude, preferences });
    console.log("[updateProfile] ✅ success:", data);
    return data;
  } catch (err) {
    console.error("[updateProfile] ❌ FAILED:", err.response?.status, err.response?.data || err.message);
    throw err;
  }
};

export default client;