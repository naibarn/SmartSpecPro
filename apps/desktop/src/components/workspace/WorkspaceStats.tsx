// Workspace Stats Component
// Displays workspace statistics and info

import { useState, useEffect } from 'react';
import { 
  useWorkspace, 
  getWorkspaceStats, 
  WorkspaceDbStats,
  formatBytes,
  formatDate
} from '../../services/workspaceService';

interface WorkspaceStatsProps {
  className?: string;
}

export function WorkspaceStats({ className = '' }: WorkspaceStatsProps) {
  const { currentWorkspace } = useWorkspace();
  const [stats, setStats] = useState<WorkspaceDbStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentWorkspace) {
      setStats(null);
      return;
    }

    const loadStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getWorkspaceStats(currentWorkspace.id);
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load stats');
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [currentWorkspace?.id]);

  if (!currentWorkspace) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 ${className}`}>
        <p className="text-gray-500 dark:text-gray-400 text-center">No workspace selected</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-800 p-6 ${className}`}>
        <p className="text-red-500 text-center">{error}</p>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{currentWorkspace.name}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Last accessed: {formatDate(currentWorkspace.last_accessed_at)}</p>
          </div>
          {currentWorkspace.git_remote && (
            <a href={currentWorkspace.git_remote} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </a>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Jobs" value={stats.job_count} icon={<JobIcon />} color="blue" />
            <StatCard label="Tasks" value={stats.task_count} icon={<TaskIcon />} color="green" />
            <StatCard label="Chat Sessions" value={stats.chat_session_count} icon={<ChatIcon />} color="purple" />
            <StatCard label="Knowledge Items" value={stats.knowledge_count} icon={<KnowledgeIcon />} color="orange" />
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard label="Short Memory" value={stats.memory_short_count} icon={<MemoryIcon />} color="cyan" small />
            <StatCard label="Long Memory" value={stats.memory_long_count} icon={<MemoryIcon />} color="indigo" small />
            <StatCard label="Database Size" value={formatBytes(stats.db_size_bytes)} icon={<DatabaseIcon />} color="gray" small isText />
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Total Tokens Used</span>
              <span className="font-medium text-gray-900 dark:text-white">{stats.total_tokens_used.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Stat Card Component
interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  small?: boolean;
  isText?: boolean;
}

function StatCard({ label, value, icon, color, small = false, isText = false }: StatCardProps) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
    cyan: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400',
    indigo: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400',
    gray: 'bg-gray-50 dark:bg-gray-900/20 text-gray-600 dark:text-gray-400',
  };

  return (
    <div className={`rounded-lg p-3 ${colorClasses[color]}`}>
      <div className="flex items-center gap-2">
        <div className={small ? 'w-4 h-4' : 'w-5 h-5'}>{icon}</div>
        <span className={`font-medium ${small ? 'text-xs' : 'text-sm'}`}>{label}</span>
      </div>
      <div className={`mt-1 font-bold ${small ? 'text-lg' : 'text-2xl'}`}>
        {isText ? value : typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

// Icons
function JobIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function TaskIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function KnowledgeIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function MemoryIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  );
}

export default WorkspaceStats;
