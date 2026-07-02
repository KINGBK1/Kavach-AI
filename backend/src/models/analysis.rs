// src/models/analysis.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Analysis {
    pub incident_type: String,
    pub severity: String,
    pub priority_score: i32,
    pub confidence: f64,
    pub summary: String,
    pub recommended_actions: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalysisResult {
    pub incident_id: String,
    pub source: String,
    pub analysis: Analysis,
    pub metadata: AnalysisMetadata,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalysisMetadata {
    pub model: String,
    pub processing_time_ms: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatRequest {
    pub question: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatResponse {
    pub answer: String,
    pub relevant_incidents: Vec<serde_json::Value>,
    pub confidence: f64,
    pub model: String,
    pub processing_time_ms: i64,
}