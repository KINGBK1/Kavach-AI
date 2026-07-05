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

    const SELECT_COLS: &'static str = "\
        id, username, email, password_hash, google_id, role, \
        official_id, location, latitude, longitude, phone, bio, \
        picture, is_approved, ngo_details, preferences, \
        last_login, created_at, updated_at";

    pub async fn find_by_id(&self, id: Uuid) -> Result<Option<User>> {
        let sql = format!(
            "SELECT {} FROM users WHERE id = $1",
            Self::SELECT_COLS
        );
        let user = sqlx::query_as::<_, User>(&sql)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        Ok(user)
    }

    pub async fn find_by_username(&self, username: &str) -> Result<Option<User>> {
        let sql = format!(
            "SELECT {} FROM users WHERE username = $1",
            Self::SELECT_COLS
        );
        let user = sqlx::query_as::<_, User>(&sql)
            .bind(username)
            .fetch_optional(&self.pool)
            .await?;
        Ok(user)
    }

    pub async fn find_by_email(&self, email: &str) -> Result<Option<User>> {
        let sql = format!(
            "SELECT {} FROM users WHERE email = $1",
            Self::SELECT_COLS
        );
        let user = sqlx::query_as::<_, User>(&sql)
            .bind(email)
            .fetch_optional(&self.pool)
            .await?;
        Ok(user)
    }

    pub async fn find_by_google_id(&self, google_id: &str) -> Result<Option<User>> {
        let sql = format!(
            "SELECT {} FROM users WHERE google_id = $1",
            Self::SELECT_COLS
        );
        let user = sqlx::query_as::<_, User>(&sql)
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
        latitude: Option<f64>,
        longitude: Option<f64>,
        phone: Option<&str>,
        ngo_details: Option<&Value>,
        is_approved: bool,
    ) -> Result<User> {
        let sql = format!(
            r#"
            INSERT INTO users
                (username, email, password_hash, role, official_id, location, latitude, longitude, phone, ngo_details, is_approved)
            VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING {}
            "#,
            Self::SELECT_COLS
        );
        let user = sqlx::query_as::<_, User>(&sql)
            .bind(username)
            .bind(email)
            .bind(password_hash)
            .bind(role)
            .bind(official_id)
            .bind(location)
            .bind(latitude)
            .bind(longitude)
            .bind(phone)
            .bind(ngo_details)
            .bind(is_approved)
            .fetch_one(&self.pool)
            .await?;
        Ok(user)
    }

    pub async fn create_google_user(
        &self,
        google_id: &str,
        email: Option<&str>,
        username: &str,
        picture: Option<&str>,
    ) -> Result<User> {
        let sql = format!(
            r#"
            INSERT INTO users
                (google_id, email, username, picture, role, is_approved)
            VALUES
                ($1, $2, $3, $4, 'user', TRUE)
            RETURNING {}
            "#,
            Self::SELECT_COLS
        );
        let user = sqlx::query_as::<_, User>(&sql)
            .bind(google_id)
            .bind(email)
            .bind(username)
            .bind(picture)
            .fetch_one(&self.pool)
            .await?;
        Ok(user)
    }

    pub async fn set_approved(&self, id: Uuid, approved: bool) -> Result<Option<User>> {
        let sql = format!(
            r#"UPDATE users SET is_approved = $2, updated_at = now() WHERE id = $1 RETURNING {}"#,
            Self::SELECT_COLS
        );
        let user = sqlx::query_as::<_, User>(&sql)
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

    pub async fn update_profile(
        &self,
        id: Uuid,
        latitude: Option<f64>,
        longitude: Option<f64>,
        preferences: Option<Value>,
    ) -> Result<Option<User>> {
        let mut sets = Vec::new();
        let mut idx = 2;

        if let Some(_) = latitude {
            sets.push(format!("latitude = ${}", idx));
            idx += 1;
        }
        if let Some(_) = longitude {
            sets.push(format!("longitude = ${}", idx));
            idx += 1;
        }
        if preferences.is_some() {
            sets.push(format!("preferences = ${}", idx));
            idx += 1;
        }

        if sets.is_empty() {
            return self.find_by_id(id).await;
        }

        sets.push("updated_at = now()".to_string());

        let sql = format!(
            "UPDATE users SET {} WHERE id = $1 RETURNING {}",
            sets.join(", "),
            Self::SELECT_COLS
        );

        let mut query = sqlx::query_as::<_, User>(&sql).bind(id);

        if let Some(lat) = latitude {
            query = query.bind(lat);
        }
        if let Some(lng) = longitude {
            query = query.bind(lng);
        }
        if let Some(prefs) = preferences {
            query = query.bind(prefs);
        }

        let user = query.fetch_optional(&self.pool).await?;
        Ok(user)
    }
}
