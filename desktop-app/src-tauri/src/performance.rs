// Performance Monitor - System Performance Monitoring and Optimization
//
// Provides:
// - Memory usage tracking
// - CPU monitoring
// - Database optimization
// - Cache management
// - Lazy loading utilities

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};

// ============================================
// Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMetrics {
    pub timestamp: i64,
    pub memory_used_mb: f64,
    pub memory_total_mb: f64,
    pub memory_percent: f64,
    pub cpu_percent: f64,
    pub db_connections: i32,
    pub cache_size_mb: f64,
    pub cache_hit_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceReport {
    pub current: SystemMetrics,
    pub history: Vec<SystemMetrics>,
    pub recommendations: Vec<Recommendation>,
    pub db_stats: DatabaseStats,
    pub cache_stats: CacheStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recommendation {
    pub level: RecommendationLevel,
    pub category: String,
    pub message: String,
    pub action: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RecommendationLevel {
    Info,
    Warning,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseStats {
    pub total_size_mb: f64,
    pub table_count: i32,
    pub index_count: i32,
    pub fragmentation_percent: f64,
    pub last_vacuum: Option<i64>,
    pub query_cache_hits: i64,
    pub query_cache_misses: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub total_entries: i32,
    pub size_mb: f64,
    pub hit_count: i64,
    pub miss_count: i64,
    pub eviction_count: i64,
    pub oldest_entry_age_secs: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationResult {
    pub action: String,
    pub success: bool,
    pub before: f64,
    pub after: f64,
    pub improvement_percent: f64,
    pub duration_ms: u64,
}

// ============================================
// Cache Entry
// ============================================

#[derive(Debug, Clone)]
struct CacheEntry<T> {
    value: T,
    created_at: Instant,
    last_accessed: Instant,
    access_count: u64,
    size_bytes: usize,
}

// ============================================
// LRU Cache
// ============================================

pub struct LruCache<K, V> {
    entries: HashMap<K, CacheEntry<V>>,
    max_size_bytes: usize,
    current_size_bytes: usize,
    max_entries: usize,
    ttl: Duration,
    hits: u64,
    misses: u64,
    evictions: u64,
}

impl<K: std::hash::Hash + Eq + Clone, V: Clone> LruCache<K, V> {
    pub fn new(max_size_mb: f64, max_entries: usize, ttl_secs: u64) -> Self {
        Self {
            entries: HashMap::new(),
            max_size_bytes: (max_size_mb * 1024.0 * 1024.0) as usize,
            current_size_bytes: 0,
            max_entries,
            ttl: Duration::from_secs(ttl_secs),
            hits: 0,
            misses: 0,
            evictions: 0,
        }
    }

    pub fn get(&mut self, key: &K) -> Option<V> {
        if let Some(entry) = self.entries.get_mut(key) {
            // Check TTL
            if entry.created_at.elapsed() > self.ttl {
                self.entries.remove(key);
                self.misses += 1;
                return None;
            }
            
            entry.last_accessed = Instant::now();
            entry.access_count += 1;
            self.hits += 1;
            Some(entry.value.clone())
        } else {
            self.misses += 1;
            None
        }
    }

    pub fn insert(&mut self, key: K, value: V, size_bytes: usize) {
        // Evict if necessary
        while self.current_size_bytes + size_bytes > self.max_size_bytes 
            || self.entries.len() >= self.max_entries 
        {
            if !self.evict_lru() {
                break;
            }
        }

        let now = Instant::now();
        let entry = CacheEntry {
            value,
            created_at: now,
            last_accessed: now,
            access_count: 1,
            size_bytes,
        };

        if let Some(old) = self.entries.insert(key, entry) {
            self.current_size_bytes -= old.size_bytes;
        }
        self.current_size_bytes += size_bytes;
    }

    pub fn remove(&mut self, key: &K) -> Option<V> {
        if let Some(entry) = self.entries.remove(key) {
            self.current_size_bytes -= entry.size_bytes;
            Some(entry.value)
        } else {
            None
        }
    }

    pub fn clear(&mut self) {
        self.entries.clear();
        self.current_size_bytes = 0;
    }

    fn evict_lru(&mut self) -> bool {
        if self.entries.is_empty() {
            return false;
        }

        // Find LRU entry
        let lru_key = self.entries
            .iter()
            .min_by_key(|(_, e)| e.last_accessed)
            .map(|(k, _)| k.clone());

        if let Some(key) = lru_key {
            if let Some(entry) = self.entries.remove(&key) {
                self.current_size_bytes -= entry.size_bytes;
                self.evictions += 1;
                return true;
            }
        }
        false
    }

    pub fn stats(&self) -> CacheStats {
        let oldest_age = self.entries
            .values()
            .map(|e| e.created_at.elapsed().as_secs() as i64)
            .max()
            .unwrap_or(0);

        CacheStats {
            total_entries: self.entries.len() as i32,
            size_mb: self.current_size_bytes as f64 / (1024.0 * 1024.0),
            hit_count: self.hits as i64,
            miss_count: self.misses as i64,
            eviction_count: self.evictions as i64,
            oldest_entry_age_secs: oldest_age,
        }
    }

    pub fn hit_rate(&self) -> f64 {
        let total = self.hits + self.misses;
        if total == 0 {
            0.0
        } else {
            self.hits as f64 / total as f64
        }
    }
}

// ============================================
// Performance Monitor
// ============================================

pub struct PerformanceMonitor {
    metrics_history: Arc<Mutex<Vec<SystemMetrics>>>,
    max_history: usize,
    query_cache: Arc<Mutex<LruCache<String, String>>>,
    data_cache: Arc<Mutex<LruCache<String, Vec<u8>>>>,
}

impl PerformanceMonitor {
    pub fn new() -> Self {
        Self {
            metrics_history: Arc::new(Mutex::new(Vec::new())),
            max_history: 100,
            query_cache: Arc::new(Mutex::new(LruCache::new(50.0, 1000, 300))), // 50MB, 1000 entries, 5min TTL
            data_cache: Arc::new(Mutex::new(LruCache::new(100.0, 500, 600))),  // 100MB, 500 entries, 10min TTL
        }
    }

    // ============================================
    // Metrics Collection
    // ============================================

    pub async fn collect_metrics(&self) -> SystemMetrics {
        let memory = self.get_memory_usage();
        let cpu = self.get_cpu_usage();
        let cache_stats = self.query_cache.lock().await.stats();

        let metrics = SystemMetrics {
            timestamp: chrono::Utc::now().timestamp(),
            memory_used_mb: memory.0,
            memory_total_mb: memory.1,
            memory_percent: if memory.1 > 0.0 { (memory.0 / memory.1) * 100.0 } else { 0.0 },
            cpu_percent: cpu,
            db_connections: 1, // TODO: Get actual count
            cache_size_mb: cache_stats.size_mb,
            cache_hit_rate: self.query_cache.lock().await.hit_rate(),
        };

        // Store in history
        let mut history = self.metrics_history.lock().await;
        history.push(metrics.clone());
        if history.len() > self.max_history {
            history.remove(0);
        }

        metrics
    }

    fn get_memory_usage(&self) -> (f64, f64) {
        // Platform-specific memory reading
        #[cfg(target_os = "linux")]
        {
            if let Ok(content) = std::fs::read_to_string("/proc/meminfo") {
                let mut total = 0u64;
                let mut available = 0u64;
                
                for line in content.lines() {
                    if line.starts_with("MemTotal:") {
                        total = Self::parse_meminfo_value(line);
                    } else if line.starts_with("MemAvailable:") {
                        available = Self::parse_meminfo_value(line);
                    }
                }
                
                let total_mb = total as f64 / 1024.0;
                let used_mb = (total - available) as f64 / 1024.0;
                return (used_mb, total_mb);
            }
        }
        
        // Default fallback
        (0.0, 0.0)
    }

    #[cfg(target_os = "linux")]
    fn parse_meminfo_value(line: &str) -> u64 {
        line.split_whitespace()
            .nth(1)
            .and_then(|v| v.parse().ok())
            .unwrap_or(0)
    }

    fn get_cpu_usage(&self) -> f64 {
        // Simplified CPU usage - would need proper implementation
        0.0
    }

    // ============================================
    // Cache Operations
    // ============================================

    pub async fn cache_query(&self, key: &str, result: &str) {
        let size = result.len();
        self.query_cache.lock().await.insert(key.to_string(), result.to_string(), size);
    }

    pub async fn get_cached_query(&self, key: &str) -> Option<String> {
        self.query_cache.lock().await.get(&key.to_string())
    }

    pub async fn cache_data(&self, key: &str, data: Vec<u8>) {
        let size = data.len();
        self.data_cache.lock().await.insert(key.to_string(), data, size);
    }

    pub async fn get_cached_data(&self, key: &str) -> Option<Vec<u8>> {
        self.data_cache.lock().await.get(&key.to_string())
    }

    pub async fn clear_caches(&self) {
        self.query_cache.lock().await.clear();
        self.data_cache.lock().await.clear();
    }

    pub async fn get_cache_stats(&self) -> CacheStats {
        self.query_cache.lock().await.stats()
    }

    // ============================================
    // Database Optimization
    // ============================================

    pub async fn optimize_database(&self, db_path: &str) -> Result<OptimizationResult, String> {
        let start = Instant::now();
        
        // Get size before
        let size_before = std::fs::metadata(db_path)
            .map(|m| m.len() as f64 / (1024.0 * 1024.0))
            .unwrap_or(0.0);

        // Run VACUUM
        let conn = rusqlite::Connection::open(db_path)
            .map_err(|e| e.to_string())?;
        
        conn.execute("VACUUM", [])
            .map_err(|e| e.to_string())?;
        
        conn.execute("ANALYZE", [])
            .map_err(|e| e.to_string())?;

        // Get size after
        let size_after = std::fs::metadata(db_path)
            .map(|m| m.len() as f64 / (1024.0 * 1024.0))
            .unwrap_or(0.0);

        let improvement = if size_before > 0.0 {
            ((size_before - size_after) / size_before) * 100.0
        } else {
            0.0
        };

        Ok(OptimizationResult {
            action: "VACUUM + ANALYZE".to_string(),
            success: true,
            before: size_before,
            after: size_after,
            improvement_percent: improvement,
            duration_ms: start.elapsed().as_millis() as u64,
        })
    }

    pub async fn get_database_stats(&self, db_path: &str) -> Result<DatabaseStats, String> {
        let conn = rusqlite::Connection::open(db_path)
            .map_err(|e| e.to_string())?;

        // Get file size
        let total_size = std::fs::metadata(db_path)
            .map(|m| m.len() as f64 / (1024.0 * 1024.0))
            .unwrap_or(0.0);

        // Count tables
        let table_count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table'",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

        // Count indexes
        let index_count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='index'",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

        // Get fragmentation (simplified)
        let page_count: i64 = conn.query_row("PRAGMA page_count", [], |row| row.get(0)).unwrap_or(0);
        let freelist_count: i64 = conn.query_row("PRAGMA freelist_count", [], |row| row.get(0)).unwrap_or(0);
        let fragmentation = if page_count > 0 {
            (freelist_count as f64 / page_count as f64) * 100.0
        } else {
            0.0
        };

        Ok(DatabaseStats {
            total_size_mb: total_size,
            table_count,
            index_count,
            fragmentation_percent: fragmentation,
            last_vacuum: None, // Would need to track this
            query_cache_hits: self.query_cache.lock().await.stats().hit_count,
            query_cache_misses: self.query_cache.lock().await.stats().miss_count,
        })
    }

    // ============================================
    // Recommendations
    // ============================================

    pub async fn get_recommendations(&self) -> Vec<Recommendation> {
        let mut recommendations = Vec::new();
        let metrics = self.collect_metrics().await;
        let cache_stats = self.get_cache_stats().await;

        // Memory recommendations
        if metrics.memory_percent > 80.0 {
            recommendations.push(Recommendation {
                level: RecommendationLevel::Warning,
                category: "Memory".to_string(),
                message: format!("Memory usage is high ({:.1}%)", metrics.memory_percent),
                action: Some("Consider closing unused workspaces or clearing cache".to_string()),
            });
        }

        // Cache recommendations
        if cache_stats.hit_count + cache_stats.miss_count > 100 {
            let hit_rate = cache_stats.hit_count as f64 / (cache_stats.hit_count + cache_stats.miss_count) as f64;
            if hit_rate < 0.5 {
                recommendations.push(Recommendation {
                    level: RecommendationLevel::Info,
                    category: "Cache".to_string(),
                    message: format!("Cache hit rate is low ({:.1}%)", hit_rate * 100.0),
                    action: Some("Consider increasing cache size or TTL".to_string()),
                });
            }
        }

        // Cache size recommendation
        if cache_stats.size_mb > 80.0 {
            recommendations.push(Recommendation {
                level: RecommendationLevel::Info,
                category: "Cache".to_string(),
                message: format!("Cache is using {:.1} MB", cache_stats.size_mb),
                action: Some("Consider clearing old cache entries".to_string()),
            });
        }

        recommendations
    }

    // ============================================
    // Performance Report
    // ============================================

    pub async fn generate_report(&self, db_path: Option<&str>) -> Result<PerformanceReport, String> {
        let current = self.collect_metrics().await;
        let history = self.metrics_history.lock().await.clone();
        let recommendations = self.get_recommendations().await;
        let cache_stats = self.get_cache_stats().await;

        let db_stats = if let Some(path) = db_path {
            self.get_database_stats(path).await?
        } else {
            DatabaseStats {
                total_size_mb: 0.0,
                table_count: 0,
                index_count: 0,
                fragmentation_percent: 0.0,
                last_vacuum: None,
                query_cache_hits: 0,
                query_cache_misses: 0,
            }
        };

        Ok(PerformanceReport {
            current,
            history,
            recommendations,
            db_stats,
            cache_stats,
        })
    }
}

// ============================================
// Lazy Loader
// ============================================

pub struct LazyLoader<T> {
    value: Arc<Mutex<Option<T>>>,
    loader: Arc<dyn Fn() -> T + Send + Sync>,
    loaded: Arc<Mutex<bool>>,
}

impl<T: Clone + Send + 'static> LazyLoader<T> {
    pub fn new<F>(loader: F) -> Self 
    where
        F: Fn() -> T + Send + Sync + 'static,
    {
        Self {
            value: Arc::new(Mutex::new(None)),
            loader: Arc::new(loader),
            loaded: Arc::new(Mutex::new(false)),
        }
    }

    pub async fn get(&self) -> T {
        let mut loaded = self.loaded.lock().await;
        if !*loaded {
            let value = (self.loader)();
            *self.value.lock().await = Some(value);
            *loaded = true;
        }
        self.value.lock().await.clone().unwrap()
    }

    pub async fn invalidate(&self) {
        *self.loaded.lock().await = false;
        *self.value.lock().await = None;
    }
}

// ============================================
// Debouncer
// ============================================

pub struct Debouncer {
    last_call: Arc<Mutex<Option<Instant>>>,
    delay: Duration,
}

impl Debouncer {
    pub fn new(delay_ms: u64) -> Self {
        Self {
            last_call: Arc::new(Mutex::new(None)),
            delay: Duration::from_millis(delay_ms),
        }
    }

    pub async fn should_execute(&self) -> bool {
        let mut last = self.last_call.lock().await;
        let now = Instant::now();
        
        if let Some(last_time) = *last {
            if now.duration_since(last_time) < self.delay {
                return false;
            }
        }
        
        *last = Some(now);
        true
    }
}

// ============================================
// Throttler
// ============================================

pub struct Throttler {
    last_call: Arc<Mutex<Option<Instant>>>,
    interval: Duration,
}

impl Throttler {
    pub fn new(interval_ms: u64) -> Self {
        Self {
            last_call: Arc::new(Mutex::new(None)),
            interval: Duration::from_millis(interval_ms),
        }
    }

    pub async fn throttle<F, T>(&self, f: F) -> Option<T>
    where
        F: FnOnce() -> T,
    {
        let mut last = self.last_call.lock().await;
        let now = Instant::now();
        
        if let Some(last_time) = *last {
            if now.duration_since(last_time) < self.interval {
                return None;
            }
        }
        
        *last = Some(now);
        Some(f())
    }
}
