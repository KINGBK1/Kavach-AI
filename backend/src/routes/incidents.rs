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

async fn submit_report(
    State(state): State<Arc<AppState>>,
    Json(report): Json<CitizenReport>,
) -> Result<Json<Value>, StatusCode> {
    let client = AiClient::new(state.ai_service_url.clone());

    let result = client
        .analyze_single(
            &report.description,
            report.latitude,
            report.longitude,
        )
        .await
        .map_err(|e| {
            tracing::error!("Failed to analyze citizen report: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let analysis = result.get("analysis").and_then(|a| a.as_object());
    let severity = analysis.and_then(|a| a.get("severity").and_then(|s| s.as_str())).unwrap_or("");
    let incident_type = analysis.and_then(|a| a.get("incident_type").and_then(|t| t.as_str())).unwrap_or("");
    let summary = analysis.and_then(|a| a.get("summary").and_then(|s| s.as_str())).unwrap_or("");
    let recommended_actions: Vec<String> = analysis
        .and_then(|a| a.get("recommended_actions"))
        .and_then(|ra| ra.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let incident_id = uuid::Uuid::new_v4().to_string();
    let title = if !incident_type.is_empty() {
        format!("Citizen Report: {}", incident_type)
    } else {
        report.description.chars().take(80).collect()
    };

    let alert_payload = serde_json::json!({
        "incident_id": incident_id,
        "title": title,
        "description": report.description,
        "summary": summary,
        "recommended_actions": recommended_actions,
        "latitude": report.latitude,
        "longitude": report.longitude,
        "category": report.category.unwrap_or_else(|| "citizen-report".to_string()),
        "incident_type": incident_type,
        "severity": severity,
        "source": "citizen-report",
    });

    let mail_url = format!("{}/alerts", state.mail_service_url);
    let http_client = state.http_client.clone();
    tokio::spawn(async move {
        match http_client
            .post(&mail_url)
            .json(&alert_payload)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
        {
            Ok(resp) => {
                if resp.status().is_success() {
                    tracing::info!("Alert email triggered for citizen report {}", incident_id);
                } else {
                    tracing::warn!(
                        "Mail service returned {} for citizen report {}: {}",
                        resp.status(),
                        incident_id,
                        resp.text().await.unwrap_or_default()
                    );
                }
            }
            Err(e) => {
                tracing::warn!("Failed to send alert for citizen report {}: {:?}", incident_id, e);
            }
        }
    });

    Ok(Json(result))
}