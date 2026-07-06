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
        .with_state(state)
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

    let analysis = result.get("analysis").and_then(|a| a.as_object());
    let severity = analysis.and_then(|a| a.get("severity").and_then(|s| s.as_str())).unwrap_or("UNKNOWN");
    let incident_type = analysis.and_then(|a| a.get("incident_type").and_then(|t| t.as_str())).unwrap_or("UNKNOWN");
    let summary = analysis.and_then(|a| a.get("summary").and_then(|s| s.as_str())).unwrap_or("");
    let recommended_actions: Vec<String> = analysis
        .and_then(|a| a.get("recommended_actions"))
        .and_then(|ra| ra.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    println!("[REPORT] Extracted: report_id={}, status={}, severity={}, incident_type={}",
        report_id, status, severity, incident_type);

    // Only fire an alert email if this report was corroborated against the
    // trusted incidents table. An uncorroborated report is still saved and
    // shown to the submitter for triage, but it does NOT go out as an
    // email alert — we have no way to know it's real, and a false alarm
    // is worse than a delayed one.
    if status == "corroborated" {
        let title = if !incident_type.is_empty() && incident_type != "UNKNOWN" {
            format!("Citizen Report: {}", incident_type)
        } else {
            report.description.chars().take(80).collect()
        };

        let alert_payload = serde_json::json!({
            "report_id": report_id,
            "title": title,
            "description": report.description,
            "summary": summary,
            "recommended_actions": recommended_actions,
            "latitude": report.latitude,
            "longitude": report.longitude,
            "category": category,
            "incident_type": incident_type,
            "severity": severity,
            "source": "citizen-report",
            "corroborated": true,
        });

        let mail_url = format!("{}/alerts", state.mail_service_url);
        println!("[REPORT] Corroborated — triggering mail: POST {} report_id={}", mail_url, report_id);

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
    } else {
        println!("[REPORT] Status={} — not corroborated, no alert sent. Report saved for review.", status);
    }

    println!("[REPORT] Returning analysis result to frontend");
    Ok(Json(result))
}