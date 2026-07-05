use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, patch, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;
use uuid::Uuid;

use crate::models::user::{
    AuthResponse, GoogleLoginRequest, PublicUser,
};
use crate::repository::users::UserRepository;
use crate::services::auth_extractor::AuthUser;
use crate::services::otp;
use crate::services::{google_auth, jwt};
use crate::state::AppState;

#[derive(Deserialize)]
pub struct SendOtpRequest {
    pub identifier: Option<String>,
    pub email: Option<String>,
    pub name: Option<String>,
    pub purpose: String,
}

#[derive(Deserialize)]
pub struct VerifyOtpRequest {
    pub email: String,
    pub code: String,
    pub purpose: String,
    pub name: Option<String>,
    pub password: Option<String>,
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/ping", get(ping))
        .route("/send-otp", post(send_otp))
        .route("/verify-otp", post(verify_otp))
        .route("/google-login", post(google_login))
        .route("/status", get(status))
        .route("/profile", patch(update_profile))
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

async fn send_otp(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<SendOtpRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let repo = UserRepository::new(state.db.clone());

    let email = if payload.purpose == "signup" {
        let email = payload.email.as_deref().map(|e| e.trim().to_lowercase())
            .ok_or_else(|| err(StatusCode::BAD_REQUEST, "Email is required"))?;
        if !email.contains('@') || !email.contains('.') {
            return Err(err(StatusCode::BAD_REQUEST, "Invalid email address"));
        }

        let name = payload.name.as_deref().map(|n| n.trim()).unwrap_or("");
        if name.is_empty() {
            return Err(err(StatusCode::BAD_REQUEST, "Name is required"));
        }

        if repo.find_by_email(&email).await.map_err(|e| {
            tracing::error!("send_otp: find_by_email failed: {e:?}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        })?.is_some() {
            return Err(err(StatusCode::BAD_REQUEST, "Email already registered"));
        }
        if repo.find_by_username(name).await.map_err(|e| {
            tracing::error!("send_otp: find_by_username failed: {e:?}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        })?.is_some() {
            return Err(err(StatusCode::BAD_REQUEST, "Username already taken"));
        }

        email
    } else if payload.purpose == "signin" {
        let identifier = payload.identifier.as_deref().map(|i| i.trim().to_lowercase())
            .ok_or_else(|| err(StatusCode::BAD_REQUEST, "Email or username is required"))?;

        let user = repo.find_by_email_or_username(&identifier).await.map_err(|e| {
            tracing::error!("send_otp: find_by_email_or_username failed: {e:?}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        })?.ok_or_else(|| {
            err(StatusCode::NOT_FOUND, "No account found with this email or username")
        })?;

        user.email.ok_or_else(|| {
            err(StatusCode::BAD_REQUEST, "No email associated with this account")
        })?
    } else if payload.purpose == "reset-password" {
        let email = payload.email.as_deref().map(|e| e.trim().to_lowercase())
            .ok_or_else(|| err(StatusCode::BAD_REQUEST, "Email is required"))?;
        if !email.contains('@') || !email.contains('.') {
            return Err(err(StatusCode::BAD_REQUEST, "Invalid email address"));
        }

        let user = repo.find_by_email(&email).await.map_err(|e| {
            tracing::error!("send_otp: find_by_email failed: {e:?}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        })?;

        match user {
            Some(u) if u.password_hash.is_some() => {}
            Some(_) => {
                return Err(err(StatusCode::BAD_REQUEST, "This account uses Google Sign-In. Please sign in with Google."));
            }
            None => {
                return Ok(Json(json!({ "success": true, "email": email, "message": "If an account exists with this email, a reset code has been sent." })));
            }
        }

        email
    } else {
        return Err(err(StatusCode::BAD_REQUEST, "Purpose must be 'signup', 'signin', or 'reset-password'"));
    };

    let can_resend = otp::can_resend(&state.db, &email, &payload.purpose)
        .await
        .map_err(|e| {
            tracing::error!("send_otp: rate check failed: {e:?}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        })?;

    if !can_resend {
        return Err(err(StatusCode::TOO_MANY_REQUESTS, "Please wait before requesting a new code"));
    }

    let code = otp::generate_otp();

    otp::store_otp(&state.db, &email, &code, &payload.purpose)
        .await
        .map_err(|e| {
            tracing::error!("send_otp: store failed: {e:?}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to store OTP")
        })?;

    let otp_url = format!("{}/otp", state.mail_service_url);
    match state.http_client
        .post(&otp_url)
        .json(&serde_json::json!({ "email": email, "otp": code }))
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
    {
        Ok(resp) => {
            let status = resp.status();
            if !status.is_success() {
                let body = resp.text().await.unwrap_or_default();
                tracing::warn!("send_otp: mail service returned {}: {}", status, body);
            }
        }
        Err(e) => {
            tracing::warn!("send_otp: mail service call failed: {e:?}");
        }
    }

    Ok(Json(json!({ "success": true, "email": email, "message": "OTP sent to email" })))
}

async fn verify_otp(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<VerifyOtpRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let email = payload.email.trim().to_lowercase();

    let valid = otp::verify_otp(&state.db, &email, &payload.code, &payload.purpose)
        .await
        .map_err(|e| {
            tracing::error!("verify_otp: verification failed: {e:?}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        })?;

    if !valid {
        return Err(err(StatusCode::BAD_REQUEST, "Invalid or expired OTP"));
    }

    let repo = UserRepository::new(state.db.clone());

    if payload.purpose == "signup" {
        let username = payload.name.as_deref().unwrap_or("User");
        let password = payload.password.as_deref().unwrap_or("");

        if password.len() < 6 {
            return Err(err(StatusCode::BAD_REQUEST, "Password must be at least 6 characters"));
        }

        if repo.find_by_email(&email).await.map_err(|e| {
            tracing::error!("verify_otp: find_by_email failed: {e:?}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        })?.is_some() {
            return Err(err(StatusCode::BAD_REQUEST, "Email already registered"));
        }

        let password_hash = bcrypt::hash(password, bcrypt::DEFAULT_COST)
            .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to hash password"))?;

        let user = repo
            .create_local_user(
                username,
                Some(&email),
                Some(&password_hash),
                "user",
                None,
                None,
                None,
                None,
                None,
                None,
                true,
            )
            .await
            .map_err(|e| {
                tracing::error!("verify_otp: create user failed: {e:?}");
                err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create account")
            })?;

        let token = jwt::generate_token(user.id, &user.role, &state.jwt_secret)
            .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to generate token"))?;

        return Ok(Json(serde_json::to_value(AuthResponse {
            token,
            user: user.into(),
        }).unwrap_or_else(|_| json!({}))));
    }

    if payload.purpose == "signin" {
        let user = repo.find_by_email(&email).await.map_err(|e| {
            tracing::error!("verify_otp: find_by_email failed: {e:?}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        })?.ok_or_else(|| {
            err(StatusCode::NOT_FOUND, "No account found with this email")
        })?;

        repo.touch_last_login(user.id).await.ok();

        let token = jwt::generate_token(user.id, &user.role, &state.jwt_secret)
            .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to generate token"))?;

        return Ok(Json(serde_json::to_value(AuthResponse {
            token,
            user: user.into(),
        }).unwrap_or_else(|_| json!({}))));
    }

    if payload.purpose == "reset-password" {
        let password = payload.password.as_deref().unwrap_or("");

        if password.len() < 6 {
            return Err(err(StatusCode::BAD_REQUEST, "Password must be at least 6 characters"));
        }

        let user = repo.find_by_email(&email).await.map_err(|e| {
            tracing::error!("verify_otp: find_by_email failed: {e:?}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        })?.ok_or_else(|| {
            err(StatusCode::NOT_FOUND, "No account found with this email")
        })?;

        if user.password_hash.is_none() {
            return Err(err(StatusCode::BAD_REQUEST, "This account uses Google Sign-In. Please sign in with Google."));
        }

        let password_hash = bcrypt::hash(password, bcrypt::DEFAULT_COST)
            .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to hash password"))?;

        repo.update_password(&email, &password_hash).await.map_err(|e| {
            tracing::error!("verify_otp: update_password failed: {e:?}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to update password")
        })?;

        return Ok(Json(json!({ "success": true, "message": "Password reset successful. Please sign in with your new password." })));
    }

    Err(err(StatusCode::BAD_REQUEST, "Invalid purpose"))
}

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
        .map_err(|e| {
            tracing::error!("google_login: find_by_google_id failed: {e:?}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        })?
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
                tracing::error!("google_login: create_google_user failed: {e:?}");
                err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create account")
            })?
        }
    };

    repo.touch_last_login(user.id).await.ok();

    let token = jwt::generate_token(user.id, &user.role, &state.jwt_secret)
        .map_err(|e| {
            tracing::error!("google_login: token generation failed: {e:?}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to generate token")
        })?;

    Ok(Json(AuthResponse {
        token,
        user: user.into(),
    }))
}

async fn status(AuthUser(user): AuthUser) -> Json<Value> {
    Json(json!({
        "success": true,
        "user": PublicUser::from(user)
    }))
}

async fn update_profile(
    State(state): State<Arc<AppState>>,
    AuthUser(current_user): AuthUser,
    Json(payload): Json<crate::models::user::ProfileUpdate>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let repo = UserRepository::new(state.db.clone());

    let user = repo
        .update_profile(
            current_user.id,
            payload.latitude,
            payload.longitude,
            payload.preferences,
        )
        .await
        .map_err(|e| {
            tracing::error!("update_profile failed: {e:?}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        })?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "User not found"))?;

    Ok(Json(json!({
        "success": true,
        "user": PublicUser::from(user)
    })))
}

async fn approve_user(
    State(state): State<Arc<AppState>>,
    AuthUser(current_user): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if current_user.role != "admin" {
        return Err(err(StatusCode::FORBIDDEN, "Access denied. Required roles: admin"));
    }

    let repo = UserRepository::new(state.db.clone());
    let user = repo
        .set_approved(id, true)
        .await
        .map_err(|e| {
            tracing::error!("approve_user: set_approved failed: {e:?}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        })?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "User not found"))?;

    Ok(Json(json!({
        "message": "User approved",
        "user": PublicUser::from(user)
    })))
}
