// src/state.rs
use sqlx::PgPool;
use std::sync::Arc;

use crate::repository::users::UserRepository;

pub struct AppState {
    pub db: PgPool,
    pub ai_service_url: String,
    pub mail_service_url: String,
    pub users: UserRepository,
    pub jwt_secret: String,
    pub google_client_id: String,
    pub http_client: reqwest::Client,
}

impl AppState {
    pub fn new(
        db: PgPool,
        ai_service_url: String,
        mail_service_url: String,
        jwt_secret: String,
        google_client_id: String,
    ) -> Self {
        let users = UserRepository::new(db.clone());
        Self {
            db,
            ai_service_url,
            mail_service_url,
            users,
            jwt_secret,
            google_client_id,
            http_client: reqwest::Client::new(),
        }
    }
}

pub type SharedState = Arc<AppState>;