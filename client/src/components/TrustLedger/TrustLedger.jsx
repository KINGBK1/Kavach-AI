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
} from "lucide-react";
import PageShell from "../Layout/PageShell";
import { getCitizenReports } from "../../api/varunaApi";
import { SeverityBadge, PriorityScore } from "../common/Severity";
// Reuses Reports.css directly rather than duplicating the verification-badge/
// sources-list styles — this page shows the exact same agent-reasoning UI
// that already exists in the citizen-report submission modal, just for
// every report instead of only the one just submitted.
import "../Reports/Reports.css";
import "./TrustLedger.css";

const STATUS_FILTERS = [
  { key: null, label: "All" },
  { key: "verified", label: "Verified" },
  { key: "rejected", label: "Rejected" },
];

const TrustLedger = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);

  const load = useCallback(async (status) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCitizenReports({ status, limit: 100 });
      setReports(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load citizen reports:", err);
      setError("Couldn't load the trust ledger. Check the backend is reachable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(statusFilter); }, [load, statusFilter]);

  return (
    <PageShell>
      <div className="v-trust-ledger">
        <div className="v-trust-ledger-header">
          <div>
            <h1>Trust Ledger</h1>
            <p>
              Every citizen report is checked by an AI verification agent —
              it searches for recent news coverage and cross-references our
              trusted incident database before deciding. This page shows
              every decision and the evidence behind it, not just the verdict.
            </p>
          </div>
          <button
            className="v-trust-ledger-refresh"
            onClick={() => load(statusFilter)}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "v-spin" : ""} />
            Refresh
          </button>
        </div>

        <div className="v-trust-ledger-filters">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.label}
              className={`v-trust-ledger-filter ${statusFilter === f.key ? "active" : ""}`}
              onClick={() => setStatusFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading && <div className="v-trust-ledger-state">Loading…</div>}
        {error && <div className="v-trust-ledger-state v-trust-ledger-error">{error}</div>}
        {!loading && !error && reports.length === 0 && (
          <div className="v-trust-ledger-state">No reports match this filter yet.</div>
        )}

        <div className="v-trust-ledger-list">
          {reports.map((report) => {
            const analysis = report.analysis || {};
            const verification = analysis.verification || {};
            const isVerified = verification.is_verified ?? report.status === "verified";
            const sourcesChecked = verification.sources_checked || [];
            const webSummary = verification.web_search_summary || "";

            return (
              <div key={report.id} className="v-trust-ledger-card">
                <div className="v-trust-ledger-card-top">
                  <div
                    className={`v-verification-badge ${
                      isVerified ? "v-verification-badge--verified" : "v-verification-badge--rejected"
                    }`}
                  >
                    {isVerified ? (
                      <>
                        <ShieldCheck size={18} />
                        <div>
                          <strong>Verified</strong>
                          <span>Web sources confirm this event</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={18} />
                        <div>
                          <strong>Rejected</strong>
                          <span>No evidence found</span>
                        </div>
                      </>
                    )}
                  </div>
                  <span className="v-trust-ledger-time">
                    <Clock size={12} /> {new Date(report.created_at).toLocaleString()}
                  </span>
                </div>

                <div className="v-critical-card-top">
                  <SeverityBadge severity={analysis.severity} size="sm" />
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

export default TrustLedger;