// src/routes/websocket.rs
use axum::{
    Router,
    routing::get,
    extract::{State, WebSocketUpgrade, ws::{WebSocket, Message}},
    response::Response,
};
use std::sync::Arc;
use crate::state::AppState;
use futures_util::{sink::SinkExt, stream::StreamExt};

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(ws_handler))
        .with_state(state)
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, _state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();

    while let Some(msg) = receiver.next().await {
        if let Ok(Message::Text(text)) = msg {
            tracing::info!("WS received: {}", text);
            let response = Message::Text(
                format!("VARUNA received: {}", text).into()
            );
            if sender.send(response).await.is_err() {
                break;
            }
        }
    }
}