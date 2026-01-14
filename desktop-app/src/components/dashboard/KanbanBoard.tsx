// Kanban Board Component
// Drag-and-drop task board

import { useState, useCallback } from 'react';
import {
  useDashboard,
  Task,
  BoardColumn,
  getPriorityIcon,
  formatRelativeTime,
} from '../../services/dashboardService';

interface KanbanBoardProps {
  className?: string;
}

export function KanbanBoard({ className = '' }: KanbanBoardProps) {
  const {
    boardData,
    isLoading,
    createNewTask,
    moveTaskToColumn,
    selectTask,
  } = useDashboard();

  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const handleDragStart = useCallback((task: Task) => {
    setDraggedTask(task);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedTask(null);
    setDragOverColumn(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumn(columnId);
  }, []);

  const handleDrop = useCallback(async (columnId: string) => {
    if (draggedTask && draggedTask.column_id !== columnId) {
      await moveTaskToColumn(draggedTask.id, columnId, 0);
    }
    setDraggedTask(null);
    setDragOverColumn(null);
  }, [draggedTask, moveTaskToColumn]);

  if (isLoading || !boardData) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className={`flex gap-4 p-4 overflow-x-auto h-full ${className}`}>
      {boardData.columns.map((columnData) => (
        <BoardColumnView
          key={columnData.column.id}
          column={columnData.column}
          tasks={columnData.tasks}
          isDragOver={dragOverColumn === columnData.column.id}
          onDragOver={(e) => handleDragOver(e, columnData.column.id)}
          onDrop={() => handleDrop(columnData.column.id)}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onTaskClick={selectTask}
          onAddTask={(title) => createNewTask(title, columnData.column.id)}
        />
      ))}
    </div>
  );
}

// ============================================
// Board Column View
// ============================================

interface BoardColumnViewProps {
  column: BoardColumn;
  tasks: Task[];
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragStart: (task: Task) => void;
  onDragEnd: () => void;
  onTaskClick: (task: Task) => void;
  onAddTask: (title: string) => void;
}

function BoardColumnView({
  column,
  tasks,
  isDragOver,
  onDragOver,
  onDrop,
  onDragStart,
  onDragEnd,
  onTaskClick,
  onAddTask,
}: BoardColumnViewProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const handleAddTask = () => {
    if (newTaskTitle.trim()) {
      onAddTask(newTaskTitle.trim());
      setNewTaskTitle('');
      setIsAdding(false);
    }
  };

  const isOverLimit = column.limit && tasks.length >= column.limit;

  return (
    <div
      className={`flex flex-col w-72 min-w-72 bg-gray-100 dark:bg-gray-800 rounded-xl ${
        isDragOver ? 'ring-2 ring-blue-500' : ''
      }`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Column Header */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: column.color }}
            />
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {column.name}
            </h3>
            <span className="text-sm text-gray-500">
              {tasks.length}
              {column.limit && `/${column.limit}`}
            </span>
          </div>
          <button
            onClick={() => setIsAdding(true)}
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            disabled={isOverLimit}
          >
            +
          </button>
        </div>
        {isOverLimit && (
          <p className="text-xs text-amber-600 mt-1">WIP limit reached</p>
        )}
      </div>

      {/* Tasks */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onDragStart={() => onDragStart(task)}
            onDragEnd={onDragEnd}
            onClick={() => onTaskClick(task)}
          />
        ))}

        {/* Add Task Form */}
        {isAdding && (
          <div className="p-2 bg-white dark:bg-gray-700 rounded-lg shadow">
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Task title..."
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddTask();
                if (e.key === 'Escape') setIsAdding(false);
              }}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleAddTask}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Add
              </button>
              <button
                onClick={() => setIsAdding(false)}
                className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Task Card
// ============================================

interface TaskCardProps {
  task: Task;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
}

function TaskCard({ task, onDragStart, onDragEnd, onClick }: TaskCardProps) {
  const completedSubtasks = task.subtasks.filter(s => s.completed).length;
  const totalSubtasks = task.subtasks.length;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="p-3 bg-white dark:bg-gray-700 rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow"
    >
      {/* Labels */}
      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labels.map((label) => (
            <span
              key={label}
              className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Title */}
      <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
        {task.title}
      </h4>

      {/* Subtasks Progress */}
      {totalSubtasks > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full"
              style={{ width: `${(completedSubtasks / totalSubtasks) * 100}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">
            {completedSubtasks}/{totalSubtasks}
          </span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span>{getPriorityIcon(task.priority)}</span>
          {task.due_date && (
            <span className={task.due_date * 1000 < Date.now() ? 'text-red-500' : ''}>
              📅 {new Date(task.due_date * 1000).toLocaleDateString()}
            </span>
          )}
        </div>
        {task.assignee && (
          <span className="w-6 h-6 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center text-xs">
            {task.assignee[0].toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}

export default KanbanBoard;
