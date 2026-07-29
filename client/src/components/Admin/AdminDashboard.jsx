import React, { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  AlertCircle,
  Clock,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  Users,
  Building,
  Briefcase,
  Shield,
  User,
  FileText,
  MapPin,
  Globe,
  Link2,
  ExternalLink,
  BookOpen,
  Sparkles,
  Hourglass,
  Flag,
  Siren,
  Search,
  Check,
  RotateCcw,
} from "lucide-react";
import PageShell from "../Layout/PageShell";
import {
  getPendingUsers,
  approveUser,
  getCitizenReports,
  promoteReport,
  rejectReport,
  getIncidents,
  updateIncidentStatus,
} from "../../api/varunaApi";
import { SeverityBadge, PriorityScore, ConfidenceBadge } from "../common/Severity";
import { ShieldAgentLoader, RadarPulseLoader, KavachSkeleton, ButtonSpinner } from "../common/CreativeLoaders";
import { useToast } from "../Toast/ToastContext";
import "../Reports/Reports.css";
import "./AdminDashboard.css";

const ROLE_CONFIG = {
  admin: { label: "Admin", icon: Shield, color: "var(--color-admin, #dc2626)" },
  ngo: { label: "NGO", icon: Building, color: "var(--color-ngo, #16a34a)" },
  ddmo: { label: "DDMO", icon: Briefcase, color: "var(--color-ddmo, #1e40af)" },
  user: { label: "User", icon: User, color: "var(--color-user, #0ea5e9)" },
};

const TABS = [
  { key: "users", label: "User Approvals", icon: Users },
  { key: "reports", label: "Review Reports", icon: FileText },
  { key: "incidents", label: "Manage Incidents", icon: Siren },
];

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState("users");
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [filter, setFilter] = useState("all");
  const addToast = useToast();

  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState(null);
  const [reportActionLoading, setReportActionLoading] = useState(null);

  const [incidentsList, setIncidentsList] = useState([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [incidentsError, setIncidentsError] = useState(null);
  const [incidentSearch, setIncidentSearch] = useState("");
  const [incidentStatusFilter, setIncidentStatusFilter] = useState("all");
  const [updatingIncidentId, setUpdatingIncidentId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const users = await getPendingUsers();
      setPending(Array.isArray(users) ? users : []);
    } catch (err) {
      console.error("Failed to load pending users:", err);
      setError("Could not load pending users. Make sure you are logged in as admin.");
      addToast("Failed to load pending users", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    setReportsError(null);
    try {
      const data = await getCitizenReports({ status: null, limit: 200 });
      setReports(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load reports:", err);
      setReportsError("Couldn't load reports.");
      addToast("Failed to load reports", "error");
    } finally {
      setReportsLoading(false);
    }
  }, [addToast]);

  const loadIncidents = useCallback(async () => {
    setIncidentsLoading(true);
    setIncidentsError(null);
    try {
      const data = await getIncidents(1000);
      setIncidentsList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load incidents:", err);
      setIncidentsError("Could not load incidents.");
      addToast("Failed to load incidents", "error");
    } finally {
      setIncidentsLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (activeTab === "reports") loadReports(); }, [activeTab, loadReports]);
  useEffect(() => { if (activeTab === "incidents") loadIncidents(); }, [activeTab, loadIncidents]);

  const handleStatusToggle = async (incidentId, currentStatus) => {
    const targetStatus = currentStatus === "resolved" ? "active" : "resolved";
    setUpdatingIncidentId(incidentId);
    try {
      await updateIncidentStatus(incidentId, targetStatus);
      addToast(
        targetStatus === "resolved"
          ? "Incident marked as Resolved — updated in database & map"
          : "Incident status restored to Active",
        "success"
      );
      setIncidentsList((prev) =>
        prev.map((item) =>
          (item.id === incidentId || item.incident_id === incidentId)
            ? { ...item, status: targetStatus }
            : item
        )
      );
    } catch (err) {
      addToast("Failed to update status: " + (err.response?.data?.detail || err.message), "error");
    } finally {
      setUpdatingIncidentId(null);
    }
  };

  const handleApprove = async (userId) => {
    setActionLoading(userId);
    try {
      await approveUser(userId);
      addToast("User approved successfully", "success");
      setPending((prev) => prev.filter((u) => u.id !== userId));
    } catch (err) {
      addToast("Failed to approve user: " + (err.response?.data?.message || err.message), "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handlePromoteReport = async (reportId) => {
    setReportActionLoading(reportId);
    try {
      const data = await promoteReport(reportId);
      const alertInfo = data.alert;
      if (alertInfo) {
        if (alertInfo.error) {
          addToast(`Promoted, but alert failed: ${alertInfo.error}`, "warning");
        } else if (alertInfo.sent > 0) {
          addToast(`Promoted — ${alertInfo.sent} alert${alertInfo.sent > 1 ? 's' : ''} sent (${alertInfo.total_nearby} nearby, ${alertInfo.radius_used}km radius)`, "success");
        } else {
          addToast(`Promoted — no nearby users found for alerts`, "info");
        }
      } else {
        addToast("Report promoted to trusted incidents", "success");
      }
      setReports((prev) => prev.map((r) => r.id === reportId ? { ...r, status: "promoted" } : r));
    } catch (err) {
      addToast("Failed to promote report: " + (err.response?.data?.detail || err.message), "error");
    } finally {
      setReportActionLoading(null);
    }
  };

  const handleKeepRejected = async (reportId) => {
    setReportActionLoading(reportId);
    try {
      await rejectReport(reportId);
      addToast("Report kept as rejected", "info");
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } catch (err) {
      addToast("Failed to reject report: " + (err.response?.data?.detail || err.message), "error");
    } finally {
      setReportActionLoading(null);
    }
  };

  const filtered = filter === "all"
    ? pending
    : pending.filter((u) => u.role === filter);

  // Reports needing admin review: confidence < 90% OR no analysis data
  const lowConfReports = reports.filter((r) => {
    const conf = r.analysis?.confidence;
    return conf == null || conf < 0.9;
  });
  const reportSummary = {
    total: reports.length,
    lowConf: lowConfReports.length,
    highConf: reports.filter((r) => {
      const conf = r.analysis?.confidence;
      return conf != null && conf >= 0.9;
    }).length,
  };

  return (
    <PageShell>
      <div className="v-admin-dashboard">
        <div className="v-admin-header">
          <div>
            <h1>Admin Dashboard</h1>
            <p>Manage account approvals and review rejected citizen reports.</p>
          </div>
          <button
            className="v-trust-ledger-refresh"
            onClick={activeTab === "users" ? load : loadReports}
            disabled={activeTab === "users" ? loading : reportsLoading}
          >
            <RefreshCw size={14} className={(activeTab === "users" ? loading : reportsLoading) ? "v-spin" : ""} />
            Refresh
          </button>
        </div>

        <div className="v-admin-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`v-admin-tab ${activeTab === tab.key ? "active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {React.createElement(tab.icon, { size: 16 })}
              {tab.label}
              {tab.key === "reports" && reports.length > 0 && (
                <span className="v-admin-tab-badge">{reportSummary.lowConf}</span>
              )}
            </button>
          ))}
        </div>

        {activeTab === "users" && (
          <>
            <div className="v-admin-filter-bar">
              <button
                className={`v-admin-filter-btn ${filter === "all" ? "active" : ""}`}
                onClick={() => setFilter("all")}
              >
                <Users size={14} />
                All ({pending.length})
              </button>
              {Object.entries(ROLE_CONFIG).map(([role, cfg]) => {
                const count = pending.filter((u) => u.role === role).length;
                if (count === 0) return null;
                return (
                  <button
                    key={role}
                    className={`v-admin-filter-btn ${filter === role ? "active" : ""}`}
                    onClick={() => setFilter(role)}
                    style={{ "--role-color": cfg.color }}
                  >
                    {React.createElement(cfg.icon, { size: 14 })}
                    {cfg.label} ({count})
                  </button>
                );
              })}
            </div>

            {loading && (
              <div className="v-trust-ledger-state">
                <Loader2 size={24} className="v-spin" />
              </div>
            )}
            {error && <div className="v-trust-ledger-state v-trust-ledger-error">{error}</div>}
            {!loading && !error && filtered.length === 0 && (
              <div className="v-trust-ledger-state">
                <ShieldCheck size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
                <p>{pending.length === 0 ? "No pending approvals. All accounts are approved." : "No matching results."}</p>
              </div>
            )}

            <div className="v-admin-user-list">
              {filtered.map((user) => {
                const RoleIcon = ROLE_CONFIG[user.role]?.icon || User;
                const roleColor = ROLE_CONFIG[user.role]?.color || "var(--color-text-light)";
                const isLoading = actionLoading === user.id;

                return (
                  <div key={user.id} className="v-admin-user-card">
                    <div className="v-admin-user-top">
                      <div className="v-admin-user-role-icon" style={{ color: roleColor }}>
                        <RoleIcon size={20} />
                      </div>
                      <div className="v-admin-user-info">
                        <strong className="v-admin-user-name">{user.username || "No username"}</strong>
                        <span className="v-admin-user-email">{user.email || "No email"}</span>
                        <span className="v-admin-user-meta">
                          <span className="v-admin-role-badge" style={{ borderColor: roleColor, color: roleColor }}>
                            {ROLE_CONFIG[user.role]?.label || user.role}
                          </span>
                          {user.officialId && (
                            <span className="v-admin-official-id" title={user.officialId}>
                              ID: {user.officialId}
                            </span>
                          )}
                          <span className="v-admin-user-date">
                            <Clock size={12} /> {new Date(user.createdAt || user.created_at).toLocaleDateString()}
                          </span>
                        </span>
                      </div>
                    </div>

                    {user.ngoDetails?.organizationName && (
                      <p className="v-admin-user-org">{user.ngoDetails.organizationName}</p>
                    )}

                    <div className="v-admin-user-actions">
                      <button
                        className="v-btn v-review-promote"
                        onClick={() => handleApprove(user.id)}
                        disabled={isLoading}
                      >
                        {isLoading ? <Loader2 size={14} className="v-spin" /> : <CheckCircle size={14} />}
                        Approve
                      </button>
                      <button className="v-btn v-review-reject" disabled={isLoading}>
                        <XCircle size={14} />
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {activeTab === "reports" && (
          <>
            <div className="v-admin-report-summary">
              <div className="v-review-summary-card">
                <Hourglass size={16} />
                <span>Total reports</span>
                <strong>{reportSummary.total}</strong>
              </div>
              <div className="v-review-summary-card priority">
                <Sparkles size={16} />
                <span>Needs review (&lt;90% confidence)</span>
                <strong>{reportSummary.lowConf}</strong>
              </div>
              <div className="v-review-summary-card" style={{ borderColor: "#bbf7d0" }}>
                <CheckCircle size={16} style={{ color: "#15803d" }} />
                <span>High confidence (&ge;90%)</span>
                <strong>{reportSummary.highConf}</strong>
              </div>
            </div>

            {reportsLoading && (
              <div className="v-trust-ledger-state">
                <Loader2 size={24} className="v-spin" />
              </div>
            )}
            {reportsError && <div className="v-trust-ledger-state v-trust-ledger-error">{reportsError}</div>}
            {!reportsLoading && !reportsError && lowConfReports.length === 0 && (
              <div className="v-trust-ledger-state">
                <ShieldCheck size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
                <p>All reports have sufficient confidence. Nothing needs review.</p>
              </div>
            )}

            <div className="v-trust-ledger-list">
              {lowConfReports.map((report) => {
                const analysis = report.analysis || {};
                const verification = analysis.verification || {};
                const confidence = analysis.confidence ?? 0;
                const sourcesChecked = verification.sources_checked || [];
                const webSummary = verification.web_search_summary || "";
                const isLoading = reportActionLoading === report.id;
                const reporterName = report.reporter_username || report.reporter_email || report.reported_by || "anonymous";
                const status = report.status || "unverified";
                const isRejected = status === "rejected";

                return (
                  <div key={report.id} className={`v-trust-ledger-card ${isRejected ? "v-admin-report-card" : "v-admin-report-card v-admin-report-unverified"}`}>
                    <div className="v-trust-ledger-card-top">
                      <div className={`v-verification-badge ${isRejected ? "v-verification-badge--rejected" : ""}`}>
                        {isRejected ? <AlertCircle size={18} /> : <AlertCircle size={18} />}
                        <div>
                          <strong>{isRejected ? "Rejected by AI" : "Unverified"}</strong>
                          <span>Confidence: {(confidence * 100).toFixed(0)}% — flagged for admin review</span>
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

                    {analysis.summary && (
                      <div className="v-admin-analysis-box">
                        <strong>AI Summary:</strong>
                        <p>{analysis.summary}</p>
                      </div>
                    )}

                    <div className="v-trust-ledger-meta">
                      <MapPin size={12} />
                      {report.latitude?.toFixed(4)}, {report.longitude?.toFixed(4)}
                      {report.category ? ` · ${report.category}` : ""}
                    </div>

                    <div className="v-admin-report-extra">
                      <Flag size={12} />
                      <span>Reported by: <strong>{reporterName}</strong></span>
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
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="v-source-item">
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

                    {analysis.recommended_actions?.length > 0 && (
                      <div className="v-sources-section">
                        <div className="v-sources-section-header">
                          <ShieldCheck size={14} />
                          <span>Recommended Actions</span>
                        </div>
                        <ul className="v-admin-actions-list">
                          {analysis.recommended_actions.map((action, i) => (
                            <li key={i}>{action}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="v-review-actions">
                      {report.status === "promoted" ? (
                        <span className="v-review-promoted-badge">
                          <CheckCircle size={14} />
                          Promoted to incidents
                        </span>
                      ) : (
                        <>
                          <button
                            className="v-btn v-review-promote"
                            onClick={() => handlePromoteReport(report.id)}
                            disabled={isLoading}
                          >
                            {isLoading ? <Loader2 size={14} className="v-spin" /> : <CheckCircle size={14} />}
                            Promote to incidents
                          </button>
                          <button
                            className="v-btn v-review-reject"
                            onClick={() => handleKeepRejected(report.id)}
                            disabled={isLoading}
                          >
                            <XCircle size={14} />
                            Keep rejected
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {activeTab === "incidents" && (
          <>
            <div className="v-admin-filter-bar" style={{ flexWrap: "wrap", gap: "1rem" }}>
              <div className="v-incidents-search-box" style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", padding: "6px 12px", borderRadius: 8, border: "1px solid #e2e8f0", flex: "1 1 300px" }}>
                <Search size={14} style={{ color: "#94a3b8" }} />
                <input
                  type="text"
                  placeholder="Search incidents by title, category, source..."
                  value={incidentSearch}
                  onChange={(e) => setIncidentSearch(e.target.value)}
                  style={{ border: "none", outline: "none", background: "transparent", width: "100%", fontSize: "0.875rem" }}
                />
              </div>

              <div style={{ display: "flex", gap: 6 }}>
                {["all", "active", "resolved"].map((st) => (
                  <button
                    key={st}
                    className={`v-admin-filter-btn ${incidentStatusFilter === st ? "active" : ""}`}
                    onClick={() => setIncidentStatusFilter(st)}
                    style={{ textTransform: "capitalize" }}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {incidentsLoading && (
              <div style={{ padding: "2rem 0" }}>
                <RadarPulseLoader label="Loading emergency incident pool..." />
              </div>
            )}

            {incidentsError && <div className="v-trust-ledger-state v-trust-ledger-error">{incidentsError}</div>}

            {!incidentsLoading && !incidentsError && (
              <div className="v-trust-ledger-list">
                {incidentsList
                  .filter((item) => {
                    const status = (item.status || "active").toLowerCase();
                    if (incidentStatusFilter === "active" && status === "resolved") return false;
                    if (incidentStatusFilter === "resolved" && status !== "resolved") return false;
                    if (incidentSearch.trim()) {
                      const q = incidentSearch.toLowerCase();
                      const title = (item.title || "").toLowerCase();
                      const category = (item.category || "").toLowerCase();
                      const source = (item.source || "").toLowerCase();
                      return title.includes(q) || category.includes(q) || source.includes(q);
                    }
                    return true;
                  })
                  .slice(0, 100)
                  .map((incident) => {
                    const id = incident.id || incident.incident_id;
                    const isResolved = (incident.status || "").toLowerCase() === "resolved";
                    const isUpdating = updatingIncidentId === id;

                    return (
                      <div key={id} className={`v-trust-ledger-card ${isResolved ? "resolved-card" : ""}`} style={{ borderLeft: isResolved ? "4px solid #64748b" : "4px solid #2563eb" }}>
                        <div className="v-trust-ledger-card-top">
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <SeverityBadge severity={incident.severity} size="sm" />
                            <span className="v-source-tag">{incident.source || "SYSTEM"}</span>
                            <span className="v-category-tag">{incident.category || "General"}</span>
                          </div>
                          <span className={`v-status-pill ${isResolved ? "resolved" : "active"}`} style={{ padding: "2px 8px", borderRadius: 12, fontSize: "0.75rem", fontWeight: 600, background: isResolved ? "#f1f5f9" : "#dbeafe", color: isResolved ? "#475569" : "#1d4ed8" }}>
                            {isResolved ? "Resolved" : "Active"}
                          </span>
                        </div>

                        <h4 style={{ margin: "0.5rem 0", fontSize: "1rem", color: "#0f172a" }}>
                          {incident.title}
                        </h4>

                        {incident.description && (
                          <p className="v-trust-ledger-description" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {incident.description}
                          </p>
                        )}

                        <div className="v-trust-ledger-meta">
                          <MapPin size={12} />
                          {incident.latitude?.toFixed(4)}, {incident.longitude?.toFixed(4)}
                          {incident.timestamp ? ` · ${new Date(incident.timestamp).toLocaleString()}` : ""}
                        </div>

                        <div className="v-review-actions" style={{ marginTop: "1rem" }}>
                          <button
                            className={`v-btn ${isResolved ? "tertiary" : "v-review-promote"}`}
                            onClick={() => handleStatusToggle(id, incident.status)}
                            disabled={isUpdating}
                            style={{ gap: 6 }}
                          >
                            {isUpdating ? (
                              <ButtonSpinner size={14} />
                            ) : isResolved ? (
                              <>
                                <RotateCcw size={14} /> Reactivate Incident
                              </>
                            ) : (
                              <>
                                <Check size={14} /> Mark as Resolved
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
};

export default AdminDashboard;