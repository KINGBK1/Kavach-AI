// src/routes/auth.rs
use axum::{Router, routing::get, Json};
use serde_json::{json, Value};
use std::sync::Arc;
use crate::state::AppState;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .with_state(state)
}

async fn health() -> Json<Value> {
    Json(json!({
        "status": "healthy",
        "service": "VARUNA Rust Backend",
        "version": "1.0.0"
    }))
}