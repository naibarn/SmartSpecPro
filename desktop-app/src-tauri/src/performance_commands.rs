// Performance Commands - Tauri IPC Commands for Performance Monitoring
//
// Provides commands for:
// - System metrics collection
// - Cache management
// - Database optimization
// - Performance reports

use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::performance::{
    PerformanceMonitor, SystemMetrics, PerformanceReport,
    CacheStats, DatabaseStats, OptimizationResult,
};

// ============================================
// State Types
// ============================================

pub struct PerformanceState {
    pub monitor: Arc<PerformanceMonitor>,
}

impl PerformanceState {
    pub fn new() -> Self {
        Self {
            monitor: Arc::new(PerformanceMonitor::new()),
        }
    }
}

// ============================================
// Metrics Commands
// ============================================

#[tauri::command]
pub async fn perf_collect_metrics(
    state: State<'_, Arc<Mutex<PerformanceState>>>,
) -> Result<SystemMetrics, String> {
    let state = state.lock().await;
    Ok(state.monitor.collect_metrics().await)
}

#[tauri::command]
pub async fn perf_get_report(
    state: State<'_, Arc<Mutex<PerformanceState>>>,
    db_path: Option<String>,
) -> Result<PerformanceReport, String> {
    let state = state.lock().await;
    state.monitor.generate_report(db_path.as_deref()).await
}

// ============================================
// Cache Commands
// ============================================

#[tauri::command]
pub async fn perf_cache_query(
    state: State<'_, Arc<Mutex<PerformanceState>>>,
    key: String,
    result: String,
) -> Result<(), String> {
    let state = state.lock().await;
    state.monitor.cache_query(&key, &result).await;
    Ok(())
}

#[tauri::command]
pub async fn perf_get_cached_query(
    state: State<'_, Arc<Mutex<PerformanceState>>>,
    key: String,
) -> Result<Option<String>, String> {
    let state = state.lock().await;
    Ok(state.monitor.get_cached_query(&key).await)
}

#[tauri::command]
pub async fn perf_cache_data(
    state: State<'_, Arc<Mutex<PerformanceState>>>,
    key: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let state = state.lock().await;
    state.monitor.cache_data(&key, data).await;
    Ok(())
}

#[tauri::command]
pub async fn perf_get_cached_data(
    state: State<'_, Arc<Mutex<PerformanceState>>>,
    key: String,
) -> Result<Option<Vec<u8>>, String> {
    let state = state.lock().await;
    Ok(state.monitor.get_cached_data(&key).await)
}

#[tauri::command]
pub async fn perf_clear_caches(
    state: State<'_, Arc<Mutex<PerformanceState>>>,
) -> Result<(), String> {
    let state = state.lock().await;
    state.monitor.clear_caches().await;
    Ok(())
}

#[tauri::command]
pub async fn perf_get_cache_stats(
    state: State<'_, Arc<Mutex<PerformanceState>>>,
) -> Result<CacheStats, String> {
    let state = state.lock().await;
    Ok(state.monitor.get_cache_stats().await)
}

// ============================================
// Database Commands
// ============================================

#[tauri::command]
pub async fn perf_optimize_database(
    state: State<'_, Arc<Mutex<PerformanceState>>>,
    db_path: String,
) -> Result<OptimizationResult, String> {
    let state = state.lock().await;
    state.monitor.optimize_database(&db_path).await
}

#[tauri::command]
pub async fn perf_get_database_stats(
    state: State<'_, Arc<Mutex<PerformanceState>>>,
    db_path: String,
) -> Result<DatabaseStats, String> {
    let state = state.lock().await;
    state.monitor.get_database_stats(&db_path).await
}
