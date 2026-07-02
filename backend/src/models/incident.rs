// src/models/incident.rs
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Incident {
    pub id: Uuid,
    pub external_id: Option<String>,
    pub source: String,
    pub title: String,
    pub description: String,
    pub category: String,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub severity: Option<String>,
    pub timestamp: Option<DateTime<Utc>>,
    pub url: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateIncidentRequest {
    pub title: String,
    pub description: String,
    pub category: String,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CitizenReport {
    pub description: String,
    pub latitude: f64,
    pub longitude: f64,
    pub category: Option<String>,
}