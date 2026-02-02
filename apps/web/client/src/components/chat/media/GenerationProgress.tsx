import React, { useState, useEffect } from "react";

// Types
export interface GenerationTask {
  id: string;
  type: "image" | "video" | "audio" | "document";
  prompt: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number; // 0-100
  result?: string; // URL or data
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Custom hook for managing generation tasks
export function useGenerationTasks() {
  const [tasks, setTasks] = useState<GenerationTask[]>([]);

  const addTask = (task: Omit<GenerationTask, "id" | "createdAt" | "updatedAt">) => {
    const newTask: GenerationTask = {
      ...task,
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setTasks((prev) => [newTask, ...prev]);
    return newTask.id;
  };

  const updateTask = (id: string, updates: Partial<GenerationTask>) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? { ...task, ...updates, updatedAt: new Date() }
          : task
      )
    );
  };

  const removeTask = (id: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
  };

  const clearCompleted = () => {
    setTasks((prev) => prev.filter((task) => task.status !== "completed"));
  };

  const clearAll = () => {
    setTasks([]);
  };

  return {
    tasks,
    addTask,
    updateTask,
    removeTask,
    clearCompleted,
    clearAll,
  };
}

// GenerationProgress Component Props
interface GenerationProgressProps {
  tasks: GenerationTask[];
  onTaskClick?: (task: GenerationTask) => void;
  onTaskRemove?: (taskId: string) => void;
  onClearCompleted?: () => void;
  maxVisible?: number;
}

export function GenerationProgress({
  tasks,
  onTaskClick,
  onTaskRemove,
  onClearCompleted,
  maxVisible = 5,
}: GenerationProgressProps) {
  const [expanded, setExpanded] = useState(false);

  const visibleTasks = expanded ? tasks : tasks.slice(0, maxVisible);
  const hasMore = tasks.length > maxVisible;

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const processingCount = tasks.filter((t) => t.status === "processing").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const failedCount = tasks.filter((t) => t.status === "failed").length;

  if (tasks.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Generation Tasks
          </h3>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            ({tasks.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {completedCount > 0 && (
            <button
              onClick={onClearCompleted}
              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              Clear completed
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {expanded ? "−" : "+"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 dark:bg-gray-900 text-xs">
        {processingCount > 0 && (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-gray-600 dark:text-gray-400">
              {processingCount} processing
            </span>
          </div>
        )}
        {pendingCount > 0 && (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-yellow-500 rounded-full" />
            <span className="text-gray-600 dark:text-gray-400">
              {pendingCount} pending
            </span>
          </div>
        )}
        {completedCount > 0 && (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span className="text-gray-600 dark:text-gray-400">
              {completedCount} completed
            </span>
          </div>
        )}
        {failedCount > 0 && (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-red-500 rounded-full" />
            <span className="text-gray-600 dark:text-gray-400">
              {failedCount} failed
            </span>
          </div>
        )}
      </div>

      {/* Task List */}
      <div className="max-h-96 overflow-y-auto">
        {visibleTasks.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            onClick={() => onTaskClick?.(task)}
            onRemove={() => onTaskRemove?.(task.id)}
          />
        ))}

        {hasMore && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="w-full py-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 bg-gray-50 dark:bg-gray-900"
          >
            Show {tasks.length - maxVisible} more
          </button>
        )}
      </div>
    </div>
  );
}

// Task Item Component
interface TaskItemProps {
  task: GenerationTask;
  onClick?: () => void;
  onRemove?: () => void;
}

function TaskItem({ task, onClick, onRemove }: TaskItemProps) {
  const statusColors = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    processing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  const statusIcons = {
    pending: "⏳",
    processing: "⚙️",
    completed: "✅",
    failed: "❌",
  };

  const typeIcons = {
    image: "🖼️",
    video: "🎥",
    audio: "🎵",
    document: "📄",
  };

  return (
    <div
      className="p-4 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Type and Status */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{typeIcons[task.type]}</span>
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColors[task.status]}`}
            >
              {statusIcons[task.status]} {task.status}
            </span>
          </div>

          {/* Prompt */}
          <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
            {task.prompt}
          </p>

          {/* Progress Bar */}
          {task.status === "processing" && (
            <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${task.progress}%` }}
              />
            </div>
          )}

          {/* Error Message */}
          {task.status === "failed" && task.error && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {task.error}
            </p>
          )}

          {/* Time */}
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {formatTime(task.updatedAt)}
          </p>
        </div>

        {/* Remove Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// Helper function to format time
function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
