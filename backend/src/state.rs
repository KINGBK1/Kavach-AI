// src/state.rs
use sqlx::PgPool;
use std::sync::Arc;

pub struct AppState {
    pub db: PgPool,
    pub ai_service_url: String,
}

impl AppState {
    pub fn new(db: PgPool, ai_service_url: String) -> Self {
        Self { db, ai_service_url }
    }
}

pub type SharedState = Arc<AppState>;