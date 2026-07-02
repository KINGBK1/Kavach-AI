// src/repository/incidents.rs
use sqlx::PgPool;
use anyhow::Result;

pub struct IncidentRepository {
    pool: PgPool,
}

impl IncidentRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn count(&self) -> Result<i64> {
        let row = sqlx::query_scalar("SELECT COUNT(*) FROM incidents")
            .fetch_one(&self.pool)
            .await?;
        Ok(row)
    }
}