// Dashboard Service - Frontend service for Progress Dashboard
//
// Provides:
// - Project management
// - Kanban board state
// - Metrics and charts
// - Timeline tracking

import { invoke } from '@tauri-apps/api/core';
import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

// ============================================
// Types
// ============================================

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  start_date?: number;
  target_date?: number;
  created_at: number;
  updated_at: number;
  settings: ProjectSettings;
}

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';

export interface ProjectSettings {
  board_columns: BoardColumn[];
  labels: Label[];
  default_assignee?: string;
}

export interface BoardColumn {
  id: string;
  name: string;
  color: string;
  limit?: number;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  column_id: string;
  position: number;
  priority: TaskPriority;
  labels: string[];
  assignee?: string;
  due_date?: number;
  estimated_hours?: number;
  actual_hours?: number;
  subtasks: Subtask[];
  attachments: Attachment[];
  created_at: number;
  updated_at: number;
  completed_at?: number;
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Attachment {
  id: string;
  name: string;
  path: string;
  size: number;
  mime_type: string;
}

export interface TimelineEntry {
  id: string;
  project_id: string;
  task_id?: string;
  event_type: TimelineEventType;
  description: string;
  user?: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}

export type TimelineEventType =
  | 'task_created'
  | 'task_updated'
  | 'task_moved'
  | 'task_completed'
  | 'task_deleted'
  | 'comment_added'
  | 'attachment_added'
  | 'milestone_reached'
  | 'project_status_changed';

export interface ProjectMetrics {
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  overdue_tasks: number;
  completion_percentage: number;
  tasks_by_column: Record<string, number>;
  tasks_by_priority: Record<string, number>;
  tasks_by_label: Record<string, number>;
  velocity: VelocityMetrics;
  burndown: BurndownPoint[];
}

export interface VelocityMetrics {
  current_week: number;
  last_week: number;
  average: number;
  trend: number;
}

export interface BurndownPoint {
  date: number;
  remaining: number;
  completed: number;
  ideal: number;
}

export interface BoardData {
  project: Project;
  columns: BoardColumnData[];
}

export interface BoardColumnData {
  column: BoardColumn;
  tasks: Task[];
}

export interface ProjectUpdate {
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
  start_date?: number | null;
  target_date?: number | null;
}

export interface TaskUpdate {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  labels?: string[];
  assignee?: string | null;
  due_date?: number | null;
  estimated_hours?: number | null;
  actual_hours?: number | null;
}

// ============================================
// API Functions
// ============================================

export async function createProject(name: string, description?: string): Promise<Project> {
  return invoke('dashboard_create_project', { name, description });
}

export async function getProject(projectId: string): Promise<Project> {
  return invoke('dashboard_get_project', { projectId });
}

export async function listProjects(): Promise<Project[]> {
  return invoke('dashboard_list_projects');
}

export async function updateProject(projectId: string, updates: ProjectUpdate): Promise<Project> {
  return invoke('dashboard_update_project', { projectId, updates });
}

export async function createTask(projectId: string, title: string, columnId: string): Promise<Task> {
  return invoke('dashboard_create_task', { projectId, title, columnId });
}

export async function getTask(taskId: string): Promise<Task> {
  return invoke('dashboard_get_task', { taskId });
}

export async function getProjectTasks(projectId: string): Promise<Task[]> {
  return invoke('dashboard_get_project_tasks', { projectId });
}

export async function updateTask(taskId: string, updates: TaskUpdate): Promise<Task> {
  return invoke('dashboard_update_task', { taskId, updates });
}

export async function moveTask(taskId: string, columnId: string, position: number): Promise<Task> {
  return invoke('dashboard_move_task', { taskId, columnId, position });
}

export async function deleteTask(taskId: string): Promise<void> {
  return invoke('dashboard_delete_task', { taskId });
}

export async function addSubtask(taskId: string, title: string): Promise<Subtask> {
  return invoke('dashboard_add_subtask', { taskId, title });
}

export async function toggleSubtask(taskId: string, subtaskId: string): Promise<boolean> {
  return invoke('dashboard_toggle_subtask', { taskId, subtaskId });
}

export async function getTimeline(projectId: string, limit?: number): Promise<TimelineEntry[]> {
  return invoke('dashboard_get_timeline', { projectId, limit });
}

export async function getMetrics(projectId: string): Promise<ProjectMetrics> {
  return invoke('dashboard_get_metrics', { projectId });
}

export async function getBoardData(projectId: string): Promise<BoardData> {
  return invoke('dashboard_get_board_data', { projectId });
}

// ============================================
// Dashboard Context
// ============================================

interface DashboardContextValue {
  // Data
  projects: Project[];
  currentProject: Project | null;
  boardData: BoardData | null;
  metrics: ProjectMetrics | null;
  timeline: TimelineEntry[];
  isLoading: boolean;
  error: string | null;
  
  // Selected task
  selectedTask: Task | null;
  
  // Actions
  loadProjects: () => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
  createNewProject: (name: string, description?: string) => Promise<void>;
  updateCurrentProject: (updates: ProjectUpdate) => Promise<void>;
  
  // Task actions
  createNewTask: (title: string, columnId: string) => Promise<void>;
  updateTaskById: (taskId: string, updates: TaskUpdate) => Promise<void>;
  moveTaskToColumn: (taskId: string, columnId: string, position: number) => Promise<void>;
  deleteTaskById: (taskId: string) => Promise<void>;
  selectTask: (task: Task | null) => void;
  
  // Subtask actions
  addSubtaskToTask: (taskId: string, title: string) => Promise<void>;
  toggleSubtaskStatus: (taskId: string, subtaskId: string) => Promise<void>;
  
  // Refresh
  refreshBoard: () => Promise<void>;
  refreshMetrics: () => Promise<void>;
  refreshTimeline: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [boardData, setBoardData] = useState<BoardData | null>(null);
  const [metrics, setMetrics] = useState<ProjectMetrics | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const projectList = await listProjects();
      setProjects(projectList);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const selectProject = useCallback(async (projectId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const [project, board, projectMetrics, projectTimeline] = await Promise.all([
        getProject(projectId),
        getBoardData(projectId),
        getMetrics(projectId),
        getTimeline(projectId, 50),
      ]);
      setCurrentProject(project);
      setBoardData(board);
      setMetrics(projectMetrics);
      setTimeline(projectTimeline);
      setSelectedTask(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createNewProject = useCallback(async (name: string, description?: string) => {
    setIsLoading(true);
    try {
      const project = await createProject(name, description);
      setProjects(prev => [...prev, project]);
      await selectProject(project.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [selectProject]);

  const updateCurrentProject = useCallback(async (updates: ProjectUpdate) => {
    if (!currentProject) return;
    try {
      const updated = await updateProject(currentProject.id, updates);
      setCurrentProject(updated);
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
    } catch (e) {
      setError(String(e));
    }
  }, [currentProject]);

  const createNewTask = useCallback(async (title: string, columnId: string) => {
    if (!currentProject) return;
    try {
      await createTask(currentProject.id, title, columnId);
      await refreshBoard();
    } catch (e) {
      setError(String(e));
    }
  }, [currentProject]);

  const updateTaskById = useCallback(async (taskId: string, updates: TaskUpdate) => {
    try {
      const updated = await updateTask(taskId, updates);
      if (selectedTask?.id === taskId) {
        setSelectedTask(updated);
      }
      await refreshBoard();
    } catch (e) {
      setError(String(e));
    }
  }, [selectedTask]);

  const moveTaskToColumn = useCallback(async (taskId: string, columnId: string, position: number) => {
    try {
      await moveTask(taskId, columnId, position);
      await refreshBoard();
      await refreshMetrics();
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const deleteTaskById = useCallback(async (taskId: string) => {
    try {
      await deleteTask(taskId);
      if (selectedTask?.id === taskId) {
        setSelectedTask(null);
      }
      await refreshBoard();
      await refreshMetrics();
    } catch (e) {
      setError(String(e));
    }
  }, [selectedTask]);

  const addSubtaskToTask = useCallback(async (taskId: string, title: string) => {
    try {
      await addSubtask(taskId, title);
      if (selectedTask?.id === taskId) {
        const updated = await getTask(taskId);
        setSelectedTask(updated);
      }
      await refreshBoard();
    } catch (e) {
      setError(String(e));
    }
  }, [selectedTask]);

  const toggleSubtaskStatus = useCallback(async (taskId: string, subtaskId: string) => {
    try {
      await toggleSubtask(taskId, subtaskId);
      if (selectedTask?.id === taskId) {
        const updated = await getTask(taskId);
        setSelectedTask(updated);
      }
    } catch (e) {
      setError(String(e));
    }
  }, [selectedTask]);

  const refreshBoard = useCallback(async () => {
    if (!currentProject) return;
    try {
      const board = await getBoardData(currentProject.id);
      setBoardData(board);
    } catch (e) {
      setError(String(e));
    }
  }, [currentProject]);

  const refreshMetrics = useCallback(async () => {
    if (!currentProject) return;
    try {
      const projectMetrics = await getMetrics(currentProject.id);
      setMetrics(projectMetrics);
    } catch (e) {
      setError(String(e));
    }
  }, [currentProject]);

  const refreshTimeline = useCallback(async () => {
    if (!currentProject) return;
    try {
      const projectTimeline = await getTimeline(currentProject.id, 50);
      setTimeline(projectTimeline);
    } catch (e) {
      setError(String(e));
    }
  }, [currentProject]);

  const value: DashboardContextValue = {
    projects,
    currentProject,
    boardData,
    metrics,
    timeline,
    isLoading,
    error,
    selectedTask,
    loadProjects,
    selectProject,
    createNewProject,
    updateCurrentProject,
    createNewTask,
    updateTaskById,
    moveTaskToColumn,
    deleteTaskById,
    selectTask: setSelectedTask,
    addSubtaskToTask,
    toggleSubtaskStatus,
    refreshBoard,
    refreshMetrics,
    refreshTimeline,
  };

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}

// ============================================
// Utility Functions
// ============================================

export function getPriorityColor(priority: TaskPriority): string {
  const colors: Record<TaskPriority, string> = {
    low: '#22c55e',
    medium: '#eab308',
    high: '#f97316',
    urgent: '#ef4444',
  };
  return colors[priority];
}

export function getPriorityIcon(priority: TaskPriority): string {
  const icons: Record<TaskPriority, string> = {
    low: '🟢',
    medium: '🟡',
    high: '🟠',
    urgent: '🔴',
  };
  return icons[priority];
}

export function getStatusColor(status: ProjectStatus): string {
  const colors: Record<ProjectStatus, string> = {
    planning: '#6b7280',
    active: '#3b82f6',
    on_hold: '#f59e0b',
    completed: '#22c55e',
    archived: '#9ca3af',
  };
  return colors[status];
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString();
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(timestamp);
}
