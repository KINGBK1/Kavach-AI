use axum::{
    http::{header, Method}, // Added header import here
    Router,
};
use tower_http::{
    cors::CorsLayer,
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use dotenvy::dotenv;
use std::{env, sync::Arc};

mod models;
mod repository;
mod routes;
mod services;
mod state;

use state::AppState;

#[tokio::main]
async fn main() {
    dotenv().ok();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::new(
                env::var("RUST_LOG")
                    .unwrap_or_else(|_| "backend=info,tower_http=info".to_string()),
            ),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting VARUNA Backend...");

    let database_url =
        env::var("DATABASE_URL").expect("DATABASE_URL environment variable missing");

    let ai_service_url =
        env::var("AI_SERVICE_URL").unwrap_or_else(|_| "http://localhost:8000".into());

    let jwt_secret = env::var("JWT_SECRET").expect("JWT_SECRET environment variable missing");

    let google_client_id = env::var("GOOGLE_CLIENT_ID").unwrap_or_default();
    if google_client_id.is_empty() {
        tracing::warn!("GOOGLE_CLIENT_ID not set - Google sign-in will be disabled");
    }

    tracing::info!("Connecting to PostgreSQL...");

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("Failed to connect to PostgreSQL");

    tracing::info!("Running migrations...");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    tracing::info!("Database ready.");

    let state = Arc::new(AppState::new(
        pool,
        ai_service_url,
        jwt_secret,
        google_client_id,
    ));

    // Strict CORS configuration matching exact credentials requirements
    let cors = CorsLayer::new()
        .allow_origin("http://localhost:5173".parse::<axum::http::HeaderValue>().unwrap())
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE])
        .allow_credentials(true);

    let app = Router::new()
        .nest("/api", routes::create_router(state))
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    // Cloud Run provides PORT automatically
    let port = env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse::<u16>()
        .expect("Invalid PORT");

    let addr = format!("0.0.0.0:{port}");

    tracing::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Failed to bind");

    axum::serve(listener, app)
        .await
        .expect("Server failed");
}