// src/models/user.rs
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub username: Option<String>,
    pub email: Option<String>,
    pub password_hash: Option<String>,
    pub google_id: Option<String>,
    pub role: String,
    pub official_id: Option<String>,
    pub location: Option<String>,
    pub phone: Option<String>,
    pub bio: Option<String>,
    pub picture: Option<String>,
    pub is_approved: bool,
    pub ngo_details: Option<Value>,
    pub preferences: Value,
    pub last_login: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Public-facing representation of a user, safe to send to the client
/// (never includes password_hash).
#[derive(Debug, Serialize)]
pub struct PublicUser {
    pub id: Uuid,
    pub username: Option<String>,
    pub email: Option<String>,
    pub role: String,
    #[serde(rename = "officialId")]
    pub official_id: Option<String>,
    pub location: Option<String>,
    pub phone: Option<String>,
    pub bio: Option<String>,
    pub picture: Option<String>,
    #[serde(rename = "isApproved")]
    pub is_approved: bool,
    #[serde(rename = "ngoDetails")]
    pub ngo_details: Option<Value>,
    pub preferences: Value,
    #[serde(rename = "lastLogin")]
    pub last_login: Option<DateTime<Utc>>,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
}

impl From<User> for PublicUser {
    fn from(u: User) -> Self {
        Self {
            id: u.id,
            username: u.username,
            email: u.email,
            role: u.role,
            official_id: u.official_id,
            location: u.location,
            phone: u.phone,
            bio: u.bio,
            picture: u.picture,
            is_approved: u.is_approved,
            ngo_details: u.ngo_details,
            preferences: u.preferences,
            last_login: u.last_login,
            created_at: u.created_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub email: Option<String>,
    pub password: Option<String>,
    #[serde(default = "default_role")]
    pub role: String,
    pub location: Option<String>,
    pub phone: Option<String>,
    #[serde(rename = "officialId")]
    pub official_id: Option<String>,
    #[serde(rename = "ngoDetails")]
    pub ngo_details: Option<Value>,
    /// Captures role-specific id fields the client sends dynamically,
    /// e.g. `adminId`, `ngoId`, `ddmoId` (mirrors the old Node backend's
    /// `req.body[`${role}Id`]` lookup).
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, Value>,
}

impl RegisterRequest {
    /// Resolves the official id the same way the old Node backend did:
    /// `req.body[`${role}Id`] || req.body.officialId`.
    pub fn resolved_official_id(&self) -> Option<String> {
        let role_key = format!("{}Id", self.role);
        self.extra
            .get(&role_key)
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| self.official_id.clone())
    }
}

fn default_role() -> String {
    "user".to_string()
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct GoogleLoginRequest {
    pub token: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: PublicUser,
}

/// JWT claims, mirroring the `{ id, role }` payload the old Node backend used.
#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub id: String,
    pub role: String,
    pub exp: usize,
    pub iat: usize,
}