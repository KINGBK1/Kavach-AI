// src/services/google_auth.rs
//
// Verifies Google "Sign in with Google" ID tokens without relying on a
// Google-provided Rust SDK (none exists equivalent to `google-auth-library`).
//
// Flow:
//   1. Fetch Google's public JWKS (cached, since keys rotate infrequently).
//   2. Find the JWK matching the token's `kid` header.
//   3. Verify the RS256 signature, `aud` (== our client id), and `iss`.
//   4. Return the decoded claims (sub, email, name, picture).

use anyhow::{anyhow, Result};
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

const GOOGLE_JWKS_URL: &str = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS: [&str; 2] = ["accounts.google.com", "https://accounts.google.com"];

#[derive(Debug, Deserialize)]
struct Jwks {
    keys: Vec<Jwk>,
}

#[derive(Debug, Deserialize, Clone)]
struct Jwk {
    kid: String,
    n: String,
    e: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleClaims {
    pub sub: String,
    pub email: Option<String>,
    pub email_verified: Option<bool>,
    pub name: Option<String>,
    pub picture: Option<String>,
    pub aud: String,
    pub iss: String,
    pub exp: usize,
}

static JWKS_CACHE: Lazy<RwLock<Option<Jwks>>> = Lazy::new(|| RwLock::new(None));

async fn fetch_jwks() -> Result<Jwks> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .connect_timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| anyhow!("Failed to build reqwest client: {e}"))?;

    let resp = client
        .get(GOOGLE_JWKS_URL)
        .send()
        .await
        .map_err(|e| anyhow!("Failed to reach Google JWKS endpoint via client: {e}"))?;

    if !resp.status().is_success() {
        return Err(anyhow!(
            "Google JWKS endpoint returned status {}",
            resp.status()
        ));
    }

    let jwks: Jwks = resp
        .json()
        .await
        .map_err(|e| anyhow!("Failed to parse Google JWKS response: {e}"))?;

    Ok(jwks)
}

async fn get_key_for_kid(kid: &str) -> Result<Jwk> {
    {
        let cache = JWKS_CACHE.read().await;
        if let Some(jwks) = cache.as_ref() {
            if let Some(key) = jwks.keys.iter().find(|k| k.kid == kid) {
                return Ok(key.clone());
            }
        }
    }

    let jwks = fetch_jwks().await?;
    let key = jwks
        .keys
        .iter()
        .find(|k| k.kid == kid)
        .cloned()
        .ok_or_else(|| anyhow!("No matching Google signing key found for kid={kid}"))?;

    let mut cache = JWKS_CACHE.write().await;
    *cache = Some(jwks);

    Ok(key)
}

/// Verifies a Google ID token and returns its claims if valid.
pub async fn verify_id_token(id_token: &str, expected_client_id: &str) -> Result<GoogleClaims> {
    let header = decode_header(id_token).map_err(|e| anyhow!("Invalid token header: {e}"))?;
    let kid = header
        .kid
        .ok_or_else(|| anyhow!("Google ID token is missing a 'kid' header"))?;

    let jwk = get_key_for_kid(&kid).await?;

    let decoding_key = DecodingKey::from_rsa_components(&jwk.n, &jwk.e)
        .map_err(|e| anyhow!("Failed to build decoding key from Google JWK: {e}"))?;

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[expected_client_id]);
    validation.set_issuer(&GOOGLE_ISSUERS);

    let token_data = decode::<GoogleClaims>(id_token, &decoding_key, &validation)
        .map_err(|e| anyhow!("Google ID token verification failed: {e}"))?;

    Ok(token_data.claims)
}