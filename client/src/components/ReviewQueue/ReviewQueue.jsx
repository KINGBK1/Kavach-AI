import React, { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  AlertCircle,
  Globe,
  Link2,
  ExternalLink,
  BookOpen,
  Clock,
  MapPin,
  RefreshCw,
  Eye,
  Sparkles,
  Hourglass,
} from "lucide-react";
import PageShell from "../Layout/PageShell";
import { getCitizenReports } from "../../api/varunaApi";
import { SeverityBadge, PriorityScore, ConfidenceBadge } from "../common/Severity";
import "../Reports/Reports.css";
import "../TrustLedger/TrustLedger.css";
import "./ReviewQueue.css";

const ReviewQueue = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCitizenReports({ status: "unverified", limit: 50 });
      setReports(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load review queue:", err);
      setError("Couldn't load the review queue. Check the backend is reachable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sorted = [...reports].sort((a, b) => {
    const aConf = a.analysis?.confidence ?? 0;
    const bConf = b.analysis?.confidence ?? 0;
    return bConf - aConf;
  });

  return (
    <PageShell>
      <div className="v-trust-ledger">
        <div className="v-trust-ledger-header">
          <div>
            <h1>Review Queue</h1>
            <p>
              Citizen reports that the verification agent couldn't confidently confirm or reject.
              Medium-confidence reports are flagged "likely real" and should be reviewed first.
              Use this queue to triage and promote genuine reports into the trusted incidents table.
            </p>
          </div>
          <button
            className="v-trust-ledger-refresh"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "v-spin" : ""} />
            Refresh
          </button>
        </div>

        {loading && <div className="v-trust-ledger-state">Loading…</div>}
        {error && <div className="v-trust-ledger-state v-trust-ledger-error">{error}</div>}
        {!loading && !error && reports.length === 0 && (
          <div className="v-trust-ledger-state">
            <ShieldCheck size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
            <p>No unverified reports in the queue.</p>
          </div>
        )}

        <div className="v-review-queue-summary">
          <div className="v-review-summary-card">
            <Hourglass size={16} />
            <span>Total pending</span>
            <strong>{reports.length}</strong>
          </div>
          <div className="v-review-summary-card priority">
            <Sparkles size={16} />
            <span>Likely real (≥40% confidence)</span>
            <strong>{reports.filter((r) => (r.analysis?.confidence ?? 0) >= 0.4).length}</strong>
          </div>
        </div>

        <div className="v-trust-ledger-list">
          {sorted.map((report) => {
            const analysis = report.analysis || {};
            const verification = analysis.verification || {};
            const confidence = analysis.confidence ?? 0;
            const isLikelyReal = confidence >= 0.4;
            const sourcesChecked = verification.sources_checked || [];
            const webSummary = verification.web_search_summary || "";

            return (
              <div
                key={report.id}
                className={`v-trust-ledger-card v-review-card ${isLikelyReal ? "v-review-card-priority" : ""}`}
              >
                {isLikelyReal && (
                  <span className="v-review-priority-tag">
                    <Sparkles size={12} /> Likely real
                  </span>
                )}

                <div className="v-trust-ledger-card-top">
                  <div className="v-verification-badge v-verification-badge--rejected">
                    <Hourglass size={18} />
                    <div>
                      <strong>Unverified</strong>
                      <span>Awaiting human review</span>
                    </div>
                  </div>
                  <span className="v-trust-ledger-time">
                    <Clock size={12} /> {new Date(report.created_at).toLocaleString()}
                  </span>
                </div>

                <div className="v-critical-card-top">
                  <SeverityBadge severity={analysis.severity} size="sm" />
                  <ConfidenceBadge confidence={confidence} />
                  <PriorityScore score={analysis.priority_score} severity={analysis.severity} />
                </div>

                <p className="v-trust-ledger-description">{report.description}</p>

                {analysis.summary && <p className="v-trust-ledger-summary">{analysis.summary}</p>}

                <div className="v-trust-ledger-meta">
                  <MapPin size={12} />
                  {report.latitude?.toFixed(3)}, {report.longitude?.toFixed(3)}
                  {report.category ? ` · ${report.category}` : ""}
                </div>

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
              </div>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
};

export default ReviewQueue;
