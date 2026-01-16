// Performance Service - Frontend service for Performance Monitoring
//
// Provides:
// - System metrics collection
// - Cache management
// - Database optimization
// - Performance monitoring hooks

import { invoke } from '@tauri-apps/api/core';
import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';

// ============================================
// Types
// ============================================

export interface SystemMetrics {
  timestamp: number;
  memory_used_mb: number;
  memory_total_mb: number;
  memory_percent: number;
  cpu_percent: number;
  db_connections: number;
  cache_size_mb: number;
  cache_hit_rate: number;
}

export interface PerformanceReport {
  current: SystemMetrics;
  history: SystemMetrics[];
  recommendations: Recommendation[];
  db_stats: DatabaseStats;
  cache_stats: CacheStats;
}

export interface Recommendation {
  level: 'Info' | 'Warning' | 'Critical';
  category: string;
  message: string;
  action?: string;
}

export interface DatabaseStats {
  total_size_mb: number;
  table_count: number;
  index_count: number;
  fragmentation_percent: number;
  last_vacuum?: number;
  query_cache_hits: number;
  query_cache_misses: number;
}

export interface CacheStats {
  total_entries: number;
  size_mb: number;
  hit_count: number;
  miss_count: number;
  eviction_count: number;
  oldest_entry_age_secs: number;
}

export interface OptimizationResult {
  action: string;
  success: boolean;
  before: number;
  after: number;
  improvement_percent: number;
  duration_ms: number;
}

// ============================================
// API Functions
// ============================================

export async function collectMetrics(): Promise<SystemMetrics> {
  return invoke('perf_collect_metrics');
}

export async function getPerformanceReport(dbPath?: string): Promise<PerformanceReport> {
  return invoke('perf_get_report', { dbPath });
}

// Cache APIs
export async function cacheQuery(key: string, result: string): Promise<void> {
  return invoke('perf_cache_query', { key, result });
}

export async function getCachedQuery(key: string): Promise<string | null> {
  return invoke('perf_get_cached_query', { key });
}

export async function cacheData(key: string, data: Uint8Array): Promise<void> {
  return invoke('perf_cache_data', { key, data: Array.from(data) });
}

export async function getCachedData(key: string): Promise<Uint8Array | null> {
  const result = await invoke<number[] | null>('perf_get_cached_data', { key });
  return result ? new Uint8Array(result) : null;
}

export async function clearCaches(): Promise<void> {
  return invoke('perf_clear_caches');
}

export async function getCacheStats(): Promise<CacheStats> {
  return invoke('perf_get_cache_stats');
}

// Database APIs
export async function optimizeDatabase(dbPath: string): Promise<OptimizationResult> {
  return invoke('perf_optimize_database', { dbPath });
}

export async function getDatabaseStats(dbPath: string): Promise<DatabaseStats> {
  return invoke('perf_get_database_stats', { dbPath });
}

// ============================================
// Performance Context
// ============================================

interface PerformanceContextValue {
  // Metrics
  currentMetrics: SystemMetrics | null;
  metricsHistory: SystemMetrics[];
  isCollecting: boolean;
  
  // Report
  report: PerformanceReport | null;
  refreshReport: () => Promise<void>;
  
  // Cache
  cacheStats: CacheStats | null;
  clearAllCaches: () => Promise<void>;
  
  // Database
  dbStats: DatabaseStats | null;
  optimizeDb: (dbPath: string) => Promise<OptimizationResult>;
  
  // Recommendations
  recommendations: Recommendation[];
  
  // Settings
  autoRefresh: boolean;
  setAutoRefresh: (enabled: boolean) => void;
  refreshInterval: number;
  setRefreshInterval: (ms: number) => void;
}

const PerformanceContext = createContext<PerformanceContextValue | null>(null);

export function PerformanceProvider({ 
  children,
  dbPath,
}: { 
  children: ReactNode;
  dbPath?: string;
}) {
  const [currentMetrics, setCurrentMetrics] = useState<SystemMetrics | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<SystemMetrics[]>([]);
  const [isCollecting, setIsCollecting] = useState(false);
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);
  
  const intervalRef = useRef<number | null>(null);

  // Collect metrics
  const collectAndUpdate = useCallback(async () => {
    setIsCollecting(true);
    try {
      const metrics = await collectMetrics();
      setCurrentMetrics(metrics);
      setMetricsHistory(prev => {
        const updated = [...prev, metrics];
        return updated.slice(-100); // Keep last 100
      });
    } catch (error) {
      console.error('Failed to collect metrics:', error);
    } finally {
      setIsCollecting(false);
    }
  }, []);

  // Refresh full report
  const refreshReport = useCallback(async () => {
    try {
      const newReport = await getPerformanceReport(dbPath);
      setReport(newReport);
      setCurrentMetrics(newReport.current);
      setMetricsHistory(newReport.history);
      setCacheStats(newReport.cache_stats);
      setDbStats(newReport.db_stats);
      setRecommendations(newReport.recommendations);
    } catch (error) {
      console.error('Failed to get performance report:', error);
    }
  }, [dbPath]);

  // Clear caches
  const clearAllCaches = useCallback(async () => {
    await clearCaches();
    const stats = await getCacheStats();
    setCacheStats(stats);
  }, []);

  // Optimize database
  const optimizeDb = useCallback(async (path: string): Promise<OptimizationResult> => {
    const result = await optimizeDatabase(path);
    // Refresh stats after optimization
    const stats = await getDatabaseStats(path);
    setDbStats(stats);
    return result;
  }, []);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = window.setInterval(collectAndUpdate, refreshInterval);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, refreshInterval, collectAndUpdate]);

  // Initial load
  useEffect(() => {
    refreshReport();
  }, [refreshReport]);

  const value: PerformanceContextValue = {
    currentMetrics,
    metricsHistory,
    isCollecting,
    report,
    refreshReport,
    cacheStats,
    clearAllCaches,
    dbStats,
    optimizeDb,
    recommendations,
    autoRefresh,
    setAutoRefresh,
    refreshInterval,
    setRefreshInterval,
  };

  return (
    <PerformanceContext.Provider value={value}>
      {children}
    </PerformanceContext.Provider>
  );
}

export function usePerformance() {
  const context = useContext(PerformanceContext);
  if (!context) {
    throw new Error('usePerformance must be used within a PerformanceProvider');
  }
  return context;
}

// ============================================
// Utility Hooks
// ============================================

// Debounce hook
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Throttle hook
export function useThrottle<T>(value: T, interval: number): T {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastUpdated = useRef(Date.now());

  useEffect(() => {
    const now = Date.now();
    if (now - lastUpdated.current >= interval) {
      lastUpdated.current = now;
      setThrottledValue(value);
    } else {
      const timer = setTimeout(() => {
        lastUpdated.current = Date.now();
        setThrottledValue(value);
      }, interval - (now - lastUpdated.current));
      return () => clearTimeout(timer);
    }
  }, [value, interval]);

  return throttledValue;
}

// Lazy load hook
export function useLazyLoad<T>(loader: () => Promise<T>, deps: unknown[] = []): {
  data: T | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loader();
      setData(result);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}

// ============================================
// Utility Functions
// ============================================

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatMB(mb: number): string {
  if (mb < 1) return `${(mb * 1024).toFixed(0)} KB`;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function getRecommendationColor(level: Recommendation['level']): string {
  switch (level) {
    case 'Critical':
      return 'red';
    case 'Warning':
      return 'yellow';
    default:
      return 'blue';
  }
}

export function getRecommendationIcon(level: Recommendation['level']): string {
  switch (level) {
    case 'Critical':
      return '🚨';
    case 'Warning':
      return '⚠️';
    default:
      return 'ℹ️';
  }
}
