// src/routes/auth.rs
//
// Migrated from the old Node/Express `server/controllers/authController.js`.
// Handles local (username/password) auth, Google Sign-In, and account status.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, patch, post},
    Json, Router,
};
use serde_json::{json, Value};
use std::sync::Arc;
use uuid::Uuid;

use crate::models::user::{
    AuthResponse, GoogleLoginRequest, LoginRequest, PublicUser, RegisterRequest,
};
use crate::repository::users::UserRepository;
use crate::services::auth_extractor::AuthUser;
use crate::services::{google_auth, jwt};
use crate::state::AppState;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/ping", get(ping))
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/google-login", post(google_login))
        .route("/status", get(status))
        .route("/approve/{id}", patch(approve_user))
        .with_state(state)
}

async fn health() -> Json<Value> {
    Json(json!({
        "status": "healthy",
        "service": "VARUNA Rust Backend",
        "version": "1.0.0"
    }))
}

async fn ping() -> Json<Value> {
    Json(json!({ "message": "Pong" }))
}

fn err(status: StatusCode, message: impl Into<String>) -> (StatusCode, Json<Value>) {
    (status, Json(json!({ "message": message.into() })))
}

// ---------------------------------------------------------------------
// Register (local signup)
// ---------------------------------------------------------------------
async fn register(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let repo = UserRepository::new(state.db.clone());

    if payload.username.trim().is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "Username is required"));
    }

    let official_id = payload.resolved_official_id();

    if payload.role != "user" && official_id.as_deref().unwrap_or("").is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "Official ID is required for this role",
        ));
    }

    if payload.role == "user" && payload.password.as_deref().unwrap_or("").is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "Password is required for regular users",
        ));
    }

    if let Some(email) = payload.email.as_deref() {
        if repo
            .find_by_email(email)
            .await
            .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
            .is_some()
        {
            return Err(err(StatusCode::BAD_REQUEST, "Email already registered"));
        }
    }

    if repo
        .find_by_username(&payload.username)
        .await
        .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
        .is_some()
    {
        return Err(err(StatusCode::BAD_REQUEST, "Username already taken"));
    }

    let password_hash = match payload.password.as_deref() {
        Some(pw) => Some(
            bcrypt::hash(pw, bcrypt::DEFAULT_COST)
                .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to hash password"))?,
        ),
        None => None,
    };

    let is_approved = payload.role == "user";

    let user = repo
        .create_local_user(
            &payload.username,
            payload.email.as_deref(),
            password_hash.as_deref(),
            &payload.role,
            official_id.as_deref(),
            payload.location.as_deref(),
            payload.phone.as_deref(),
            payload.ngo_details.as_ref(),
            is_approved,
        )
        .await
        .map_err(|e| {
            tracing::error!("Register error: {e:?}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        })?;

    if user.role != "user" {
        return Ok((
            StatusCode::CREATED,
            Json(json!({
                "message": "Account created. Awaiting admin approval.",
                "user": PublicUser::from(user)
            })),
        ));
    }

    let token = jwt::generate_token(user.id, &user.role, &state.jwt_secret)
        .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to generate token"))?;

    let response = AuthResponse {
        token,
        user: user.into(),
    };

    Ok((
        StatusCode::CREATED,
        Json(serde_json::to_value(response).unwrap_or_else(|_| json!({}))),
    ))
}

// ---------------------------------------------------------------------
// Local login
// ---------------------------------------------------------------------
async fn login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<Value>)> {
    if payload.username.is_empty() || payload.password.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "Username and password are required",
        ));
    }

    let repo = UserRepository::new(state.db.clone());

    let user = repo
        .find_by_username(&payload.username)
        .await
        .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "User not found"))?;

    if !user.is_approved {
        return Err(err(
            StatusCode::FORBIDDEN,
            "Account pending admin approval",
        ));
    }

    let matches = match user.password_hash.as_deref() {
        Some(hash) => bcrypt::verify(&payload.password, hash).unwrap_or(false),
        None => false,
    };

    if !matches {
        return Err(err(StatusCode::BAD_REQUEST, "Invalid credentials"));
    }

    repo.touch_last_login(user.id).await.ok();

    let token = jwt::generate_token(user.id, &user.role, &state.jwt_secret)
        .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to generate token"))?;

    Ok(Json(AuthResponse {
        token,
        user: user.into(),
    }))
}

// ---------------------------------------------------------------------
// Google login/signup (regular users only, mirrors old behavior)
// ---------------------------------------------------------------------
async fn google_login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<GoogleLoginRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<Value>)> {
    if state.google_client_id.is_empty() {
        return Err(err(
            StatusCode::SERVICE_UNAVAILABLE,
            "Google login is not configured on the server",
        ));
    }

    let claims = google_auth::verify_id_token(&payload.token, &state.google_client_id)
        .await
        .map_err(|e| {
            tracing::warn!("Google token verification failed: {e:?}");
            err(StatusCode::UNAUTHORIZED, "Google authentication failed")
        })?;

    let repo = UserRepository::new(state.db.clone());

    let user = match repo
        .find_by_google_id(&claims.sub)
        .await
        .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
    {
        Some(existing) => existing,
        None => {
            let display_name = claims
                .name
                .clone()
                .unwrap_or_else(|| format!("user_{}", &claims.sub[..8.min(claims.sub.len())]));

            repo.create_google_user(
                &claims.sub,
                claims.email.as_deref(),
                &display_name,
                claims.picture.as_deref(),
            )
            .await
            .map_err(|e| {
                tracing::error!("Failed to create Google user: {e:?}");
                err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create account")
            })?
        }
    };

    repo.touch_last_login(user.id).await.ok();

    let token = jwt::generate_token(user.id, &user.role, &state.jwt_secret)
        .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to generate token"))?;

    Ok(Json(AuthResponse {
        token,
        user: user.into(),
    }))
}

// ---------------------------------------------------------------------
// Current session status (requires Authorization: Bearer <jwt>)
// ---------------------------------------------------------------------
async fn status(AuthUser(user): AuthUser) -> Json<Value> {
    Json(json!({
        "success": true,
        "user": PublicUser::from(user)
    }))
}

// ---------------------------------------------------------------------
// Approve a pending NGO/DDMO/Admin account (admin only)
// ---------------------------------------------------------------------
async fn approve_user(
    State(state): State<Arc<AppState>>,
    AuthUser(current_user): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if current_user.role != "admin" {
        return Err(err(
            StatusCode::FORBIDDEN,
            "Access denied. Required roles: admin",
        ));
    }

    let repo = UserRepository::new(state.db.clone());
    let user = repo
        .set_approved(id, true)
        .await
        .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "User not found"))?;

    Ok(Json(json!({
        "message": "User approved",
        "user": PublicUser::from(user)
    })))
}