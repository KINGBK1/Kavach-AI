// src/routes/incidents.rs
use axum::{
    Router,
    routing::{get, post},
    extract::{State, Query},
    Json,
};
use std::sync::Arc;
use serde::Deserialize;
use serde_json::Value;
use crate::state::AppState;
use crate::services::ai_client::AiClient;
use crate::models::incident::CitizenReport;

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
) -> Result<Json<Vec<Value>>, String> {
    let limit = params.limit.unwrap_or(50);
    let client = AiClient::new(state.ai_service_url.clone());
    client.get_all_incidents(limit)
        .await
        .map(Json)
        .map_err(|e| e.to_string())
}

async fn analyze_incidents(
    State(state): State<Arc<AppState>>,
    Query(params): Query<LimitQuery>,
) -> Result<Json<Vec<Value>>, String> {
    let limit = params.limit.unwrap_or(10);
    let client = AiClient::new(state.ai_service_url.clone());
    client.analyze_incidents(limit)
        .await
        .map(|results| Json(results.into_iter().map(|r| serde_json::to_value(r).unwrap()).collect()))
        .map_err(|e| e.to_string())
}

async fn submit_report(
    State(state): State<Arc<AppState>>,
    Json(report): Json<CitizenReport>,
) -> Result<Json<Value>, String> {
    let client = AiClient::new(state.ai_service_url.clone());
    client.analyze_single(
        &report.description,
        report.latitude,
        report.longitude,
    )
    .await
    .map(Json)
    .map_err(|e| e.to_string())
}