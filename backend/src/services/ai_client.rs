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
            .await?
            .json::<Vec<Value>>()
            .await?;
        Ok(response)
    }

    pub async fn analyze_incidents(&self, limit: u32) -> Result<Vec<AnalysisResult>> {
        let url = format!("{}/analyze/all", self.base_url);
        let response = self.client
            .get(&url)
            .query(&[("limit", limit)])
            .send()
            .await?
            .json::<Vec<AnalysisResult>>()
            .await?;
        Ok(response)
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
            .await?
            .json::<Value>()
            .await?;
        Ok(response)
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