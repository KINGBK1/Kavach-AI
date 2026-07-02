// src/routes/dashboard.rs
use axum::{Router, routing::get, extract::State, Json};
use std::sync::Arc;
use serde_json::Value;
use crate::state::AppState;
use crate::services::ai_client::AiClient;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(get_dashboard))
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