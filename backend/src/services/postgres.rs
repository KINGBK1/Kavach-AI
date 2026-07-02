// src/services/postgres.rs
use sqlx::PgPool;
use anyhow::Result;

pub async fn run_migrations(pool: &PgPool) -> Result<()> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}