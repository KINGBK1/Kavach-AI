// src/services/notifier.rs
use tokio::sync::broadcast;
use serde_json::Value;

#[derive(Clone)]
pub struct Notifier {
    sender: broadcast::Sender<Value>,
}

impl Notifier {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(100);
        Self { sender }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<Value> {
        self.sender.subscribe()
    }

    pub fn notify(&self, event: Value) {
        let _ = self.sender.send(event);
    }
}