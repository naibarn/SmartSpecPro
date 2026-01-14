// Rate Limiter Module
//
// SECURITY FIX (HIGH-004): Rate limiting for API calls
//
// Provides:
// - Token bucket rate limiting
// - Per-provider rate limits
// - Cost tracking
// - Burst handling

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};

// ============================================
// Rate Limiter Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitConfig {
    /// Requests per minute
    pub requests_per_minute: u32,
    /// Tokens per minute
    pub tokens_per_minute: u32,
    /// Maximum burst size
    pub burst_size: u32,
    /// Cost limit per day (in USD)
    pub daily_cost_limit: f64,
    /// Cost limit per month (in USD)
    pub monthly_cost_limit: f64,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            requests_per_minute: 60,
            tokens_per_minute: 100_000,
            burst_size: 10,
            daily_cost_limit: 10.0,
            monthly_cost_limit: 100.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderLimits {
    pub openrouter: RateLimitConfig,
    pub openai: RateLimitConfig,
    pub anthropic: RateLimitConfig,
    pub deepseek: RateLimitConfig,
    pub google: RateLimitConfig,
}

impl Default for ProviderLimits {
    fn default() -> Self {
        Self {
            openrouter: RateLimitConfig {
                requests_per_minute: 100,
                tokens_per_minute: 200_000,
                burst_size: 20,
                daily_cost_limit: 20.0,
                monthly_cost_limit: 200.0,
            },
            openai: RateLimitConfig {
                requests_per_minute: 60,
                tokens_per_minute: 150_000,
                burst_size: 10,
                daily_cost_limit: 15.0,
                monthly_cost_limit: 150.0,
            },
            anthropic: RateLimitConfig {
                requests_per_minute: 50,
                tokens_per_minute: 100_000,
                burst_size: 10,
                daily_cost_limit: 20.0,
                monthly_cost_limit: 200.0,
            },
            deepseek: RateLimitConfig {
                requests_per_minute: 100,
                tokens_per_minute: 200_000,
                burst_size: 20,
                daily_cost_limit: 5.0,
                monthly_cost_limit: 50.0,
            },
            google: RateLimitConfig {
                requests_per_minute: 60,
                tokens_per_minute: 150_000,
                burst_size: 10,
                daily_cost_limit: 10.0,
                monthly_cost_limit: 100.0,
            },
        }
    }
}

// ============================================
// Token Bucket
// ============================================

#[derive(Debug)]
struct TokenBucket {
    tokens: f64,
    max_tokens: f64,
    refill_rate: f64, // tokens per second
    last_refill: Instant,
}

impl TokenBucket {
    fn new(max_tokens: u32, refill_per_minute: u32) -> Self {
        Self {
            tokens: max_tokens as f64,
            max_tokens: max_tokens as f64,
            refill_rate: refill_per_minute as f64 / 60.0,
            last_refill: Instant::now(),
        }
    }
    
    fn refill(&mut self) {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refill).as_secs_f64();
        self.tokens = (self.tokens + elapsed * self.refill_rate).min(self.max_tokens);
        self.last_refill = now;
    }
    
    fn try_consume(&mut self, amount: f64) -> bool {
        self.refill();
        if self.tokens >= amount {
            self.tokens -= amount;
            true
        } else {
            false
        }
    }
    
    fn time_until_available(&self, amount: f64) -> Duration {
        if self.tokens >= amount {
            Duration::ZERO
        } else {
            let needed = amount - self.tokens;
            Duration::from_secs_f64(needed / self.refill_rate)
        }
    }
}

// ============================================
// Cost Tracker
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostRecord {
    pub timestamp: i64,
    pub provider: String,
    pub model: String,
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub cost: f64,
}

#[derive(Debug)]
struct CostTracker {
    records: Vec<CostRecord>,
    daily_total: f64,
    monthly_total: f64,
    last_daily_reset: i64,
    last_monthly_reset: i64,
}

impl CostTracker {
    fn new() -> Self {
        let now = chrono::Utc::now().timestamp();
        Self {
            records: Vec::new(),
            daily_total: 0.0,
            monthly_total: 0.0,
            last_daily_reset: now,
            last_monthly_reset: now,
        }
    }
    
    fn check_and_reset(&mut self) {
        let now = chrono::Utc::now().timestamp();
        let day_seconds = 86400;
        let month_seconds = 86400 * 30;
        
        // Reset daily counter
        if now - self.last_daily_reset >= day_seconds {
            self.daily_total = 0.0;
            self.last_daily_reset = now;
            // Clean old records
            self.records.retain(|r| now - r.timestamp < month_seconds);
        }
        
        // Reset monthly counter
        if now - self.last_monthly_reset >= month_seconds {
            self.monthly_total = 0.0;
            self.last_monthly_reset = now;
        }
    }
    
    fn add_cost(&mut self, record: CostRecord) {
        self.check_and_reset();
        self.daily_total += record.cost;
        self.monthly_total += record.cost;
        self.records.push(record);
    }
    
    fn get_daily_total(&mut self) -> f64 {
        self.check_and_reset();
        self.daily_total
    }
    
    fn get_monthly_total(&mut self) -> f64 {
        self.check_and_reset();
        self.monthly_total
    }
}

// ============================================
// Rate Limiter
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitStatus {
    pub allowed: bool,
    pub wait_time_ms: u64,
    pub reason: Option<String>,
    pub daily_cost: f64,
    pub monthly_cost: f64,
    pub daily_limit: f64,
    pub monthly_limit: f64,
}

pub struct RateLimiter {
    request_buckets: Arc<RwLock<HashMap<String, TokenBucket>>>,
    token_buckets: Arc<RwLock<HashMap<String, TokenBucket>>>,
    cost_trackers: Arc<RwLock<HashMap<String, CostTracker>>>,
    limits: Arc<RwLock<ProviderLimits>>,
}

impl RateLimiter {
    pub fn new(limits: ProviderLimits) -> Self {
        Self {
            request_buckets: Arc::new(RwLock::new(HashMap::new())),
            token_buckets: Arc::new(RwLock::new(HashMap::new())),
            cost_trackers: Arc::new(RwLock::new(HashMap::new())),
            limits: Arc::new(RwLock::new(limits)),
        }
    }
    
    fn get_provider_config(&self, provider: &str, limits: &ProviderLimits) -> RateLimitConfig {
        match provider.to_lowercase().as_str() {
            "openrouter" => limits.openrouter.clone(),
            "openai" => limits.openai.clone(),
            "anthropic" => limits.anthropic.clone(),
            "deepseek" => limits.deepseek.clone(),
            "google" => limits.google.clone(),
            _ => RateLimitConfig::default(),
        }
    }
    
    /// Check if a request is allowed
    pub async fn check_request(&self, provider: &str, estimated_tokens: i32) -> RateLimitStatus {
        let limits = self.limits.read().await;
        let config = self.get_provider_config(provider, &limits);
        drop(limits);
        
        // Check request rate limit
        let mut request_buckets = self.request_buckets.write().await;
        let request_bucket = request_buckets
            .entry(provider.to_string())
            .or_insert_with(|| TokenBucket::new(config.burst_size, config.requests_per_minute));
        
        if !request_bucket.try_consume(1.0) {
            let wait_time = request_bucket.time_until_available(1.0);
            return RateLimitStatus {
                allowed: false,
                wait_time_ms: wait_time.as_millis() as u64,
                reason: Some("Request rate limit exceeded".to_string()),
                daily_cost: 0.0,
                monthly_cost: 0.0,
                daily_limit: config.daily_cost_limit,
                monthly_limit: config.monthly_cost_limit,
            };
        }
        drop(request_buckets);
        
        // Check token rate limit
        let mut token_buckets = self.token_buckets.write().await;
        let token_bucket = token_buckets
            .entry(provider.to_string())
            .or_insert_with(|| TokenBucket::new(config.tokens_per_minute, config.tokens_per_minute));
        
        if !token_bucket.try_consume(estimated_tokens as f64) {
            let wait_time = token_bucket.time_until_available(estimated_tokens as f64);
            return RateLimitStatus {
                allowed: false,
                wait_time_ms: wait_time.as_millis() as u64,
                reason: Some("Token rate limit exceeded".to_string()),
                daily_cost: 0.0,
                monthly_cost: 0.0,
                daily_limit: config.daily_cost_limit,
                monthly_limit: config.monthly_cost_limit,
            };
        }
        drop(token_buckets);
        
        // Check cost limits
        let mut cost_trackers = self.cost_trackers.write().await;
        let tracker = cost_trackers
            .entry(provider.to_string())
            .or_insert_with(CostTracker::new);
        
        let daily_cost = tracker.get_daily_total();
        let monthly_cost = tracker.get_monthly_total();
        
        if daily_cost >= config.daily_cost_limit {
            return RateLimitStatus {
                allowed: false,
                wait_time_ms: 0,
                reason: Some(format!("Daily cost limit exceeded (${:.2}/${:.2})", daily_cost, config.daily_cost_limit)),
                daily_cost,
                monthly_cost,
                daily_limit: config.daily_cost_limit,
                monthly_limit: config.monthly_cost_limit,
            };
        }
        
        if monthly_cost >= config.monthly_cost_limit {
            return RateLimitStatus {
                allowed: false,
                wait_time_ms: 0,
                reason: Some(format!("Monthly cost limit exceeded (${:.2}/${:.2})", monthly_cost, config.monthly_cost_limit)),
                daily_cost,
                monthly_cost,
                daily_limit: config.daily_cost_limit,
                monthly_limit: config.monthly_cost_limit,
            };
        }
        
        RateLimitStatus {
            allowed: true,
            wait_time_ms: 0,
            reason: None,
            daily_cost,
            monthly_cost,
            daily_limit: config.daily_cost_limit,
            monthly_limit: config.monthly_cost_limit,
        }
    }
    
    /// Record a completed request with cost
    pub async fn record_usage(
        &self,
        provider: &str,
        model: &str,
        input_tokens: i32,
        output_tokens: i32,
        cost: f64,
    ) {
        let mut cost_trackers = self.cost_trackers.write().await;
        let tracker = cost_trackers
            .entry(provider.to_string())
            .or_insert_with(CostTracker::new);
        
        tracker.add_cost(CostRecord {
            timestamp: chrono::Utc::now().timestamp(),
            provider: provider.to_string(),
            model: model.to_string(),
            input_tokens,
            output_tokens,
            cost,
        });
    }
    
    /// Get current usage statistics
    pub async fn get_usage_stats(&self, provider: &str) -> UsageStats {
        let limits = self.limits.read().await;
        let config = self.get_provider_config(provider, &limits);
        drop(limits);
        
        let mut cost_trackers = self.cost_trackers.write().await;
        let tracker = cost_trackers
            .entry(provider.to_string())
            .or_insert_with(CostTracker::new);
        
        UsageStats {
            provider: provider.to_string(),
            daily_cost: tracker.get_daily_total(),
            monthly_cost: tracker.get_monthly_total(),
            daily_limit: config.daily_cost_limit,
            monthly_limit: config.monthly_cost_limit,
            requests_per_minute: config.requests_per_minute,
            tokens_per_minute: config.tokens_per_minute,
        }
    }
    
    /// Update rate limit configuration
    pub async fn update_limits(&self, limits: ProviderLimits) {
        let mut current = self.limits.write().await;
        *current = limits;
    }
    
    /// Reset all rate limits (for testing or admin)
    pub async fn reset_all(&self) {
        self.request_buckets.write().await.clear();
        self.token_buckets.write().await.clear();
        self.cost_trackers.write().await.clear();
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageStats {
    pub provider: String,
    pub daily_cost: f64,
    pub monthly_cost: f64,
    pub daily_limit: f64,
    pub monthly_limit: f64,
    pub requests_per_minute: u32,
    pub tokens_per_minute: u32,
}

// ============================================
// Global Rate Limiter Instance
// ============================================

use once_cell::sync::Lazy;

pub static RATE_LIMITER: Lazy<RateLimiter> = Lazy::new(|| {
    RateLimiter::new(ProviderLimits::default())
});

// ============================================
// Tauri Commands
// ============================================

#[tauri::command]
pub async fn check_rate_limit(provider: String, estimated_tokens: i32) -> Result<RateLimitStatus, String> {
    Ok(RATE_LIMITER.check_request(&provider, estimated_tokens).await)
}

#[tauri::command]
pub async fn record_api_usage(
    provider: String,
    model: String,
    input_tokens: i32,
    output_tokens: i32,
    cost: f64,
) -> Result<(), String> {
    RATE_LIMITER.record_usage(&provider, &model, input_tokens, output_tokens, cost).await;
    Ok(())
}

#[tauri::command]
pub async fn get_provider_usage_stats(provider: String) -> Result<UsageStats, String> {
    Ok(RATE_LIMITER.get_usage_stats(&provider).await)
}

#[tauri::command]
pub async fn update_rate_limits(limits: ProviderLimits) -> Result<(), String> {
    RATE_LIMITER.update_limits(limits).await;
    Ok(())
}

// ============================================
// Tests
// ============================================

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_rate_limiter_allows_initial_requests() {
        let limiter = RateLimiter::new(ProviderLimits::default());
        let status = limiter.check_request("openrouter", 100).await;
        assert!(status.allowed);
    }
    
    #[tokio::test]
    async fn test_rate_limiter_blocks_after_burst() {
        let mut limits = ProviderLimits::default();
        limits.openrouter.burst_size = 2;
        limits.openrouter.requests_per_minute = 2;
        
        let limiter = RateLimiter::new(limits);
        
        // First two requests should succeed
        assert!(limiter.check_request("openrouter", 100).await.allowed);
        assert!(limiter.check_request("openrouter", 100).await.allowed);
        
        // Third request should be blocked
        let status = limiter.check_request("openrouter", 100).await;
        assert!(!status.allowed);
        assert!(status.wait_time_ms > 0);
    }
    
    #[tokio::test]
    async fn test_cost_tracking() {
        let limiter = RateLimiter::new(ProviderLimits::default());
        
        limiter.record_usage("openrouter", "claude-3", 1000, 500, 0.05).await;
        
        let stats = limiter.get_usage_stats("openrouter").await;
        assert_eq!(stats.daily_cost, 0.05);
        assert_eq!(stats.monthly_cost, 0.05);
    }
    
    #[tokio::test]
    async fn test_daily_cost_limit() {
        let mut limits = ProviderLimits::default();
        limits.openrouter.daily_cost_limit = 0.10;
        
        let limiter = RateLimiter::new(limits);
        
        // Record usage up to limit
        limiter.record_usage("openrouter", "claude-3", 1000, 500, 0.10).await;
        
        // Next request should be blocked
        let status = limiter.check_request("openrouter", 100).await;
        assert!(!status.allowed);
        assert!(status.reason.unwrap().contains("Daily cost limit"));
    }
}
