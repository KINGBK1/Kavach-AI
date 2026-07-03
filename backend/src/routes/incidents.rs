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

    Ok(Json(result))
}