// Job Detail Component
// Detailed view of a job with tasks and actions

import { useState } from 'react';
import { 
  useJobs, 
  Task, 
  TaskStatus,
  TaskType,
  getStatusIcon,
  getPriorityColor,
  getTaskTypeIcon,
  formatDuration,
} from '../../services/jobService';

interface JobDetailProps {
  className?: string;
}

export function JobDetail({ className = '' }: JobDetailProps) {
  const {
    selectedJob,
    selectJob,
    updateSelectedJob,
    deleteSelectedJob,
    startSelectedJob,
    pauseSelectedJob,
    completeSelectedJob,
    cancelSelectedJob,
    addTaskToJob,
    updateTask,
    deleteTaskFromJob,
    createJobBranch,
    currentBranch,
  } = useJobs();

  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskType, setNewTaskType] = useState<TaskType>('Implement');

  if (!selectedJob) {
    return (
      <div className={`flex items-center justify-center h-full bg-white dark:bg-gray-800 ${className}`}>
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-4">📋</div>
          <p>Select a job to view details</p>
        </div>
      </div>
    );
  }

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    await addTaskToJob({
      title: newTaskTitle.trim(),
      task_type: newTaskType,
    });
    setNewTaskTitle('');
    setShowAddTask(false);
  };

  const handleStatusAction = async (action: 'start' | 'pause' | 'complete' | 'cancel') => {
    switch (action) {
      case 'start':
        await startSelectedJob();
        break;
      case 'pause':
        await pauseSelectedJob();
        break;
      case 'complete':
        await completeSelectedJob();
        break;
      case 'cancel':
        await cancelSelectedJob();
        break;
    }
  };

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-800 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span>{getStatusIcon(selectedJob.status)}</span>
              <span className={`px-2 py-0.5 text-xs rounded bg-${getPriorityColor(selectedJob.priority)}-100 dark:bg-${getPriorityColor(selectedJob.priority)}-900/30 text-${getPriorityColor(selectedJob.priority)}-700 dark:text-${getPriorityColor(selectedJob.priority)}-300`}>
                {selectedJob.priority}
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {selectedJob.title}
            </h2>
            {selectedJob.description && (
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {selectedJob.description}
              </p>
            )}
          </div>
          <button
            onClick={() => selectJob(null)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 mt-4">
          {selectedJob.status === 'Draft' && (
            <button
              onClick={() => updateSelectedJob({ status: 'Ready' })}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Mark Ready
            </button>
          )}
          {(selectedJob.status === 'Ready' || selectedJob.status === 'Paused') && (
            <button
              onClick={() => handleStatusAction('start')}
              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
            >
              ▶ Start
            </button>
          )}
          {selectedJob.status === 'InProgress' && (
            <>
              <button
                onClick={() => handleStatusAction('pause')}
                className="px-3 py-1 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700"
              >
                ⏸ Pause
              </button>
              <button
                onClick={() => updateSelectedJob({ status: 'Review' })}
                className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                👀 Review
              </button>
            </>
          )}
          {selectedJob.status === 'Review' && (
            <button
              onClick={() => handleStatusAction('complete')}
              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
            >
              ✓ Complete
            </button>
          )}
          {selectedJob.status !== 'Completed' && selectedJob.status !== 'Cancelled' && (
            <button
              onClick={() => handleStatusAction('cancel')}
              className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-gray-600 dark:text-gray-400">Progress</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {selectedJob.progress_percent}%
          </span>
        </div>
        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${selectedJob.progress_percent}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
          <span>
            {selectedJob.tasks.filter(t => t.status === 'Completed').length} / {selectedJob.tasks.length} tasks
          </span>
          {selectedJob.estimated_hours && (
            <span>Est: {formatDuration(selectedJob.estimated_hours)}</span>
          )}
        </div>
      </div>

      {/* Branch Info */}
      {selectedJob.branch_name && (
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span>🌿</span>
              <span className="font-mono text-gray-700 dark:text-gray-300">
                {selectedJob.branch_name}
              </span>
            </div>
            {currentBranch?.name !== selectedJob.branch_name && (
              <button className="text-xs text-blue-600 hover:underline">
                Checkout
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tasks */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">Tasks</h3>
            <button
              onClick={() => setShowAddTask(true)}
              className="text-sm text-blue-600 hover:underline"
            >
              + Add Task
            </button>
          </div>

          {/* Add Task Form */}
          {showAddTask && (
            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Task title..."
                className="w-full px-3 py-2 mb-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                autoFocus
              />
              <div className="flex items-center justify-between">
                <select
                  value={newTaskType}
                  onChange={(e) => setNewTaskType(e.target.value as TaskType)}
                  className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                >
                  {(['Spec', 'Design', 'Implement', 'Test', 'Review', 'Document', 'Deploy', 'Other'] as TaskType[]).map(type => (
                    <option key={type} value={type}>{getTaskTypeIcon(type)} {type}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddTask(false)}
                    className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddTask}
                    disabled={!newTaskTitle.trim()}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-400"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Task List */}
          <div className="space-y-2">
            {selectedJob.tasks.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                No tasks yet. Add tasks to track progress.
              </div>
            ) : (
              selectedJob.tasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onStatusChange={(status) => updateTask(task.id, status)}
                  onDelete={() => deleteTaskFromJob(task.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500">
        <div className="flex items-center justify-between">
          <span>Created {new Date(selectedJob.created_at).toLocaleDateString()}</span>
          <button
            onClick={deleteSelectedJob}
            className="text-red-600 hover:underline"
          >
            Delete Job
          </button>
        </div>
      </div>
    </div>
  );
}

// Task Item Component
function TaskItem({
  task,
  onStatusChange,
  onDelete,
}: {
  task: Task;
  onStatusChange: (status: TaskStatus) => void;
  onDelete: () => void;
}) {
  const isCompleted = task.status === 'Completed';

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${
      isCompleted 
        ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
        : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
    }`}>
      {/* Checkbox */}
      <button
        onClick={() => onStatusChange(isCompleted ? 'Pending' : 'Completed')}
        className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
          isCompleted
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-gray-400 hover:border-blue-500'
        }`}
      >
        {isCompleted && '✓'}
      </button>

      {/* Task Info */}
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${isCompleted ? 'line-through text-gray-500' : 'text-gray-900 dark:text-white'}`}>
          {task.title}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
          <span>{getTaskTypeIcon(task.task_type)} {task.task_type}</span>
          {task.file_path && (
            <span className="truncate max-w-32">📄 {task.file_path}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <button
        onClick={onDelete}
        className="p-1 text-gray-400 hover:text-red-500"
      >
        🗑
      </button>
    </div>
  );
}

export default JobDetail;
