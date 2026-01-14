// Metrics Charts Component
// Progress charts and statistics

import { useDashboard, getPriorityColor } from '../../services/dashboardService';

interface MetricsChartsProps {
  className?: string;
}

export function MetricsCharts({ className = '' }: MetricsChartsProps) {
  const { metrics, currentProject, isLoading } = useDashboard();

  if (isLoading || !metrics || !currentProject) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 space-y-6 ${className}`}>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Tasks"
          value={metrics.total_tasks}
          icon="📋"
        />
        <StatCard
          label="Completed"
          value={metrics.completed_tasks}
          icon="✅"
          color="green"
        />
        <StatCard
          label="In Progress"
          value={metrics.in_progress_tasks}
          icon="🔄"
          color="blue"
        />
        <StatCard
          label="Overdue"
          value={metrics.overdue_tasks}
          icon="⚠️"
          color="red"
        />
      </div>

      {/* Progress Bar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Overall Progress
          </h3>
          <span className="text-2xl font-bold text-blue-600">
            {metrics.completion_percentage.toFixed(0)}%
          </span>
        </div>
        <div className="w-full h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all"
            style={{ width: `${metrics.completion_percentage}%` }}
          />
        </div>
      </div>

      {/* Tasks by Column */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
          Tasks by Status
        </h3>
        <div className="space-y-3">
          {currentProject.settings.board_columns.map((column) => {
            const count = metrics.tasks_by_column[column.id] || 0;
            const percentage = metrics.total_tasks > 0
              ? (count / metrics.total_tasks) * 100
              : 0;

            return (
              <div key={column.id}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: column.color }}
                    />
                    <span className="text-gray-700 dark:text-gray-300">
                      {column.name}
                    </span>
                  </div>
                  <span className="text-gray-500">{count}</span>
                </div>
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: column.color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tasks by Priority */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
          Tasks by Priority
        </h3>
        <div className="flex items-end justify-around h-32">
          {(['low', 'medium', 'high', 'urgent'] as const).map((priority) => {
            const count = metrics.tasks_by_priority[priority] || 0;
            const maxCount = Math.max(...Object.values(metrics.tasks_by_priority), 1);
            const height = (count / maxCount) * 100;

            return (
              <div key={priority} className="flex flex-col items-center gap-2">
                <div
                  className="w-12 rounded-t-lg transition-all"
                  style={{
                    height: `${Math.max(height, 4)}%`,
                    backgroundColor: getPriorityColor(priority),
                  }}
                />
                <span className="text-xs text-gray-500 capitalize">{priority}</span>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Velocity */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
          Velocity
        </h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {metrics.velocity.current_week}
            </div>
            <div className="text-xs text-gray-500">This Week</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {metrics.velocity.last_week}
            </div>
            <div className="text-xs text-gray-500">Last Week</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {metrics.velocity.average.toFixed(1)}
            </div>
            <div className="text-xs text-gray-500">Average</div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-center gap-2">
          <span className={`text-lg ${metrics.velocity.trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {metrics.velocity.trend >= 0 ? '📈' : '📉'}
          </span>
          <span className={`text-sm ${metrics.velocity.trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {metrics.velocity.trend >= 0 ? '+' : ''}{metrics.velocity.trend.toFixed(1)}% trend
          </span>
        </div>
      </div>

      {/* Burndown Chart (Simplified) */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
          Burndown
        </h3>
        <div className="h-40 flex items-end justify-between gap-2">
          {metrics.burndown.map((point, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col gap-1">
                <div
                  className="w-full bg-blue-500 rounded-t"
                  style={{
                    height: `${(point.remaining / (metrics.total_tasks || 1)) * 100}px`,
                  }}
                />
                <div
                  className="w-full bg-green-500 rounded-b"
                  style={{
                    height: `${(point.completed / (metrics.total_tasks || 1)) * 100}px`,
                  }}
                />
              </div>
              <span className="text-xs text-gray-500">
                {new Date(point.date * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-4 mt-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-500 rounded" />
            <span className="text-gray-500">Remaining</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500 rounded" />
            <span className="text-gray-500">Completed</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Stat Card
// ============================================

interface StatCardProps {
  label: string;
  value: number;
  icon: string;
  color?: 'default' | 'green' | 'blue' | 'red';
}

function StatCard({ label, value, icon, color = 'default' }: StatCardProps) {
  const colorClasses = {
    default: 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white',
    green: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    red: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  };

  return (
    <div className={`p-4 rounded-xl ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-sm opacity-80">{label}</span>
      </div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}

export default MetricsCharts;
