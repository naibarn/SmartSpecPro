// Workspace Service - Frontend service for workspace database operations
// Provides TypeScript bindings for Tauri workspace commands

import { invoke } from '@tauri-apps/api/core';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// ============================================
// Types
// ============================================

export interface WorkspaceMetadata {
  id: string;
  name: string;
  path: string;
  git_remote: string | null;
  created_at: string;
  last_accessed_at: string;
  is_active: boolean;
  metadata_json: string | null;
}

export interface WorkspaceDbStats {
  workspace_id: string;
  job_count: number;
  task_count: number;
  chat_session_count: number;
  knowledge_count: number;
  memory_short_count: number;
  memory_long_count: number;
  total_tokens_used: number;
  db_size_bytes: number;
}

export interface Job {
  id: string;
  name: string;
  description: string | null;
  branch_name: string | null;
  status: 'active' | 'paused' | 'completed' | 'archived';
  parent_job_id: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface Task {
  id: string;
  job_id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
  priority: number;
  order_index: number;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  assignee: 'user' | 'opencode' | 'kilo' | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface ChatSession {
  id: string;
  job_id: string | null;
  title: string | null;
  session_type: 'general' | 'spec' | 'plan' | 'implement' | 'debug' | 'review';
  model_id: string | null;
  is_active: boolean;
  message_count: number;
  token_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: number;
  session_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls_json: string | null;
  tool_results_json: string | null;
  model_id: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  latency_ms: number | null;
  created_at: string;
}

export interface Knowledge {
  id: number;
  knowledge_type: 'decision' | 'constraint' | 'pattern' | 'reference' | 'note';
  title: string;
  content: string;
  tags_json: string | null;
  file_refs_json: string | null;
  is_active: boolean;
  source: 'user' | 'llm' | 'imported' | null;
  created_by: 'chat' | 'opencode' | 'kilo' | 'manual' | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryLong {
  id: number;
  category: 'decision' | 'pattern' | 'constraint' | 'learning' | 'reference';
  title: string;
  content: string;
  source: 'user' | 'auto' | 'imported' | null;
  confidence: number;
  access_count: number;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// Workspace Management
// ============================================

export async function createWorkspace(
  name: string,
  gitRemote?: string
): Promise<WorkspaceMetadata> {
  return invoke('create_workspace', { name, gitRemote });
}

export async function listWorkspaces(): Promise<WorkspaceMetadata[]> {
  return invoke('list_workspaces');
}

export async function getWorkspace(workspaceId: string): Promise<WorkspaceMetadata> {
  return invoke('get_workspace', { workspaceId });
}

export async function getRecentWorkspaces(limit?: number): Promise<WorkspaceMetadata[]> {
  return invoke('get_recent_workspaces', { limit });
}

export async function updateWorkspace(
  workspaceId: string,
  name?: string,
  gitRemote?: string
): Promise<void> {
  return invoke('update_workspace', { workspaceId, name, gitRemote });
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  return invoke('delete_workspace', { workspaceId });
}

export async function openWorkspace(workspaceId: string): Promise<WorkspaceMetadata> {
  return invoke('open_workspace', { workspaceId });
}

export async function closeWorkspace(workspaceId: string): Promise<void> {
  return invoke('close_workspace', { workspaceId });
}

export async function getWorkspaceStats(workspaceId: string): Promise<WorkspaceDbStats> {
  return invoke('get_workspace_stats', { workspaceId });
}

// ============================================
// Workspace Maintenance
// ============================================

export async function backupWorkspace(
  workspaceId: string,
  backupPath: string
): Promise<void> {
  return invoke('backup_workspace', { workspaceId, backupPath });
}

export async function restoreWorkspace(
  workspaceId: string,
  backupPath: string
): Promise<void> {
  return invoke('restore_workspace', { workspaceId, backupPath });
}

export async function vacuumWorkspace(workspaceId: string): Promise<void> {
  return invoke('vacuum_workspace', { workspaceId });
}

export async function cleanupExpiredMemory(workspaceId: string): Promise<number> {
  return invoke('cleanup_expired_memory', { workspaceId });
}

export async function optimizeWorkspace(workspaceId: string): Promise<void> {
  return invoke('optimize_workspace', { workspaceId });
}

// ============================================
// App Settings
// ============================================

export async function getAppSetting(key: string): Promise<string | null> {
  return invoke('get_app_setting', { key });
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  return invoke('set_app_setting', { key, value });
}

// ============================================
// Job Operations
// ============================================

export async function createJob(
  workspaceId: string,
  name: string,
  description?: string,
  branchName?: string,
  parentJobId?: string
): Promise<Job> {
  return invoke('create_job', {
    workspaceId,
    name,
    description,
    branchName,
    parentJobId,
  });
}

export async function getJob(workspaceId: string, jobId: string): Promise<Job> {
  return invoke('get_job', { workspaceId, jobId });
}

export async function listJobs(
  workspaceId: string,
  status?: string
): Promise<Job[]> {
  return invoke('list_jobs', { workspaceId, status });
}

export async function updateJobStatus(
  workspaceId: string,
  jobId: string,
  status: string
): Promise<void> {
  return invoke('update_job_status', { workspaceId, jobId, status });
}

export async function deleteJob(workspaceId: string, jobId: string): Promise<void> {
  return invoke('delete_job', { workspaceId, jobId });
}

// ============================================
// Task Operations
// ============================================

export async function createTask(
  workspaceId: string,
  jobId: string,
  title: string,
  description?: string,
  priority?: number,
  estimatedMinutes?: number,
  assignee?: string
): Promise<Task> {
  return invoke('create_task', {
    workspaceId,
    jobId,
    title,
    description,
    priority,
    estimatedMinutes,
    assignee,
  });
}

export async function listTasks(workspaceId: string, jobId: string): Promise<Task[]> {
  return invoke('list_tasks', { workspaceId, jobId });
}

export async function updateTaskStatus(
  workspaceId: string,
  taskId: string,
  status: string
): Promise<void> {
  return invoke('update_task_status', { workspaceId, taskId, status });
}

// ============================================
// Chat Session Operations
// ============================================

export async function createChatSession(
  workspaceId: string,
  jobId?: string,
  title?: string,
  sessionType?: string,
  modelId?: string
): Promise<ChatSession> {
  return invoke('create_chat_session', {
    workspaceId,
    jobId,
    title,
    sessionType,
    modelId,
  });
}

export async function listChatSessions(
  workspaceId: string,
  jobId?: string
): Promise<ChatSession[]> {
  return invoke('list_chat_sessions', { workspaceId, jobId });
}

export async function addChatMessage(
  workspaceId: string,
  sessionId: string,
  role: string,
  content: string,
  toolCallsJson?: string,
  toolResultsJson?: string,
  modelId?: string,
  tokensInput?: number,
  tokensOutput?: number,
  latencyMs?: number
): Promise<ChatMessage> {
  return invoke('add_chat_message', {
    workspaceId,
    sessionId,
    role,
    content,
    toolCallsJson,
    toolResultsJson,
    modelId,
    tokensInput,
    tokensOutput,
    latencyMs,
  });
}

export async function getChatMessages(
  workspaceId: string,
  sessionId: string,
  limit?: number
): Promise<ChatMessage[]> {
  return invoke('get_chat_messages', { workspaceId, sessionId, limit });
}

// ============================================
// Knowledge Operations
// ============================================

export async function createKnowledge(
  workspaceId: string,
  knowledgeType: string,
  title: string,
  content: string,
  tags?: string[],
  fileRefs?: string[],
  source?: string,
  createdBy?: string
): Promise<Knowledge> {
  return invoke('create_knowledge', {
    workspaceId,
    knowledgeType,
    title,
    content,
    tags,
    fileRefs,
    source,
    createdBy,
  });
}

export async function searchKnowledge(
  workspaceId: string,
  query: string,
  limit?: number
): Promise<Knowledge[]> {
  return invoke('search_knowledge', { workspaceId, query, limit });
}

export async function listKnowledge(
  workspaceId: string,
  knowledgeType?: string
): Promise<Knowledge[]> {
  return invoke('list_knowledge', { workspaceId, knowledgeType });
}

// ============================================
// Memory Operations
// ============================================

export async function createMemoryLong(
  workspaceId: string,
  category: string,
  title: string,
  content: string,
  source?: string,
  confidence?: number
): Promise<MemoryLong> {
  return invoke('create_memory_long', {
    workspaceId,
    category,
    title,
    content,
    source,
    confidence,
  });
}

export async function getRelevantMemories(
  workspaceId: string,
  category?: string,
  limit?: number
): Promise<MemoryLong[]> {
  return invoke('get_relevant_memories', { workspaceId, category, limit });
}

export async function incrementMemoryAccess(
  workspaceId: string,
  memoryId: number
): Promise<void> {
  return invoke('increment_memory_access', { workspaceId, memoryId });
}

// ============================================
// Workspace Context Hook
// ============================================



interface WorkspaceContextType {
  currentWorkspace: WorkspaceMetadata | null;
  workspaces: WorkspaceMetadata[];
  loading: boolean;
  error: string | null;
  setCurrentWorkspace: (workspace: WorkspaceMetadata | null) => void;
  refreshWorkspaces: () => Promise<void>;
  createNewWorkspace: (name: string, gitRemote?: string) => Promise<WorkspaceMetadata>;
  deleteCurrentWorkspace: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceMetadata | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshWorkspaces = async () => {
    try {
      setLoading(true);
      const list = await listWorkspaces();
      setWorkspaces(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  };

  const createNewWorkspace = async (name: string, gitRemote?: string) => {
    const workspace = await createWorkspace(name, gitRemote);
    await refreshWorkspaces();
    setCurrentWorkspace(workspace);
    return workspace;
  };

  const deleteCurrentWorkspace = async () => {
    if (!currentWorkspace) return;
    await deleteWorkspace(currentWorkspace.id);
    setCurrentWorkspace(null);
    await refreshWorkspaces();
  };

  useEffect(() => {
    refreshWorkspaces();
  }, []);

  // Auto-select most recent workspace
  useEffect(() => {
    if (!currentWorkspace && workspaces.length > 0) {
      setCurrentWorkspace(workspaces[0]);
    }
  }, [workspaces, currentWorkspace]);

  return (
    <WorkspaceContext.Provider
      value={{
        currentWorkspace,
        workspaces,
        loading,
        error,
        setCurrentWorkspace,
        refreshWorkspaces,
        createNewWorkspace,
        deleteCurrentWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}

// ============================================
// Helper Functions
// ============================================

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    active: 'text-green-500',
    pending: 'text-yellow-500',
    in_progress: 'text-blue-500',
    completed: 'text-gray-500',
    blocked: 'text-red-500',
    cancelled: 'text-gray-400',
    paused: 'text-orange-500',
    archived: 'text-gray-300',
  };
  return colors[status] || 'text-gray-500';
}

export function getStatusBadgeColor(status: string): string {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    in_progress: 'bg-blue-100 text-blue-800',
    completed: 'bg-gray-100 text-gray-800',
    blocked: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-400',
    paused: 'bg-orange-100 text-orange-800',
    archived: 'bg-gray-100 text-gray-300',
  };
  return colors[status] || 'bg-gray-100 text-gray-500';
}
