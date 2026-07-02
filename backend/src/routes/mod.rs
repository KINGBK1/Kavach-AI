// src/routes/mod.rs
use axum::Router;
use std::sync::Arc;
use crate::state::AppState;

pub mod auth;
pub mod incidents;
pub mod chat;
pub mod dashboard;
pub mod websocket;

pub fn create_router(state: Arc<AppState>) -> Router {
    Router::new()
        .nest("/auth", auth::router(state.clone()))
        .nest("/incidents", incidents::router(state.clone()))
        .nest("/chat", chat::router(state.clone()))
        .nest("/dashboard", dashboard::router(state.clone()))
        .nest("/ws", websocket::router(state.clone()))
}