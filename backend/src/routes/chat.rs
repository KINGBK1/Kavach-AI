// src/routes/chat.rs

use axum::{
    extract::State,
    http::StatusCode,
    routing::post,
    Json, Router,
};
use std::sync::Arc;

use crate::models::analysis::{ChatRequest, ChatResponse};
use crate::services::ai_client::AiClient;
use crate::state::AppState;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", post(chat))
        .with_state(state)
}

async fn chat(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ChatRequest>,
) -> Result<Json<ChatResponse>, StatusCode> {
    let client = AiClient::new(state.ai_service_url.clone());

    let response = client
        .chat(&payload.question)
        .await
        .map_err(|e| {
            tracing::error!("AI chat failed: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(response))
}