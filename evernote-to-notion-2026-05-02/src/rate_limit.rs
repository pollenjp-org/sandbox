use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::Instant;

/// Simple async token bucket. `acquire()` blocks until a token is available.
#[derive(Debug)]
pub struct TokenBucket {
    inner: Mutex<Inner>,
}

#[derive(Debug)]
struct Inner {
    capacity: f64,
    tokens: f64,
    refill_per_sec: f64,
    last_refill: Instant,
}

impl TokenBucket {
    pub fn new(capacity: u32, refill_per_sec: f64) -> Self {
        let now = Instant::now();
        Self {
            inner: Mutex::new(Inner {
                capacity: capacity as f64,
                tokens: capacity as f64,
                refill_per_sec,
                last_refill: now,
            }),
        }
    }

    pub async fn acquire(&self) {
        loop {
            let wait = {
                let mut inner = self.inner.lock().await;
                inner.refill();
                if inner.tokens >= 1.0 {
                    inner.tokens -= 1.0;
                    return;
                }
                let needed = 1.0 - inner.tokens;
                Duration::from_secs_f64(needed / inner.refill_per_sec)
            };
            tokio::time::sleep(wait).await;
        }
    }
}

impl Inner {
    fn refill(&mut self) {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refill).as_secs_f64();
        if elapsed > 0.0 {
            self.tokens = (self.tokens + elapsed * self.refill_per_sec).min(self.capacity);
            self.last_refill = now;
        }
    }
}
