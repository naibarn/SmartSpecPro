// Memory Monitor Module
//
// RISK-005 FIX: Monitor memory usage and cleanup when needed
//
// Provides:
// - Memory usage tracking
// - Automatic cleanup when threshold exceeded
// - Memory leak detection
// - Performance metrics

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

// ============================================
// Configuration
// ============================================

const DEFAULT_WARNING_THRESHOLD_MB: u64 = 512;
const DEFAULT_CRITICAL_THRESHOLD_MB: u64 = 1024;
const SAMPLE_INTERVAL_SECS: u64 = 30;
const MAX_SAMPLES: usize = 120; // 1 hour of samples at 30s intervals

// ============================================
// Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryStats {
    pub used_mb: u64,
    pub available_mb: u64,
    pub total_mb: u64,
    pub usage_percent: f64,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryTrend {
    pub current_mb: u64,
    pub average_mb: f64,
    pub min_mb: u64,
    pub max_mb: u64,
    pub trend: String, // "increasing", "decreasing", "stable"
    pub samples_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryAlert {
    pub level: String, // "warning", "critical"
    pub message: String,
    pub current_mb: u64,
    pub threshold_mb: u64,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryReport {
    pub stats: MemoryStats,
    pub trend: MemoryTrend,
    pub alerts: Vec<MemoryAlert>,
    pub cleanup_recommended: bool,
}

// ============================================
// Memory Monitor
// ============================================

pub struct MemoryMonitor {
    samples: Mutex<VecDeque<MemoryStats>>,
    warning_threshold_mb: AtomicU64,
    critical_threshold_mb: AtomicU64,
    monitoring_active: AtomicBool,
    last_cleanup: Mutex<Option<Instant>>,
    cleanup_callbacks: Mutex<Vec<Box<dyn Fn() + Send + Sync>>>,
}

impl MemoryMonitor {
    pub fn new() -> Self {
        Self {
            samples: Mutex::new(VecDeque::with_capacity(MAX_SAMPLES)),
            warning_threshold_mb: AtomicU64::new(DEFAULT_WARNING_THRESHOLD_MB),
            critical_threshold_mb: AtomicU64::new(DEFAULT_CRITICAL_THRESHOLD_MB),
            monitoring_active: AtomicBool::new(false),
            last_cleanup: Mutex::new(None),
            cleanup_callbacks: Mutex::new(Vec::new()),
        }
    }
    
    /// Set warning threshold in MB
    pub fn set_warning_threshold(&self, mb: u64) {
        self.warning_threshold_mb.store(mb, Ordering::SeqCst);
    }
    
    /// Set critical threshold in MB
    pub fn set_critical_threshold(&self, mb: u64) {
        self.critical_threshold_mb.store(mb, Ordering::SeqCst);
    }
    
    /// Register a cleanup callback
    pub fn register_cleanup_callback<F>(&self, callback: F)
    where
        F: Fn() + Send + Sync + 'static,
    {
        let mut callbacks = self.cleanup_callbacks.lock().unwrap();
        callbacks.push(Box::new(callback));
    }
    
    /// Get current memory stats
    pub fn get_current_stats(&self) -> MemoryStats {
        let (used, available, total) = self.get_system_memory();
        let usage_percent = if total > 0 {
            (used as f64 / total as f64) * 100.0
        } else {
            0.0
        };
        
        MemoryStats {
            used_mb: used / (1024 * 1024),
            available_mb: available / (1024 * 1024),
            total_mb: total / (1024 * 1024),
            usage_percent,
            timestamp: chrono::Utc::now().timestamp(),
        }
    }
    
    /// Record a memory sample
    pub fn record_sample(&self) {
        let stats = self.get_current_stats();
        let mut samples = self.samples.lock().unwrap();
        
        if samples.len() >= MAX_SAMPLES {
            samples.pop_front();
        }
        samples.push_back(stats);
    }
    
    /// Get memory trend analysis
    pub fn get_trend(&self) -> MemoryTrend {
        let samples = self.samples.lock().unwrap();
        
        if samples.is_empty() {
            let current = self.get_current_stats();
            return MemoryTrend {
                current_mb: current.used_mb,
                average_mb: current.used_mb as f64,
                min_mb: current.used_mb,
                max_mb: current.used_mb,
                trend: "stable".to_string(),
                samples_count: 0,
            };
        }
        
        let current = samples.back().map(|s| s.used_mb).unwrap_or(0);
        let sum: u64 = samples.iter().map(|s| s.used_mb).sum();
        let average = sum as f64 / samples.len() as f64;
        let min = samples.iter().map(|s| s.used_mb).min().unwrap_or(0);
        let max = samples.iter().map(|s| s.used_mb).max().unwrap_or(0);
        
        // Calculate trend from last 10 samples
        let trend = if samples.len() >= 10 {
            let recent: Vec<u64> = samples.iter().rev().take(10).map(|s| s.used_mb).collect();
            let first_half_avg: f64 = recent[5..].iter().sum::<u64>() as f64 / 5.0;
            let second_half_avg: f64 = recent[..5].iter().sum::<u64>() as f64 / 5.0;
            
            let diff_percent = ((second_half_avg - first_half_avg) / first_half_avg) * 100.0;
            
            if diff_percent > 10.0 {
                "increasing".to_string()
            } else if diff_percent < -10.0 {
                "decreasing".to_string()
            } else {
                "stable".to_string()
            }
        } else {
            "stable".to_string()
        };
        
        MemoryTrend {
            current_mb: current,
            average_mb: average,
            min_mb: min,
            max_mb: max,
            trend,
            samples_count: samples.len(),
        }
    }
    
    /// Check for memory alerts
    pub fn check_alerts(&self) -> Vec<MemoryAlert> {
        let stats = self.get_current_stats();
        let warning_threshold = self.warning_threshold_mb.load(Ordering::SeqCst);
        let critical_threshold = self.critical_threshold_mb.load(Ordering::SeqCst);
        
        let mut alerts = Vec::new();
        
        if stats.used_mb >= critical_threshold {
            alerts.push(MemoryAlert {
                level: "critical".to_string(),
                message: format!(
                    "Memory usage critical: {}MB exceeds {}MB threshold",
                    stats.used_mb, critical_threshold
                ),
                current_mb: stats.used_mb,
                threshold_mb: critical_threshold,
                timestamp: stats.timestamp,
            });
        } else if stats.used_mb >= warning_threshold {
            alerts.push(MemoryAlert {
                level: "warning".to_string(),
                message: format!(
                    "Memory usage warning: {}MB exceeds {}MB threshold",
                    stats.used_mb, warning_threshold
                ),
                current_mb: stats.used_mb,
                threshold_mb: warning_threshold,
                timestamp: stats.timestamp,
            });
        }
        
        // Check for potential memory leak (continuous increase)
        let trend = self.get_trend();
        if trend.trend == "increasing" && trend.samples_count >= 20 {
            alerts.push(MemoryAlert {
                level: "warning".to_string(),
                message: "Potential memory leak detected: memory usage continuously increasing".to_string(),
                current_mb: stats.used_mb,
                threshold_mb: warning_threshold,
                timestamp: stats.timestamp,
            });
        }
        
        alerts
    }
    
    /// Get full memory report
    pub fn get_report(&self) -> MemoryReport {
        let stats = self.get_current_stats();
        let trend = self.get_trend();
        let alerts = self.check_alerts();
        
        let critical_threshold = self.critical_threshold_mb.load(Ordering::SeqCst);
        let cleanup_recommended = stats.used_mb >= critical_threshold * 80 / 100;
        
        MemoryReport {
            stats,
            trend,
            alerts,
            cleanup_recommended,
        }
    }
    
    /// Trigger cleanup if needed
    pub fn trigger_cleanup_if_needed(&self) -> bool {
        let stats = self.get_current_stats();
        let critical_threshold = self.critical_threshold_mb.load(Ordering::SeqCst);
        
        if stats.used_mb >= critical_threshold {
            // Check if we cleaned up recently (within 5 minutes)
            let mut last_cleanup = self.last_cleanup.lock().unwrap();
            if let Some(last) = *last_cleanup {
                if last.elapsed() < Duration::from_secs(300) {
                    return false;
                }
            }
            
            // Run cleanup callbacks
            let callbacks = self.cleanup_callbacks.lock().unwrap();
            for callback in callbacks.iter() {
                callback();
            }
            
            *last_cleanup = Some(Instant::now());
            
            // Force garbage collection hint
            // Note: Rust doesn't have explicit GC, but we can drop unused allocations
            
            true
        } else {
            false
        }
    }
    
    /// Get system memory info (platform-specific)
    #[cfg(target_os = "linux")]
    fn get_system_memory(&self) -> (u64, u64, u64) {
        use std::fs;
        
        if let Ok(meminfo) = fs::read_to_string("/proc/meminfo") {
            let mut total: u64 = 0;
            let mut available: u64 = 0;
            
            for line in meminfo.lines() {
                if line.starts_with("MemTotal:") {
                    total = Self::parse_meminfo_value(line);
                } else if line.starts_with("MemAvailable:") {
                    available = Self::parse_meminfo_value(line);
                }
            }
            
            let used = total.saturating_sub(available);
            return (used, available, total);
        }
        
        (0, 0, 0)
    }
    
    #[cfg(target_os = "macos")]
    fn get_system_memory(&self) -> (u64, u64, u64) {
        use std::process::Command;
        
        // Get total memory
        let total = Command::new("sysctl")
            .args(["-n", "hw.memsize"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .and_then(|s| s.trim().parse::<u64>().ok())
            .unwrap_or(0);
        
        // Get page size and free pages
        let vm_stat = Command::new("vm_stat")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .unwrap_or_default();
        
        let page_size: u64 = 4096; // Default page size
        let mut free_pages: u64 = 0;
        let mut inactive_pages: u64 = 0;
        
        for line in vm_stat.lines() {
            if line.contains("Pages free:") {
                free_pages = Self::parse_vm_stat_value(line);
            } else if line.contains("Pages inactive:") {
                inactive_pages = Self::parse_vm_stat_value(line);
            }
        }
        
        let available = (free_pages + inactive_pages) * page_size;
        let used = total.saturating_sub(available);
        
        (used, available, total)
    }
    
    #[cfg(target_os = "windows")]
    fn get_system_memory(&self) -> (u64, u64, u64) {
        use std::mem;
        use winapi::um::sysinfoapi::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
        
        unsafe {
            let mut mem_info: MEMORYSTATUSEX = mem::zeroed();
            mem_info.dwLength = mem::size_of::<MEMORYSTATUSEX>() as u32;
            
            if GlobalMemoryStatusEx(&mut mem_info) != 0 {
                let total = mem_info.ullTotalPhys;
                let available = mem_info.ullAvailPhys;
                let used = total - available;
                return (used, available, total);
            }
        }
        
        (0, 0, 0)
    }
    
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    fn get_system_memory(&self) -> (u64, u64, u64) {
        (0, 0, 0)
    }
    
    #[cfg(target_os = "linux")]
    fn parse_meminfo_value(line: &str) -> u64 {
        line.split_whitespace()
            .nth(1)
            .and_then(|v| v.parse::<u64>().ok())
            .map(|v| v * 1024) // Convert from KB to bytes
            .unwrap_or(0)
    }
    
    #[cfg(target_os = "macos")]
    fn parse_vm_stat_value(line: &str) -> u64 {
        line.split(':')
            .nth(1)
            .and_then(|v| v.trim().trim_end_matches('.').parse::<u64>().ok())
            .unwrap_or(0)
    }
    
    /// Start background monitoring
    pub fn start_monitoring(self: Arc<Self>) {
        if self.monitoring_active.swap(true, Ordering::SeqCst) {
            return; // Already monitoring
        }
        
        let monitor = self.clone();
        std::thread::spawn(move || {
            while monitor.monitoring_active.load(Ordering::SeqCst) {
                monitor.record_sample();
                monitor.trigger_cleanup_if_needed();
                std::thread::sleep(Duration::from_secs(SAMPLE_INTERVAL_SECS));
            }
        });
    }
    
    /// Stop background monitoring
    pub fn stop_monitoring(&self) {
        self.monitoring_active.store(false, Ordering::SeqCst);
    }
}

impl Default for MemoryMonitor {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================
// Global Instance
// ============================================

use once_cell::sync::Lazy;

static MEMORY_MONITOR: Lazy<Arc<MemoryMonitor>> = Lazy::new(|| Arc::new(MemoryMonitor::new()));

/// Get the global memory monitor instance
pub fn get_memory_monitor() -> Arc<MemoryMonitor> {
    MEMORY_MONITOR.clone()
}

/// Initialize and start memory monitoring
pub fn init_memory_monitoring() {
    let monitor = get_memory_monitor();
    monitor.start_monitoring();
}

// ============================================
// Tauri Commands
// ============================================

#[tauri::command]
pub fn get_memory_stats() -> MemoryStats {
    get_memory_monitor().get_current_stats()
}

#[tauri::command]
pub fn get_memory_report() -> MemoryReport {
    get_memory_monitor().get_report()
}

#[tauri::command]
pub fn get_memory_trend() -> MemoryTrend {
    get_memory_monitor().get_trend()
}

#[tauri::command]
pub fn set_memory_thresholds(warning_mb: u64, critical_mb: u64) {
    let monitor = get_memory_monitor();
    monitor.set_warning_threshold(warning_mb);
    monitor.set_critical_threshold(critical_mb);
}

#[tauri::command]
pub fn trigger_memory_cleanup() -> bool {
    get_memory_monitor().trigger_cleanup_if_needed()
}

// ============================================
// Tests
// ============================================

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_memory_monitor_creation() {
        let monitor = MemoryMonitor::new();
        let stats = monitor.get_current_stats();
        
        // Should return some values (may be 0 on some platforms)
        assert!(stats.timestamp > 0);
    }
    
    #[test]
    fn test_memory_trend() {
        let monitor = MemoryMonitor::new();
        
        // Record some samples
        for _ in 0..5 {
            monitor.record_sample();
        }
        
        let trend = monitor.get_trend();
        assert!(trend.samples_count <= 5);
    }
    
    #[test]
    fn test_threshold_setting() {
        let monitor = MemoryMonitor::new();
        
        monitor.set_warning_threshold(256);
        monitor.set_critical_threshold(512);
        
        assert_eq!(monitor.warning_threshold_mb.load(Ordering::SeqCst), 256);
        assert_eq!(monitor.critical_threshold_mb.load(Ordering::SeqCst), 512);
    }
}
