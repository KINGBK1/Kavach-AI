use anyhow::{anyhow, Result};
use rand::Rng;
use sqlx::PgPool;

const OTP_LENGTH: usize = 6;
const OTP_EXPIRY_MINUTES: i64 = 5;
const RATE_LIMIT_SECONDS: i64 = 60;

pub fn generate_otp() -> String {
    let mut rng = rand::thread_rng();
    (0..OTP_LENGTH)
        .map(|_| rng.gen_range(0..10).to_string())
        .collect()
}

pub async fn store_otp(pool: &PgPool, email: &str, code: &str, purpose: &str) -> Result<()> {
    let expires_at = chrono::Utc::now() + chrono::Duration::minutes(OTP_EXPIRY_MINUTES);
    sqlx::query(
        r#"
        INSERT INTO otp_codes (email, code, purpose, expires_at)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(email)
    .bind(code)
    .bind(purpose)
    .bind(expires_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn can_resend(pool: &PgPool, email: &str, purpose: &str) -> Result<bool> {
    let row: Option<(i64,)> = sqlx::query_as(
        r#"
        SELECT COUNT(*) as cnt FROM otp_codes
        WHERE email = $1 AND purpose = $2 AND verified = FALSE
        AND created_at > NOW() - INTERVAL '1 minute'
        "#,
    )
    .bind(email)
    .bind(purpose)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| r.0 == 0).unwrap_or(true))
}

pub async fn verify_otp(pool: &PgPool, email: &str, code: &str, purpose: &str) -> Result<bool> {
    let row: Option<(String,)> = sqlx::query_as(
        r#"
        UPDATE otp_codes
        SET verified = TRUE
        WHERE email = $1 AND code = $2 AND purpose = $3
        AND expires_at > NOW() AND verified = FALSE
        RETURNING email
        "#,
    )
    .bind(email)
    .bind(code)
    .bind(purpose)
    .fetch_optional(pool)
    .await
    .map_err(|e| anyhow!("Failed to verify OTP: {e}"))?;

    Ok(row.is_some())
}

pub async fn clean_expired(pool: &PgPool) -> Result<()> {
    sqlx::query("DELETE FROM otp_codes WHERE expires_at < NOW()")
        .execute(pool)
        .await?;
    Ok(())
}
