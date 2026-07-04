// src/services/auth_extractor.rs
//
// Axum extractor that validates the `Authorization: Bearer <jwt>` header,
// loads the corresponding user from Postgres, and rejects the request with
// 401/403/404 as appropriate — mirroring the old Node `authMiddleware`.

use axum::{
    extract::{FromRef, FromRequestParts},
    http::{request::Parts, StatusCode},
    Json,
};
use serde_json::{json, Value};
use std::sync::Arc;
use uuid::Uuid;

use crate::models::user::User;
use crate::repository::users::UserRepository;
use crate::services::jwt::verify_token;
use crate::state::AppState;

pub struct AuthUser(pub User);

fn err(status: StatusCode, message: &str) -> (StatusCode, Json<Value>) {
    (status, Json(json!({ "message": message })))
}

impl<S> FromRequestParts<S> for AuthUser
where
    Arc<AppState>: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = (StatusCode, Json<Value>);

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let state = Arc::<AppState>::from_ref(state);

        let auth_header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok());

        let token = auth_header
            .and_then(|h| h.strip_prefix("Bearer "))
            .ok_or_else(|| err(StatusCode::UNAUTHORIZED, "No token provided"))?;

        let claims = verify_token(token, &state.jwt_secret)
            .map_err(|_| err(StatusCode::UNAUTHORIZED, "Invalid or expired token"))?;

        let user_id = Uuid::parse_str(&claims.id)
            .map_err(|_| err(StatusCode::UNAUTHORIZED, "Invalid or expired token"))?;

        let repo = UserRepository::new(state.db.clone());
        let user = repo
            .find_by_id(user_id)
            .await
            .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
            .ok_or_else(|| err(StatusCode::NOT_FOUND, "User not found"))?;

        if !user.is_approved {
            return Err(err(StatusCode::FORBIDDEN, "Account pending approval"));
        }

        Ok(AuthUser(user))
    }
}