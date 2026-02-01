import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Loader2, Clock, CheckCircle, XCircle, AlertCircle, RefreshCw, Trash2 } from 'lucide-react';
import { useToast } from '../common/Toast';
import { getTaskStatus, cancelTask, TaskStatus } from '../../services/mediaService';

interface MonitoredTask {
  task: TaskStatus;
  startTime: Date;
  lastUpdate: Date;
  elapsedTime: number;
}

export const TaskMonitorPanel: React.FC = () => {
  const toast = useToast();
  const [monitoredTasks, setMonitoredTasks] = useState<Map<string, MonitoredTask>>(new Map());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load tasks from localStorage on mount
  useEffect(() => {
    const savedTaskIds = localStorage.getItem('monitoredTasks');
    if (savedTaskIds) {
      const taskIds = JSON.parse(savedTaskIds) as string[];
      taskIds.forEach(taskId => addTaskToMonitor(taskId));
    }
  }, []);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refreshAllTasks();
    }, 5000);

    return () => clearInterval(interval);
  }, [monitoredTasks]);

  const addTaskToMonitor = useCallback(async (taskId: string) => {
    try {
      const task = await getTaskStatus(taskId);
      const now = new Date();

      setMonitoredTasks(prev => {
        const newMap = new Map(prev);
        newMap.set(taskId, {
          task,
          startTime: task.created_at ? new Date(task.created_at) : now,
          lastUpdate: now,
          elapsedTime: 0,
        });
        return newMap;
      });

      // Save to localStorage
      const taskIds = Array.from(monitoredTasks.keys());
      taskIds.push(taskId);
      localStorage.setItem('monitoredTasks', JSON.stringify(taskIds));
    } catch (error) {
      toast.error('Error', 'Failed to add task to monitor');
    }
  }, [monitoredTasks, toast]);

  const refreshAllTasks = useCallback(async () => {
    if (monitoredTasks.size === 0) return;

    setIsRefreshing(true);
    const now = new Date();

    for (const [taskId, monitoredTask] of monitoredTasks.entries()) {
      try {
        const task = await getTaskStatus(taskId);
        const elapsed = Math.floor((now.getTime() - monitoredTask.startTime.getTime()) / 1000);

        setMonitoredTasks(prev => {
          const newMap = new Map(prev);
          newMap.set(taskId, {
            ...monitoredTask,
            task,
            lastUpdate: now,
            elapsedTime: elapsed,
          });
          return newMap;
        });

        // Show notification for completed tasks
        if (task.status === 'completed' && monitoredTask.task.status !== 'completed') {
          toast.success(
            'Task Completed!',
            `${task.media_type} generation finished in ${formatElapsedTime(elapsed)}`
          );
        } else if (task.status === 'failed' && monitoredTask.task.status !== 'failed') {
          toast.error('Task Failed', task.error_message || 'Generation failed');
        }
      } catch (error) {
        console.error(`Failed to refresh task ${taskId}:`, error);
      }
    }

    setIsRefreshing(false);
  }, [monitoredTasks, toast]);

  const handleCancelTask = async (taskId: string) => {
    try {
      await cancelTask(taskId);
      toast.success('Success', 'Task cancelled');
      await refreshAllTasks();
    } catch (error) {
      toast.error('Error', 'Failed to cancel task');
    }
  };

  const handleRemoveTask = (taskId: string) => {
    setMonitoredTasks(prev => {
      const newMap = new Map(prev);
      newMap.delete(taskId);

      // Update localStorage
      const taskIds = Array.from(newMap.keys());
      localStorage.setItem('monitoredTasks', JSON.stringify(taskIds));

      return newMap;
    });
  };

  const formatElapsedTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'cancelled':
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
      case 'processing':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-500';
      case 'failed':
        return 'text-red-500';
      case 'cancelled':
        return 'text-gray-500';
      case 'processing':
        return 'text-blue-500';
      case 'pending':
        return 'text-yellow-500';
      default:
        return 'text-gray-500';
    }
  };

  const tasks = Array.from(monitoredTasks.values());
  const activeTasks = tasks.filter(t =>
    t.task.status === 'pending' || t.task.status === 'processing'
  );
  const completedTasks = tasks.filter(t =>
    t.task.status === 'completed' || t.task.status === 'failed' || t.task.status === 'cancelled'
  );

  return (
    <Card className="bg-slate-800/50 border-slate-700 text-white">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Task Monitor
            {activeTasks.length > 0 && (
              <span className="text-sm font-normal text-slate-400">
                ({activeTasks.length} active)
              </span>
            )}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAllTasks}
            disabled={isRefreshing || monitoredTasks.size === 0}
            className="border-slate-700 hover:bg-slate-700"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {monitoredTasks.size === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No tasks being monitored</p>
            <p className="text-sm mt-2">Tasks will appear here when you start generating media</p>
          </div>
        ) : (
          <>
            {/* Active Tasks */}
            {activeTasks.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Active Tasks
                </h3>
                {activeTasks.map(({ task, startTime, lastUpdate, elapsedTime }) => (
                  <Card key={task.id} className="bg-slate-900 border-slate-700">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            {getStatusIcon(task.status)}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white line-clamp-1">
                                {task.prompt}
                              </p>
                              <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                                <span className="uppercase">{task.media_type}</span>
                                <span>•</span>
                                <span>{task.model}</span>
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancelTask(task.id)}
                            className="text-red-500 hover:text-red-400 hover:bg-red-900/20"
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </div>

                        {/* Status and Time */}
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-medium ${getStatusColor(task.status)}`}>
                            {task.status.toUpperCase()}
                          </span>
                          <div className="flex items-center gap-4 text-slate-400">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Elapsed: {formatElapsedTime(elapsedTime)}
                            </span>
                            <span>
                              Updated: {Math.floor((Date.now() - lastUpdate.getTime()) / 1000)}s ago
                            </span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        {task.status === 'processing' && (
                          <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 animate-pulse" style={{ width: '60%' }} />
                          </div>
                        )}

                        {/* Warning for long-running tasks */}
                        {elapsedTime > 120 && task.status !== 'completed' && (
                          <div className="flex items-start gap-2 p-2 bg-yellow-900/20 border border-yellow-800 rounded text-xs text-yellow-300">
                            <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            <p>This task is taking longer than usual. High demand may increase wait times (2-30 minutes).</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Completed Tasks */}
            {completedTasks.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Recent Completed
                </h3>
                {completedTasks.slice(0, 5).map(({ task, elapsedTime }) => (
                  <Card key={task.id} className="bg-slate-900 border-slate-700">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {getStatusIcon(task.status)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white line-clamp-1">
                              {task.prompt}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                              <span className="uppercase">{task.media_type}</span>
                              <span>•</span>
                              <span>Took {formatElapsedTime(elapsedTime)}</span>
                              {task.credits_used && (
                                <>
                                  <span>•</span>
                                  <span>{task.credits_used} credits</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveTask(task.id)}
                          className="text-slate-400 hover:text-slate-300 hover:bg-slate-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* Auto-refresh indicator */}
        {monitoredTasks.size > 0 && (
          <div className="text-xs text-slate-500 text-center pt-2 border-t border-slate-700">
            Auto-refreshing every 5 seconds
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TaskMonitorPanel;
