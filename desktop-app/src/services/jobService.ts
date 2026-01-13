// Job Service - Frontend service for Job & Branch Management
//
// Provides:
// - Job CRUD operations
// - Task management
// - Branch operations
// - Statistics and progress tracking

import { invoke } from '@tauri-apps/api/core';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// ============================================
// Types
// ============================================

export interface Job {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  status: JobStatus;
  priority: JobPriority;
  branch_name?: string;
  parent_job_id?: string;
  tasks: Task[];
  tags: string[];
  estimated_hours?: number;
  actual_hours?: number;
  progress_percent: number;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  metadata: Record<string, string>;
}

export type JobStatus = 
  | 'Draft'
  | 'Ready'
  | 'InProgress'
  | 'Paused'
  | 'Blocked'
  | 'Review'
  | 'Completed'
  | 'Cancelled';

export type JobPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export interface Task {
  id: string;
  job_id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  task_type: TaskType;
  order: number;
  estimated_minutes?: number;
  actual_minutes?: number;
  file_path?: string;
  line_start?: number;
  line_end?: number;
  dependencies: string[];
  created_at: string;
  completed_at?: string;
}

export type TaskStatus = 'Pending' | 'InProgress' | 'Completed' | 'Skipped' | 'Failed';

export type TaskType = 'Spec' | 'Design' | 'Implement' | 'Test' | 'Review' | 'Document' | 'Deploy' | 'Other';

export interface Branch {
  name: string;
  job_id?: string;
  is_current: boolean;
  is_remote: boolean;
  ahead: number;
  behind: number;
  last_commit?: CommitInfo;
  created_at?: string;
}

export interface CommitInfo {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  date: string;
}

export interface JobStats {
  total_jobs: number;
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  total_tasks: number;
  completed_tasks: number;
  total_estimated_hours: number;
  total_actual_hours: number;
}

export interface CreateJobRequest {
  title: string;
  description: string;
  priority?: JobPriority;
  parent_job_id?: string;
  tags?: string[];
  estimated_hours?: number;
  create_branch: boolean;
  branch_prefix?: string;
}

export interface UpdateJobRequest {
  title?: string;
  description?: string;
  status?: JobStatus;
  priority?: JobPriority;
  tags?: string[];
  estimated_hours?: number;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  task_type: TaskType;
  estimated_minutes?: number;
  file_path?: string;
  line_start?: number;
  line_end?: number;
  dependencies?: string[];
}

// ============================================
// API Functions
// ============================================

// Job APIs
export async function createJob(workspaceId: string, request: CreateJobRequest): Promise<Job> {
  return invoke('job_create', { workspaceId, request });
}

export async function getJob(jobId: string): Promise<Job | null> {
  return invoke('job_get', { jobId });
}

export async function updateJob(jobId: string, request: UpdateJobRequest): Promise<Job> {
  return invoke('job_update', { jobId, request });
}

export async function deleteJob(jobId: string): Promise<void> {
  return invoke('job_delete', { jobId });
}

export async function listJobs(workspaceId: string, status?: JobStatus): Promise<Job[]> {
  return invoke('job_list', { workspaceId, status });
}

// Job Status APIs
export async function startJob(jobId: string): Promise<Job> {
  return invoke('job_start', { jobId });
}

export async function pauseJob(jobId: string): Promise<Job> {
  return invoke('job_pause', { jobId });
}

export async function completeJob(jobId: string): Promise<Job> {
  return invoke('job_complete', { jobId });
}

export async function cancelJob(jobId: string): Promise<Job> {
  return invoke('job_cancel', { jobId });
}

// Task APIs
export async function addTask(jobId: string, request: CreateTaskRequest): Promise<Task> {
  return invoke('task_add', { jobId, request });
}

export async function updateTaskStatus(jobId: string, taskId: string, status: TaskStatus): Promise<Task> {
  return invoke('task_update_status', { jobId, taskId, status });
}

export async function reorderTasks(jobId: string, taskIds: string[]): Promise<void> {
  return invoke('task_reorder', { jobId, taskIds });
}

export async function deleteTask(jobId: string, taskId: string): Promise<void> {
  return invoke('task_delete', { jobId, taskId });
}

// Branch APIs
export async function listBranches(): Promise<Branch[]> {
  return invoke('branch_list');
}

export async function createBranch(jobId: string, branchName: string): Promise<Branch> {
  return invoke('branch_create', { jobId, branchName });
}

export async function checkoutBranch(branchName: string): Promise<void> {
  return invoke('branch_checkout', { branchName });
}

export async function mergeBranch(source: string, target: string): Promise<void> {
  return invoke('branch_merge', { source, target });
}

export async function deleteBranch(branchName: string): Promise<void> {
  return invoke('branch_delete', { branchName });
}

// Stats API
export async function getJobStats(workspaceId: string): Promise<JobStats> {
  return invoke('job_stats', { workspaceId });
}

// ============================================
// Job Context
// ============================================

interface JobContextValue {
  // Jobs
  jobs: Job[];
  selectedJob: Job | null;
  selectJob: (jobId: string | null) => void;
  createNewJob: (request: CreateJobRequest) => Promise<Job>;
  updateSelectedJob: (request: UpdateJobRequest) => Promise<void>;
  deleteSelectedJob: () => Promise<void>;
  refreshJobs: () => Promise<void>;
  
  // Job Actions
  startSelectedJob: () => Promise<void>;
  pauseSelectedJob: () => Promise<void>;
  completeSelectedJob: () => Promise<void>;
  cancelSelectedJob: () => Promise<void>;
  
  // Tasks
  addTaskToJob: (request: CreateTaskRequest) => Promise<Task>;
  updateTask: (taskId: string, status: TaskStatus) => Promise<void>;
  deleteTaskFromJob: (taskId: string) => Promise<void>;
  
  // Branches
  branches: Branch[];
  currentBranch: Branch | null;
  createJobBranch: (branchName: string) => Promise<void>;
  switchBranch: (branchName: string) => Promise<void>;
  refreshBranches: () => Promise<void>;
  
  // Stats
  stats: JobStats | null;
  
  // Filter
  statusFilter: JobStatus | null;
  setStatusFilter: (status: JobStatus | null) => void;
}

const JobContext = createContext<JobContextValue | null>(null);

export function JobProvider({ 
  children, 
  workspaceId 
}: { 
  children: ReactNode; 
  workspaceId: string;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [stats, setStats] = useState<JobStats | null>(null);
  const [statusFilter, setStatusFilter] = useState<JobStatus | null>(null);

  // Load jobs
  const refreshJobs = useCallback(async () => {
    const jobList = await listJobs(workspaceId, statusFilter || undefined);
    setJobs(jobList);
    
    // Update selected job if it exists
    if (selectedJob) {
      const updated = jobList.find(j => j.id === selectedJob.id);
      setSelectedJob(updated || null);
    }
    
    // Refresh stats
    const jobStats = await getJobStats(workspaceId);
    setStats(jobStats);
  }, [workspaceId, statusFilter, selectedJob?.id]);

  // Load branches
  const refreshBranches = useCallback(async () => {
    const branchList = await listBranches();
    setBranches(branchList);
  }, []);

  // Initial load
  useEffect(() => {
    refreshJobs();
    refreshBranches();
  }, [refreshJobs, refreshBranches]);

  // Select job
  const selectJob = useCallback(async (jobId: string | null) => {
    if (!jobId) {
      setSelectedJob(null);
      return;
    }
    const job = await getJob(jobId);
    setSelectedJob(job);
  }, []);

  // Create job
  const createNewJob = useCallback(async (request: CreateJobRequest): Promise<Job> => {
    const job = await createJob(workspaceId, request);
    await refreshJobs();
    setSelectedJob(job);
    return job;
  }, [workspaceId, refreshJobs]);

  // Update job
  const updateSelectedJob = useCallback(async (request: UpdateJobRequest) => {
    if (!selectedJob) return;
    await updateJob(selectedJob.id, request);
    await refreshJobs();
  }, [selectedJob, refreshJobs]);

  // Delete job
  const deleteSelectedJob = useCallback(async () => {
    if (!selectedJob) return;
    await deleteJob(selectedJob.id);
    setSelectedJob(null);
    await refreshJobs();
  }, [selectedJob, refreshJobs]);

  // Job status actions
  const startSelectedJob = useCallback(async () => {
    if (!selectedJob) return;
    await startJob(selectedJob.id);
    await refreshJobs();
  }, [selectedJob, refreshJobs]);

  const pauseSelectedJob = useCallback(async () => {
    if (!selectedJob) return;
    await pauseJob(selectedJob.id);
    await refreshJobs();
  }, [selectedJob, refreshJobs]);

  const completeSelectedJob = useCallback(async () => {
    if (!selectedJob) return;
    await completeJob(selectedJob.id);
    await refreshJobs();
  }, [selectedJob, refreshJobs]);

  const cancelSelectedJob = useCallback(async () => {
    if (!selectedJob) return;
    await cancelJob(selectedJob.id);
    await refreshJobs();
  }, [selectedJob, refreshJobs]);

  // Task actions
  const addTaskToJob = useCallback(async (request: CreateTaskRequest): Promise<Task> => {
    if (!selectedJob) throw new Error('No job selected');
    const task = await addTask(selectedJob.id, request);
    await refreshJobs();
    return task;
  }, [selectedJob, refreshJobs]);

  const updateTask = useCallback(async (taskId: string, status: TaskStatus) => {
    if (!selectedJob) return;
    await updateTaskStatus(selectedJob.id, taskId, status);
    await refreshJobs();
  }, [selectedJob, refreshJobs]);

  const deleteTaskFromJob = useCallback(async (taskId: string) => {
    if (!selectedJob) return;
    await deleteTask(selectedJob.id, taskId);
    await refreshJobs();
  }, [selectedJob, refreshJobs]);

  // Branch actions
  const createJobBranch = useCallback(async (branchName: string) => {
    if (!selectedJob) return;
    await createBranch(selectedJob.id, branchName);
    await refreshBranches();
    await refreshJobs();
  }, [selectedJob, refreshBranches, refreshJobs]);

  const switchBranch = useCallback(async (branchName: string) => {
    await checkoutBranch(branchName);
    await refreshBranches();
  }, [refreshBranches]);

  const currentBranch = branches.find(b => b.is_current) || null;

  const value: JobContextValue = {
    jobs,
    selectedJob,
    selectJob,
    createNewJob,
    updateSelectedJob,
    deleteSelectedJob,
    refreshJobs,
    startSelectedJob,
    pauseSelectedJob,
    completeSelectedJob,
    cancelSelectedJob,
    addTaskToJob,
    updateTask,
    deleteTaskFromJob,
    branches,
    currentBranch,
    createJobBranch,
    switchBranch,
    refreshBranches,
    stats,
    statusFilter,
    setStatusFilter,
  };

  return (
    <JobContext.Provider value={value}>
      {children}
    </JobContext.Provider>
  );
}

export function useJobs() {
  const context = useContext(JobContext);
  if (!context) {
    throw new Error('useJobs must be used within a JobProvider');
  }
  return context;
}

// ============================================
// Utility Functions
// ============================================

export function getStatusColor(status: JobStatus): string {
  const colors: Record<JobStatus, string> = {
    Draft: 'gray',
    Ready: 'blue',
    InProgress: 'yellow',
    Paused: 'orange',
    Blocked: 'red',
    Review: 'purple',
    Completed: 'green',
    Cancelled: 'gray',
  };
  return colors[status];
}

export function getStatusIcon(status: JobStatus): string {
  const icons: Record<JobStatus, string> = {
    Draft: '📝',
    Ready: '🔵',
    InProgress: '🔄',
    Paused: '⏸️',
    Blocked: '🚫',
    Review: '👀',
    Completed: '✅',
    Cancelled: '❌',
  };
  return icons[status];
}

export function getPriorityColor(priority: JobPriority): string {
  const colors: Record<JobPriority, string> = {
    Low: 'gray',
    Medium: 'blue',
    High: 'orange',
    Critical: 'red',
  };
  return colors[priority];
}

export function getTaskTypeIcon(type: TaskType): string {
  const icons: Record<TaskType, string> = {
    Spec: '📋',
    Design: '🎨',
    Implement: '💻',
    Test: '🧪',
    Review: '👀',
    Document: '📖',
    Deploy: '🚀',
    Other: '📌',
  };
  return icons[type];
}

export function formatDuration(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)}m`;
  }
  return `${hours.toFixed(1)}h`;
}
