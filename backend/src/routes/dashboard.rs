// src/routes/dashboard.rs
use axum::{
    Router, routing::get, extract::{State, Query}, Json,
};
use serde::Deserialize;
use std::sync::Arc;
use serde_json::Value;
use crate::state::AppState;
use crate::services::ai_client::AiClient;

#[derive(Deserialize)]
pub struct RiskZonesQuery {
    pub grid_size: Option<f64>,
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(get_dashboard))
        .route("/risk-zones", get(get_risk_zones))
        .with_state(state)
}

async fn get_dashboard(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, String> {
    let client = AiClient::new(state.ai_service_url.clone());
    client.get_dashboard()
        .await
        .map(Json)
        .map_err(|e| e.to_string())
}

async fn get_risk_zones(
    State(state): State<Arc<AppState>>,
    Query(params): Query<RiskZonesQuery>,
) -> Result<Json<Value>, String> {
    let client = AiClient::new(state.ai_service_url.clone());
    let grid_size = params.grid_size.unwrap_or(2.0);
    client.get_risk_zones(grid_size)
        .await
        .map(Json)
        .map_err(|e| e.to_string())
}