// src/services/ai_client.rs
use reqwest::Client;
use anyhow::{anyhow, Result};
use serde_json::Value;
use crate::models::analysis::{AnalysisResult, ChatRequest, ChatResponse};

pub struct AiClient {
    client: Client,
    base_url: String,
}

impl AiClient {
    pub fn new(base_url: String) -> Self {
        Self {
            client: Client::new(),
            base_url,
        }
    }

    pub async fn get_all_incidents(&self, limit: u32) -> Result<Vec<Value>> {
        let url = format!("{}/sources/all", self.base_url);
        let response = self.client
            .get(&url)
            .query(&[("limit", limit)])
            .send()
            .await?;

        let status = response.status();
        let text = response.text().await.unwrap_or_default();

        if !status.is_success() {
            return Err(anyhow!("AI service /sources/all failed {}: {}", status, text));
        }

        let incidents = serde_json::from_str::<Vec<Value>>(&text).map_err(|err| {
            anyhow!("AI service /sources/all response decode failed: {} - body: {}", err, text)
        })?;

        Ok(incidents)
    }

    pub async fn analyze_incidents(&self, limit: u32) -> Result<Vec<AnalysisResult>> {
        let url = format!("{}/analyze/all", self.base_url);
        let response = self.client
            .get(&url)
            .query(&[("limit", limit)])
            .send()
            .await?;

        let status = response.status();
        let text = response.text().await.unwrap_or_default();

        if !status.is_success() {
            return Err(anyhow!("AI service /analyze/all failed {}: {}", status, text));
        }

        let analyses = serde_json::from_str::<Vec<AnalysisResult>>(&text).map_err(|err| {
            anyhow!("AI service /analyze/all response decode failed: {} - body: {}", err, text)
        })?;

        Ok(analyses)
    }

    pub async fn analyze_single(&self, description: &str, latitude: f64, longitude: f64) -> Result<Value> {
        let url = format!("{}/analyze", self.base_url);
        let body = serde_json::json!({
            "description": description,
            "latitude": latitude,
            "longitude": longitude,
        });
        let response = self.client
            .post(&url)
            .json(&body)
            .send()
            .await?;

        let status = response.status();
        let text = response.text().await.unwrap_or_default();

        if !status.is_success() {
            return Err(anyhow!("AI service /analyze failed {}: {}", status, text));
        }

        let value = serde_json::from_str::<Value>(&text).map_err(|err| {
            anyhow!("AI service /analyze response decode failed: {} - body: {}", err, text)
        })?;

        Ok(value)
    }

    /// Like `analyze_single`, but hits the endpoint that scores the report
    /// AND writes it into the separate `citizen_reports` table (never into
    /// incidents/analyses — those stay trusted-source-only). Returns
    /// {report_id, status, corroborating_incidents, analysis, metadata}.
    /// `reported_by` is the authenticated user's id, used for per-user
    /// rate limiting on the AI service side.
    pub async fn analyze_citizen_report(
        &self,
        description: &str,
        latitude: f64,
        longitude: f64,
        category: &str,
        reported_by: &str,
    ) -> Result<Value> {
        let url = format!("{}/analyze/citizen-report", self.base_url);
        let body = serde_json::json!({
            "description": description,
            "latitude": latitude,
            "longitude": longitude,
            "category": category,
            "reported_by": reported_by,
        });
        let response = self.client
            .post(&url)
            .json(&body)
            .send()
            .await?;

        let status = response.status();
        let text = response.text().await.unwrap_or_default();

        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(anyhow!("RATE_LIMITED: {}", text));
        }

        if !status.is_success() {
            return Err(anyhow!("AI service /analyze/citizen-report failed {}: {}", status, text));
        }

        let value = serde_json::from_str::<Value>(&text).map_err(|err| {
            anyhow!("AI service /analyze/citizen-report response decode failed: {} - body: {}", err, text)
        })?;

        Ok(value)
    }

    /// Public, read-only list of citizen reports and how the verification
    /// agent judged each one — powers the frontend's trust ledger. Not
    /// gated by role: showing what the agent decided and why is the point,
    /// not something to hide behind auth.
    pub async fn list_citizen_reports(&self, status: Option<&str>, limit: u32) -> Result<Value> {
        let mut url = format!("{}/analyze/citizen-reports?limit={}", self.base_url, limit);
        if let Some(s) = status {
            url = format!("{}&status={}", url, s);
        }

        let response = self.client.get(&url).send().await?;
        let status_code = response.status();
        let text = response.text().await.unwrap_or_default();

        if !status_code.is_success() {
            return Err(anyhow!("AI service /analyze/citizen-reports failed {}: {}", status_code, text));
        }

        serde_json::from_str::<Value>(&text).map_err(|err| {
            anyhow!("AI service /analyze/citizen-reports response decode failed: {} - body: {}", err, text)
        })
    }

    pub async fn chat(&self, question: &str) -> Result<ChatResponse> {
        let url = format!("{}/chat", self.base_url);
        let body = ChatRequest {
            question: question.to_string(),
        };
        let response = self.client
            .post(&url)
            .json(&body)
            .send()
            .await?;

        let status = response.status();
        let text = response.text().await?;

        if !status.is_success() {
            return Err(anyhow!("AI service chat request failed ({}): {}", status, text));
        }

        let chat = serde_json::from_str::<ChatResponse>(&text).map_err(|err| {
            anyhow!("AI service chat response decode failed: {} - body: {}", err, text)
        })?;

        Ok(chat)
    }

    pub async fn get_dashboard(&self) -> Result<Value> {
        let url = format!("{}/analyze/dashboard", self.base_url);
        let response = self.client
            .get(&url)
            .send()
            .await?
            .json::<Value>()
            .await?;
        Ok(response)
    }

    /// Generic POST that sends JSON and returns JSON — used by promote/reject
    /// actions that don't need their own dedicated method.
    pub async fn post_json(&self, path: &str, body: Value) -> Result<Value> {
        let url = format!("{}{}", self.base_url, path);
        let response = self.client
            .post(&url)
            .json(&body)
            .send()
            .await?;
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(anyhow!("POST {} failed {}: {}", path, status, text));
        }
        serde_json::from_str::<Value>(&text).map_err(|err| {
            anyhow!("POST {} decode failed: {} - body: {}", path, err, text)
        })
    }

    pub async fn get_risk_zones(&self, grid_size: f64) -> Result<Value> {
        let url = format!("{}/analytics/risk-zones", self.base_url);
        let response = self.client
            .get(&url)
            .query(&[("grid_size", grid_size)])
            .send()
            .await?
            .json::<Value>()
            .await?;
        Ok(response)
    }

    pub async fn health(&self) -> Result<Value> {
        let url = format!("{}/health", self.base_url);
        let response = self.client
            .get(&url)
            .send()
            .await?
            .json::<Value>()
            .await?;
        Ok(response)
    }
}