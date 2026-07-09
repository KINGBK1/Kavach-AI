// src/models/incident.rs
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Incident {
    // NOT a UUID: incident ids come straight from each external source's
    // own API (USGS feature ids like "nc75391856", GDACS eventids like
    // "1029260", NASA EONET ids, etc). See backend/migrations/0006 for the
    // fix that corrected the DB column to match — this struct previously
    // declared `Uuid` here, which never matched the real data shape and
    // would have failed to deserialize the moment this struct was actually
    // used against a real row (it wasn't — this table is currently only
    // ever queried via SELECT COUNT(*), never row-by-row into this type).
    pub id: String,
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