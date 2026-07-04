// src/repository/users.rs
use anyhow::Result;
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::user::User;

pub struct UserRepository {
    pool: PgPool,
}

impl UserRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

// Replace the select blocks in src/repository/users.rs with these explicit columns:

    pub async fn find_by_id(&self, id: Uuid) -> Result<Option<User>> {
        let user = sqlx::query_as::<_, User>(
            "SELECT id, username, email, password_hash, google_id, role, official_id, location, phone, bio, picture, is_approved, ngo_details, last_login, created_at, updated_at FROM users WHERE id = $1"
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(user)
    }

    pub async fn find_by_username(&self, username: &str) -> Result<Option<User>> {
        let user = sqlx::query_as::<_, User>(
            "SELECT id, username, email, password_hash, google_id, role, official_id, location, phone, bio, picture, is_approved, ngo_details, last_login, created_at, updated_at FROM users WHERE username = $1"
        )
        .bind(username)
        .fetch_optional(&self.pool)
        .await?;
        Ok(user)
    }

    pub async fn find_by_email(&self, email: &str) -> Result<Option<User>> {
        let user = sqlx::query_as::<_, User>(
            "SELECT id, username, email, password_hash, google_id, role, official_id, location, phone, bio, picture, is_approved, ngo_details, last_login, created_at, updated_at FROM users WHERE email = $1"
        )
        .bind(email)
        .fetch_optional(&self.pool)
        .await?;
        Ok(user)
    }

    pub async fn find_by_google_id(&self, google_id: &str) -> Result<Option<User>> {
        let user = sqlx::query_as::<_, User>(
            "SELECT id, username, email, password_hash, google_id, role, official_id, location, phone, bio, picture, is_approved, ngo_details, last_login, created_at, updated_at FROM users WHERE google_id = $1"
        )
        .bind(google_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(user)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create_local_user(
        &self,
        username: &str,
        email: Option<&str>,
        password_hash: Option<&str>,
        role: &str,
        official_id: Option<&str>,
        location: Option<&str>,
        phone: Option<&str>,
        ngo_details: Option<&Value>,
        is_approved: bool,
    ) -> Result<User> {
        let user = sqlx::query_as::<_, User>(
            r#"
            INSERT INTO users
                (username, email, password_hash, role, official_id, location, phone, ngo_details, is_approved)
            VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
            "#,
        )
        .bind(username)
        .bind(email)
        .bind(password_hash)
        .bind(role)
        .bind(official_id)
        .bind(location)
        .bind(phone)
        .bind(ngo_details)
        .bind(is_approved)
        .fetch_one(&self.pool)
        .await?;
        Ok(user)
    }

    /// Creates a brand-new user from a verified Google identity.
    pub async fn create_google_user(
        &self,
        google_id: &str,
        email: Option<&str>,
        username: &str,
        picture: Option<&str>,
    ) -> Result<User> {
        let user = sqlx::query_as::<_, User>(
            r#"
            INSERT INTO users
                (google_id, email, username, picture, role, is_approved)
            VALUES
                ($1, $2, $3, $4, 'user', TRUE)
            RETURNING 
                id, username, email, password_hash, google_id, role, 
                official_id, location, phone, bio, picture, is_approved, 
                ngo_details, last_login, created_at, updated_at
            "#,
        )
        .bind(google_id)
        .bind(email)
        .bind(username)
        .bind(picture)
        .fetch_one(&self.pool)
        .await?;
        Ok(user)
    }

    pub async fn set_approved(&self, id: Uuid, approved: bool) -> Result<Option<User>> {
        let user = sqlx::query_as::<_, User>(
            "UPDATE users SET is_approved = $2, updated_at = now() WHERE id = $1 RETURNING *",
        )
        .bind(id)
        .bind(approved)
        .fetch_optional(&self.pool)
        .await?;
        Ok(user)
    }

    pub async fn touch_last_login(&self, id: Uuid) -> Result<()> {
        sqlx::query("UPDATE users SET last_login = now(), updated_at = now() WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}