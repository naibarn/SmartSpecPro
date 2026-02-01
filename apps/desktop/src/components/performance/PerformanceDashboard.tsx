// Performance Dashboard Component
// Real-time system performance monitoring

import { useState } from 'react';
import {
  usePerformance,
  formatMB,
  formatPercent,
  getRecommendationIcon,
  getRecommendationColor,
} from '../../services/performanceService';

interface PerformanceDashboardProps {
  className?: string;
  dbPath?: string;
}

export function PerformanceDashboard({ className = '', dbPath }: PerformanceDashboardProps) {
  const {
    currentMetrics,
    metricsHistory,
    isCollecting,
    cacheStats,
    dbStats,
    recommendations,
    clearAllCaches,
    optimizeDb,
    autoRefresh,
    setAutoRefresh,
    refreshInterval,
    setRefreshInterval,
    refreshReport,
  } = usePerformance();

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<string | null>(null);

  const handleOptimize = async () => {
    if (!dbPath) return;
    setIsOptimizing(true);
    setOptimizeResult(null);
    try {
      const result = await optimizeDb(dbPath);
      setOptimizeResult(
        `Optimized! Size: ${result.before.toFixed(2)} MB → ${result.after.toFixed(2)} MB (${result.improvement_percent.toFixed(1)}% reduction) in ${result.duration_ms}ms`
      );
    } catch (error) {
      setOptimizeResult(`Error: ${error}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <div className={`flex flex-col h-full bg-gray-100 dark:bg-gray-900 overflow-y-auto ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Performance Monitor</h2>
          <p className="text-sm text-gray-500">System metrics and optimization</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Auto Refresh Toggle */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-gray-600 dark:text-gray-400">Auto-refresh</span>
          </label>
          
          {/* Refresh Interval */}
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
            disabled={!autoRefresh}
          >
            <option value={1000}>1s</option>
            <option value={5000}>5s</option>
            <option value={10000}>10s</option>
            <option value={30000}>30s</option>
          </select>

          {/* Manual Refresh */}
          <button
            onClick={refreshReport}
            disabled={isCollecting}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-400"
          >
            {isCollecting ? '⏳' : '🔄'} Refresh
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Memory */}
          <MetricCard
            title="Memory Usage"
            value={currentMetrics ? formatMB(currentMetrics.memory_used_mb) : '-'}
            subtitle={currentMetrics ? `of ${formatMB(currentMetrics.memory_total_mb)}` : ''}
            percent={currentMetrics?.memory_percent || 0}
            icon="💾"
            color="blue"
          />

          {/* CPU */}
          <MetricCard
            title="CPU Usage"
            value={currentMetrics ? formatPercent(currentMetrics.cpu_percent) : '-'}
            subtitle="Current load"
            percent={currentMetrics?.cpu_percent || 0}
            icon="⚡"
            color="yellow"
          />

          {/* Cache */}
          <MetricCard
            title="Cache Size"
            value={cacheStats ? formatMB(cacheStats.size_mb) : '-'}
            subtitle={cacheStats ? `${cacheStats.total_entries} entries` : ''}
            percent={cacheStats ? (cacheStats.size_mb / 100) * 100 : 0}
            icon="📦"
            color="green"
          />

          {/* Cache Hit Rate */}
          <MetricCard
            title="Cache Hit Rate"
            value={currentMetrics ? formatPercent(currentMetrics.cache_hit_rate * 100) : '-'}
            subtitle={cacheStats ? `${cacheStats.hit_count} hits / ${cacheStats.miss_count} misses` : ''}
            percent={(currentMetrics?.cache_hit_rate || 0) * 100}
            icon="🎯"
            color="purple"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Memory History Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Memory History</h3>
            <div className="h-48">
              <MiniChart
                data={metricsHistory.map(m => m.memory_percent)}
                color="#3B82F6"
                max={100}
              />
            </div>
          </div>

          {/* Cache History Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Cache Hit Rate History</h3>
            <div className="h-48">
              <MiniChart
                data={metricsHistory.map(m => m.cache_hit_rate * 100)}
                color="#10B981"
                max={100}
              />
            </div>
          </div>
        </div>

        {/* Database Stats */}
        {dbStats && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">Database Statistics</h3>
              <button
                onClick={handleOptimize}
                disabled={isOptimizing || !dbPath}
                className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-green-400"
              >
                {isOptimizing ? '⏳ Optimizing...' : '🔧 Optimize'}
              </button>
            </div>
            
            {optimizeResult && (
              <div className={`mb-4 p-3 rounded text-sm ${
                optimizeResult.startsWith('Error') 
                  ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                  : 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300'
              }`}>
                {optimizeResult}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatItem label="Size" value={formatMB(dbStats.total_size_mb)} />
              <StatItem label="Tables" value={dbStats.table_count.toString()} />
              <StatItem label="Indexes" value={dbStats.index_count.toString()} />
              <StatItem label="Fragmentation" value={formatPercent(dbStats.fragmentation_percent)} />
            </div>
          </div>
        )}

        {/* Cache Management */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">Cache Management</h3>
            <button
              onClick={clearAllCaches}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
            >
              🗑 Clear All Caches
            </button>
          </div>
          
          {cacheStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatItem label="Entries" value={cacheStats.total_entries.toString()} />
              <StatItem label="Size" value={formatMB(cacheStats.size_mb)} />
              <StatItem label="Evictions" value={cacheStats.eviction_count.toString()} />
              <StatItem label="Oldest Entry" value={`${cacheStats.oldest_entry_age_secs}s`} />
            </div>
          )}
        </div>

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Recommendations</h3>
            <div className="space-y-3">
              {recommendations.map((rec, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg border-l-4 border-${getRecommendationColor(rec.level)}-500 bg-${getRecommendationColor(rec.level)}-50 dark:bg-${getRecommendationColor(rec.level)}-900/20`}
                >
                  <div className="flex items-start gap-2">
                    <span>{getRecommendationIcon(rec.level)}</span>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {rec.category}: {rec.message}
                      </div>
                      {rec.action && (
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          💡 {rec.action}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Metric Card Component
function MetricCard({
  title,
  value,
  subtitle,
  percent,
  icon,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  percent: number;
  icon: string;
  color: 'blue' | 'yellow' | 'green' | 'purple' | 'red';
}) {
  const colorClasses = {
    blue: 'bg-blue-500',
    yellow: 'bg-yellow-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    red: 'bg-red-500',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-sm text-gray-500">{title}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      <div className="text-sm text-gray-500 mb-3">{subtitle}</div>
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClasses[color]} rounded-full transition-all`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  );
}

// Stat Item Component
function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-lg font-semibold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

// Mini Chart Component (Simple SVG line chart)
function MiniChart({
  data,
  color,
  max,
}: {
  data: number[];
  color: string;
  max: number;
}) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Collecting data...
      </div>
    );
  }

  const width = 100;
  const height = 100;
  const padding = 5;
  
  const points = data.map((value, i) => {
    const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
    const y = height - padding - (value / max) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `${padding},${height - padding} ${points} ${width - padding},${height - padding}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
      {/* Grid lines */}
      {[0, 25, 50, 75, 100].map((percent) => (
        <line
          key={percent}
          x1={padding}
          y1={height - padding - (percent / 100) * (height - 2 * padding)}
          x2={width - padding}
          y2={height - padding - (percent / 100) * (height - 2 * padding)}
          stroke="currentColor"
          strokeOpacity={0.1}
          strokeWidth={0.5}
        />
      ))}
      
      {/* Area fill */}
      <polygon
        points={areaPoints}
        fill={color}
        fillOpacity={0.1}
      />
      
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Current value dot */}
      {data.length > 0 && (
        <circle
          cx={width - padding}
          cy={height - padding - (data[data.length - 1] / max) * (height - 2 * padding)}
          r={3}
          fill={color}
        />
      )}
    </svg>
  );
}

export default PerformanceDashboard;
