// ========================================
// Progress Dashboard Component
// ========================================
//
// This component displays real-time progress of the implementation loop,
// including phase progress, task status, and logs.

import React, { useState, useEffect, useRef } from 'react';

// ========================================
// Types
// ========================================

export interface TaskProgress {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number; // 0-100
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface PhaseProgress {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number; // 0-100
  tasks: TaskProgress[];
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
}

export interface DashboardState {
  projectName: string;
  specId: string;
  currentPhase: string;
  overallProgress: number;
  phases: PhaseProgress[];
  logs: LogEntry[];
  startedAt: string;
  estimatedCompletion?: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  coveragePercent?: number;
  testsTotal?: number;
  testsPassed?: number;
  testsFailed?: number;
}

export interface ProgressDashboardProps {
  state: DashboardState | null;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  onRetry?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

// ========================================
// Helper Functions
// ========================================

const formatDuration = (startTime: string): string => {
  const start = new Date(startTime);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
};

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'completed': return 'text-green-500';
    case 'in_progress': return 'text-blue-500';
    case 'failed': return 'text-red-500';
    case 'paused': return 'text-yellow-500';
    default: return 'text-gray-400';
  }
};

const getStatusIcon = (status: string): string => {
  switch (status) {
    case 'completed': return '✓';
    case 'in_progress': return '●';
    case 'failed': return '✗';
    case 'pending': return '○';
    default: return '○';
  }
};

const getLogLevelColor = (level: string): string => {
  switch (level) {
    case 'error': return 'text-red-400';
    case 'warn': return 'text-yellow-400';
    case 'info': return 'text-blue-400';
    case 'debug': return 'text-gray-400';
    default: return 'text-gray-300';
  }
};

// ========================================
// Sub-Components
// ========================================

const ProgressBar: React.FC<{ progress: number; status: string; size?: 'sm' | 'md' | 'lg' }> = ({ 
  progress, 
  status,
  size = 'md' 
}) => {
  const height = size === 'sm' ? 'h-1' : size === 'lg' ? 'h-4' : 'h-2';
  const bgColor = status === 'failed' ? 'bg-red-500' : 
                  status === 'completed' ? 'bg-green-500' : 
                  'bg-blue-500';
  
  return (
    <div className={`w-full bg-gray-700 rounded-full ${height} overflow-hidden`}>
      <div 
        className={`${bgColor} ${height} rounded-full transition-all duration-300 ease-out`}
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
};

const PhaseCard: React.FC<{ phase: PhaseProgress; isActive: boolean }> = ({ phase, isActive }) => {
  const [isExpanded, setIsExpanded] = useState(isActive);
  
  useEffect(() => {
    if (isActive) setIsExpanded(true);
  }, [isActive]);
  
  return (
    <div className={`border rounded-lg p-3 mb-2 transition-all ${
      isActive ? 'border-blue-500 bg-blue-500/10' : 
      phase.status === 'completed' ? 'border-green-500/50 bg-green-500/5' :
      phase.status === 'failed' ? 'border-red-500/50 bg-red-500/5' :
      'border-gray-600 bg-gray-800/50'
    }`}>
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className={`font-mono ${getStatusColor(phase.status)}`}>
            {getStatusIcon(phase.status)}
          </span>
          <span className="font-medium">{phase.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{Math.round(phase.progress)}%</span>
          <span className="text-gray-500">{isExpanded ? '▼' : '▶'}</span>
        </div>
      </div>
      
      <ProgressBar progress={phase.progress} status={phase.status} size="sm" />
      
      {isExpanded && phase.tasks.length > 0 && (
        <div className="mt-3 pl-4 border-l border-gray-600">
          {phase.tasks.map(task => (
            <div key={task.id} className="flex items-center gap-2 py-1 text-sm">
              <span className={`font-mono ${getStatusColor(task.status)}`}>
                {getStatusIcon(task.status)}
              </span>
              <span className={task.status === 'completed' ? 'text-gray-400 line-through' : ''}>
                {task.title}
              </span>
              {task.status === 'in_progress' && (
                <span className="text-blue-400 text-xs">({task.progress}%)</span>
              )}
              {task.error && (
                <span className="text-red-400 text-xs ml-2">Error: {task.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const LogViewer: React.FC<{ logs: LogEntry[]; maxHeight?: string }> = ({ 
  logs, 
  maxHeight = '200px' 
}) => {
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);
  
  return (
    <div 
      className="bg-gray-900 rounded-lg p-3 font-mono text-xs overflow-y-auto"
      style={{ maxHeight }}
    >
      {logs.length === 0 ? (
        <div className="text-gray-500 italic">No logs yet...</div>
      ) : (
        logs.map((log, index) => (
          <div key={index} className="flex gap-2 py-0.5">
            <span className="text-gray-500 shrink-0">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            <span className={`shrink-0 uppercase ${getLogLevelColor(log.level)}`}>
              [{log.level}]
            </span>
            {log.source && (
              <span className="text-purple-400 shrink-0">[{log.source}]</span>
            )}
            <span className="text-gray-300">{log.message}</span>
          </div>
        ))
      )}
      <div ref={logsEndRef} />
    </div>
  );
};

const StatsCard: React.FC<{ 
  label: string; 
  value: string | number; 
  subValue?: string;
  color?: string;
}> = ({ label, value, subValue, color = 'text-white' }) => (
  <div className="bg-gray-800 rounded-lg p-3 text-center">
    <div className={`text-2xl font-bold ${color}`}>{value}</div>
    <div className="text-xs text-gray-400">{label}</div>
    {subValue && <div className="text-xs text-gray-500 mt-1">{subValue}</div>}
  </div>
);

// ========================================
// Main Component
// ========================================

export const ProgressDashboard: React.FC<ProgressDashboardProps> = ({
  state,
  onPause,
  onResume,
  onStop,
  onRetry,
  isExpanded = true,
  onToggleExpand,
}) => {
  const [showLogs, setShowLogs] = useState(true);
  const [elapsedTime, setElapsedTime] = useState('0s');
  
  // Update elapsed time every second
  useEffect(() => {
    if (!state?.startedAt || state.status !== 'running') return;
    
    const interval = setInterval(() => {
      setElapsedTime(formatDuration(state.startedAt));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [state?.startedAt, state?.status]);
  
  if (!state) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 text-center text-gray-400">
        <div className="text-4xl mb-2">📊</div>
        <div>No active workflow</div>
        <div className="text-sm mt-1">Start a workflow to see progress here</div>
      </div>
    );
  }
  
  const activePhase = state.phases.find(p => p.status === 'in_progress');
  
  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">📊</span>
          <div>
            <div className="font-medium">{state.projectName}</div>
            <div className="text-xs text-gray-400">Spec: {state.specId}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            state.status === 'running' ? 'bg-blue-500/20 text-blue-400' :
            state.status === 'completed' ? 'bg-green-500/20 text-green-400' :
            state.status === 'failed' ? 'bg-red-500/20 text-red-400' :
            state.status === 'paused' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-gray-600 text-gray-400'
          }`}>
            {state.status.toUpperCase()}
          </span>
          {onToggleExpand && (
            <button 
              onClick={onToggleExpand}
              className="p-1 hover:bg-gray-600 rounded"
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-4">
          {/* Overall Progress */}
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1">
              <span>Overall Progress</span>
              <span className="font-medium">{Math.round(state.overallProgress)}%</span>
            </div>
            <ProgressBar progress={state.overallProgress} status={state.status} size="lg" />
          </div>
          
          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <StatsCard 
              label="Elapsed Time" 
              value={elapsedTime}
            />
            <StatsCard 
              label="Current Phase" 
              value={state.currentPhase}
              color="text-blue-400"
            />
            <StatsCard 
              label="Coverage" 
              value={state.coveragePercent !== undefined ? `${state.coveragePercent}%` : '-'}
              color={state.coveragePercent && state.coveragePercent >= 80 ? 'text-green-400' : 'text-yellow-400'}
            />
            <StatsCard 
              label="Tests" 
              value={state.testsTotal !== undefined ? 
                `${state.testsPassed || 0}/${state.testsTotal}` : '-'}
              subValue={state.testsFailed ? `${state.testsFailed} failed` : undefined}
              color={state.testsFailed && state.testsFailed > 0 ? 'text-red-400' : 'text-green-400'}
            />
          </div>
          
          {/* Phases */}
          <div className="mb-4">
            <div className="text-sm font-medium mb-2">Phases</div>
            {state.phases.map(phase => (
              <PhaseCard 
                key={phase.id} 
                phase={phase} 
                isActive={phase.id === activePhase?.id}
              />
            ))}
          </div>
          
          {/* Logs */}
          <div>
            <div 
              className="text-sm font-medium mb-2 flex items-center justify-between cursor-pointer"
              onClick={() => setShowLogs(!showLogs)}
            >
              <span>Logs</span>
              <span className="text-gray-500">{showLogs ? '▼' : '▶'}</span>
            </div>
            {showLogs && <LogViewer logs={state.logs} />}
          </div>
          
          {/* Actions */}
          <div className="flex gap-2 mt-4 pt-4 border-t border-gray-700">
            {state.status === 'running' && onPause && (
              <button 
                onClick={onPause}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded text-sm"
              >
                ⏸ Pause
              </button>
            )}
            {state.status === 'paused' && onResume && (
              <button 
                onClick={onResume}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-sm"
              >
                ▶ Resume
              </button>
            )}
            {(state.status === 'running' || state.status === 'paused') && onStop && (
              <button 
                onClick={onStop}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm"
              >
                ⏹ Stop
              </button>
            )}
            {state.status === 'failed' && onRetry && (
              <button 
                onClick={onRetry}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
              >
                🔄 Retry
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProgressDashboard;
