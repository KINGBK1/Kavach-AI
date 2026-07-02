// src/services/scheduler.rs
use std::sync::Arc;
use tokio::time::{interval, Duration};
use crate::state::AppState;
use crate::services::ai_client::AiClient;

pub async fn start_scheduler(state: Arc<AppState>) {
    let mut ticker = interval(Duration::from_secs(300)); // every 5 minutes

    loop {
        ticker.tick().await;

        tracing::info!("Scheduler: fetching fresh incidents...");

        let client = AiClient::new(state.ai_service_url.clone());

        match client.analyze_incidents(10).await {
            Ok(results) => {
                tracing::info!("Scheduler: analyzed {} incidents", results.len());
            }
            Err(e) => {
                tracing::error!("Scheduler failed: {}", e);
            }
        }
    }
}