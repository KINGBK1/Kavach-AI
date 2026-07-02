// src/routes/chat.rs
use axum::{Router, routing::post, extract::State, Json};
use std::sync::Arc;
use crate::state::AppState;
use crate::services::ai_client::AiClient;
use crate::models::analysis::{ChatRequest, ChatResponse};

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", post(chat))
        .with_state(state)
}

async fn chat(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ChatRequest>,
) -> Result<Json<ChatResponse>, String> {
    let client = AiClient::new(state.ai_service_url.clone());
    client.chat(&payload.question)
        .await
        .map(Json)
        .map_err(|e| e.to_string())
}