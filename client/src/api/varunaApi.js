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

const rawUrl = import.meta.env.VITE_VARUNA_API_URL;
const trimmedUrl = rawUrl?.replace(/\/+$|\/api$/g, "") || "http://localhost:8000";
const BASE_URL = `${trimmedUrl}/api`;

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 90000, // analysis endpoints can be slow (LLM calls)
});

/** GET /incidents — raw deduplicated incidents, no AI analysis */
export const getIncidents = async () => {
  const { data } = await client.get("/incidents");
  return Array.isArray(data) ? data : [];
};

/** GET /incidents/analyze — AI-analyzed incidents */
export const getAnalyzedIncidents = async () => {
  const { data } = await client.get("/incidents/analyze");
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
 */
export const getDashboard = async () => {
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

export default client;