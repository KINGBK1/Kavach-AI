// src/routes/incidents.rs

use axum::{
    extract::{Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

use crate::models::incident::CitizenReport;
use crate::services::ai_client::AiClient;
use crate::services::auth_extractor::AuthUser;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct LimitQuery {
    pub limit: Option<u32>,
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(get_incidents))
        .route("/analyze", get(analyze_incidents))
        .route("/report", post(submit_report))
        .route("/citizen-reports", get(list_citizen_reports))
        .route("/citizen-reports/promote", post(promote_report))
        .route("/citizen-reports/reject", post(reject_report))
        .with_state(state)
}

#[derive(Deserialize)]
pub struct CitizenReportsQuery {
    pub status: Option<String>,
    pub limit: Option<u32>,
}

/// Public, unauthenticated — this is the trust ledger: anyone can see what
/// the verification agent decided on a citizen report and why. Read-only,
/// no per-user data exposed beyond what's already public on submission.
async fn list_citizen_reports(
    State(state): State<Arc<AppState>>,
    Query(params): Query<CitizenReportsQuery>,
) -> Result<Json<Value>, StatusCode> {
    let limit = params.limit.unwrap_or(100);

    let client = AiClient::new(state.ai_service_url.clone());

    let reports = client
        .list_citizen_reports(params.status.as_deref(), limit)
        .await
        .map_err(|e| {
            tracing::error!("Failed to list citizen reports: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(reports))
}

async fn get_incidents(
    State(state): State<Arc<AppState>>,
    Query(params): Query<LimitQuery>,
) -> Result<Json<Vec<Value>>, StatusCode> {
    let limit = params.limit.unwrap_or(50);

    let client = AiClient::new(state.ai_service_url.clone());

    let incidents = client
        .get_all_incidents(limit)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch incidents: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(incidents))
}

async fn analyze_incidents(
    State(state): State<Arc<AppState>>,
    Query(params): Query<LimitQuery>,
) -> Result<Json<Vec<Value>>, StatusCode> {
    let limit = params.limit.unwrap_or(10);

    let client = AiClient::new(state.ai_service_url.clone());

    let results = client
        .analyze_incidents(limit)
        .await
        .map_err(|e| {
            tracing::error!("Failed to analyze incidents: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let json_results = results
        .into_iter()
        .map(|r| serde_json::to_value(r).unwrap())
        .collect();

    Ok(Json(json_results))
}

// Citizen reports now require auth: the reported_by id is what makes
// per-user rate limiting on the AI service meaningful, and ties each
// report to an accountable account instead of an anonymous submission.
async fn submit_report(
    State(state): State<Arc<AppState>>,
    AuthUser(current_user): AuthUser,
    Json(report): Json<CitizenReport>,
) -> Result<Json<Value>, StatusCode> {
    println!("[REPORT] Received citizen report from user={}: lat={}, lng={}, category={:?}, desc={}",
        current_user.id, report.latitude, report.longitude, report.category,
        &report.description.chars().take(60).collect::<String>());

    let client = AiClient::new(state.ai_service_url.clone());

    let category = report.category.clone().unwrap_or_else(|| "Other".to_string());

    let result = client
        .analyze_citizen_report(
            &report.description,
            report.latitude,
            report.longitude,
            &category,
            &current_user.id.to_string(),
        )
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if msg.starts_with("RATE_LIMITED") {
                tracing::warn!("Citizen report rate limited for user {}: {}", current_user.id, msg);
                return StatusCode::TOO_MANY_REQUESTS;
            }
            tracing::error!("Failed to analyze citizen report: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    println!("[REPORT] AI analysis succeeded, extracting fields...");

    let report_id = result
        .get("report_id")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    let status = result
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("unverified")
        .to_string();

    // Old endpoint returned "corroborated", the ADK agent returns "verified".
    // Both mean the same thing: this report has been cross-checked and confirmed.
    let corroborated = status == "corroborated" || status == "verified";

    let analysis = result.get("analysis").and_then(|a| a.as_object());
    let severity = analysis.and_then(|a| a.get("severity").and_then(|s| s.as_str())).unwrap_or("UNKNOWN");
    let incident_type = analysis.and_then(|a| a.get("incident_type").and_then(|t| t.as_str())).unwrap_or("UNKNOWN");
    let summary = analysis.and_then(|a| a.get("summary").and_then(|s| s.as_str())).unwrap_or("");
    let confidence = analysis.and_then(|a| a.get("confidence").and_then(|c| c.as_f64())).unwrap_or(0.0);
    let recommended_actions: Vec<String> = analysis
        .and_then(|a| a.get("recommended_actions"))
        .and_then(|ra| ra.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    println!("[REPORT] Extracted: report_id={}, status={}, severity={}, incident_type={}, confidence={}",
        report_id, status, severity, incident_type, confidence);

    // Confidence-weighted alert routing instead of a binary verified/rejected gate.
    // High confidence + High/Critical severity → immediate push alert (email).
    // Medium confidence → route to review queue with "likely real" flag.
    // Low confidence → saved silently, no alert.
    let alert_urgency = if corroborated && confidence >= 0.7 {
        "immediate"
    } else if corroborated && confidence >= 0.4 {
        "review_queue_priority"
    } else {
        "none"
    };

    if alert_urgency == "immediate" {
        let title = if !incident_type.is_empty() && incident_type != "UNKNOWN" {
            format!("Citizen Report: {}", incident_type)
        } else {
            report.description.chars().take(80).collect()
        };

        let alert_payload = serde_json::json!({
            "incident_id": report_id,
            "title": title,
            "description": report.description,
            "summary": summary,
            "recommended_actions": recommended_actions,
            "latitude": report.latitude,
            "longitude": report.longitude,
            "category": category,
            "incident_type": incident_type,
            "severity": severity,
            "confidence": confidence,
            "source": "citizen-report",
            "corroborated": true,
            "alert_urgency": "immediate",
        });

        let mail_url = format!("{}/alerts", state.mail_service_url);
        println!("[REPORT] High confidence ({}) — immediate alert: POST {} report_id={}", confidence, mail_url, report_id);

        let http_client = state.http_client.clone();
        let report_id_for_log = report_id.clone();
        tokio::spawn(async move {
            match http_client
                .post(&mail_url)
                .json(&alert_payload)
                .timeout(std::time::Duration::from_secs(10))
                .send()
                .await
            {
                Ok(resp) => {
                    let status_code = resp.status();
                    let body = resp.text().await.unwrap_or_default();
                    println!("[REPORT] Mail service responded: status={}, body={}", status_code, body);
                }
                Err(e) => {
                    println!("[REPORT] Mail service REQUEST FAILED: {:?}", e);
                    tracing::warn!("Failed to send alert for citizen report {}: {:?}", report_id_for_log, e);
                }
            }
        });
    } else if alert_urgency == "review_queue_priority" {
        println!("[REPORT] Medium confidence ({}) — routed to review queue as 'likely real'. No email.", confidence);
    } else {
        println!("[REPORT] Status={}, confidence={} — no alert sent. Report saved for review.", status, confidence);
    }

    println!("[REPORT] Returning analysis result to frontend");
    Ok(Json(result))
}

#[derive(Deserialize)]
pub struct ReviewAction {
    pub report_id: String,
    pub reviewed_by: String,
}

/// Promote a citizen report to the trusted incidents table.
async fn promote_report(
    State(state): State<Arc<AppState>>,
    AuthUser(current_user): AuthUser,
    Json(action): Json<ReviewAction>,
) -> Result<Json<Value>, StatusCode> {
    let client = AiClient::new(state.ai_service_url.clone());
    let payload = serde_json::json!({
        "report_id": action.report_id,
        "reviewed_by": current_user.id.to_string(),
    });
    let result = client
        .post_json("/analyze/citizen-reports/promote", payload)
        .await
        .map_err(|e| {
            tracing::error!("Failed to promote report: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    Ok(Json(result))
}

/// Reject a citizen report during human review.
async fn reject_report(
    State(state): State<Arc<AppState>>,
    AuthUser(current_user): AuthUser,
    Json(action): Json<ReviewAction>,
) -> Result<Json<Value>, StatusCode> {
    let client = AiClient::new(state.ai_service_url.clone());
    let payload = serde_json::json!({
        "report_id": action.report_id,
        "reviewed_by": current_user.id.to_string(),
    });
    let result = client
        .post_json("/analyze/citizen-reports/reject", payload)
        .await
        .map_err(|e| {
            tracing::error!("Failed to reject report: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    Ok(Json(result))
}