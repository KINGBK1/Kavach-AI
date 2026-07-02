use axum::{
    Router,
    http::{HeaderValue, Method},
};
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use std::sync::Arc;
use dotenvy::dotenv;
use std::env;

mod routes;
mod services;
mod models;
mod repository;
mod state;

use state::AppState;

#[tokio::main]
async fn main() {
    dotenv().ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "backend=debug,tower_http=debug".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let database_url = env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");

    let ai_service_url = env::var("AI_SERVICE_URL")
        .unwrap_or_else(|_| "http://localhost:8000".to_string());

    let pool = sqlx::PgPool::connect(&database_url)
        .await
        .expect("Failed to connect to PostgreSQL");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    let state = Arc::new(AppState::new(pool, ai_service_url));

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers(Any);

    let app = Router::new()
        .nest("/api", routes::create_router(state.clone()))
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    let addr = "0.0.0.0:3206";
    tracing::info!("VARUNA Backend running on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}