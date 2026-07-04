// src/services/jwt.rs
use anyhow::{anyhow, Result};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use uuid::Uuid;

use crate::models::user::Claims;

const TOKEN_TTL_DAYS: i64 = 7;

pub fn generate_token(user_id: Uuid, role: &str, secret: &str) -> Result<String> {
    let now = Utc::now();
    let claims = Claims {
        id: user_id.to_string(),
        role: role.to_string(),
        iat: now.timestamp() as usize,
        exp: (now + Duration::days(TOKEN_TTL_DAYS)).timestamp() as usize,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| anyhow!("Failed to sign JWT: {e}"))
}

pub fn verify_token(token: &str, secret: &str) -> Result<Claims> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|e| anyhow!("Invalid or expired token: {e}"))?;

    Ok(data.claims)
}