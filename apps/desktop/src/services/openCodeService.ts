/**
 * OpenCode Service - Frontend service for OpenCode/OpenWork integration
 * 
 * Phase 2: Desktop App Integration
 * 
 * Provides:
 * - Server management (start/stop)
 * - Session management
 * - API key management
 * - LLM Gateway integration
 * - Usage tracking
 */

import { invoke } from '@tauri-apps/api/core';

// ============================================
// Types
// ============================================

export interface OpenCodeConfig {
  api_key: string | null;
  server_port: number;
  backend_url: string;
  workspace_path: string | null;
  auto_start: boolean;
  default_model: string;
}

export interface OpenCodeSession {
  id: string;
  workspace_id: string;
  workspace_path: string;
  started_at: string;
  model: string;
  status: SessionStatus;
  tokens_used: number;
  cost: number;
}

export type SessionStatus = 'Active' | 'Paused' | 'Stopped' | 'Error';

export interface ServerStatus {
  running: boolean;
  port: number;
  pid: number | null;
  uptime_seconds: number | null;
  active_sessions: number;
  total_requests: number;
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  is_active: boolean;
}

export interface ApiKeyCreateResponse {
  id: string;
  name: string;
  key: string; // Full key - only shown once!
  key_prefix: string;
  created_at: string;
  expires_at: string | null;
}

export interface UsageStats {
  total_tokens: number;
  total_cost: number;
  requests_count: number;
  by_model: Record<string, ModelUsage>;
}

export interface ModelUsage {
  tokens: number;
  cost: number;
  requests: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: {
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ModelInfo {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface ConnectionInfo {
  endpoint: string;
  port: number;
  has_api_key: boolean;
  server_running: boolean;
  default_model: string;
}

export interface HealthStatus {
  status: 'ok' | 'error' | 'offline';
  service?: string;
  version?: string;
  timestamp?: string;
  error?: string;
}

// ============================================
// Server Management
// ============================================

/**
 * Start the OpenCode server
 */
export async function startServer(): Promise<ServerStatus> {
  return invoke<ServerStatus>('opencode_start_server');
}

/**
 * Stop the OpenCode server
 */
export async function stopServer(): Promise<void> {
  return invoke('opencode_stop_server');
}

/**
 * Get current server status
 */
export async function getServerStatus(): Promise<ServerStatus> {
  return invoke<ServerStatus>('opencode_get_server_status');
}

/**
 * Check if server is running
 */
export async function isServerRunning(): Promise<boolean> {
  const status = await getServerStatus();
  return status.running;
}

// ============================================
// Configuration
// ============================================

/**
 * Get OpenCode configuration
 */
export async function getConfig(): Promise<OpenCodeConfig> {
  return invoke<OpenCodeConfig>('opencode_get_config');
}

/**
 * Update OpenCode configuration
 */
export async function setConfig(config: OpenCodeConfig): Promise<void> {
  return invoke('opencode_set_config', { config });
}

/**
 * Set API key
 */
export async function setApiKey(apiKey: string): Promise<void> {
  return invoke('opencode_set_api_key', { apiKey });
}

/**
 * Update specific config fields
 */
export async function updateConfig(updates: Partial<OpenCodeConfig>): Promise<void> {
  const current = await getConfig();
  const updated = { ...current, ...updates };
  return setConfig(updated);
}

// ============================================
// Session Management
// ============================================

/**
 * Create a new OpenCode session for a workspace
 */
export async function createSession(
  workspaceId: string,
  workspacePath: string
): Promise<OpenCodeSession> {
  return invoke<OpenCodeSession>('opencode_create_session', {
    workspaceId,
    workspacePath,
  });
}

/**
 * Get session by ID
 */
export async function getSession(sessionId: string): Promise<OpenCodeSession | null> {
  return invoke<OpenCodeSession | null>('opencode_get_session', { sessionId });
}

/**
 * List all sessions, optionally filtered by workspace
 */
export async function listSessions(workspaceId?: string): Promise<OpenCodeSession[]> {
  return invoke<OpenCodeSession[]>('opencode_list_sessions', { workspaceId });
}

/**
 * Stop a session
 */
export async function stopSession(sessionId: string): Promise<void> {
  return invoke('opencode_stop_session', { sessionId });
}

/**
 * Set model for a session
 */
export async function setSessionModel(sessionId: string, model: string): Promise<void> {
  return invoke('opencode_set_session_model', { sessionId, model });
}

/**
 * Get active session for a workspace
 */
export async function getActiveSession(workspaceId: string): Promise<OpenCodeSession | null> {
  const sessions = await listSessions(workspaceId);
  return sessions.find(s => s.status === 'Active') || null;
}

// ============================================
// API Key Management
// ============================================

/**
 * Create a new API key
 * Note: The full key is only returned once!
 */
export async function createApiKey(
  name: string,
  authToken: string
): Promise<ApiKeyCreateResponse> {
  return invoke<ApiKeyCreateResponse>('opencode_create_api_key', {
    name,
    authToken,
  });
}

/**
 * List all API keys
 */
export async function listApiKeys(authToken: string): Promise<ApiKeyInfo[]> {
  return invoke<ApiKeyInfo[]>('opencode_list_api_keys', { authToken });
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(keyId: string, authToken: string): Promise<void> {
  return invoke('opencode_revoke_api_key', { keyId, authToken });
}

// ============================================
// Usage & Stats
// ============================================

/**
 * Get usage statistics
 */
export async function getUsage(authToken: string): Promise<UsageStats> {
  return invoke<UsageStats>('opencode_get_usage', { authToken });
}

/**
 * Get session usage
 */
export async function getSessionUsage(sessionId: string): Promise<{
  session_id: string;
  tokens_used: number;
  cost: number;
  model: string;
  status: SessionStatus;
}> {
  return invoke('opencode_get_session_usage', { sessionId });
}

// ============================================
// LLM Gateway Integration
// ============================================

/**
 * Send a chat completion request
 */
export async function chatCompletion(
  sessionId: string,
  messages: ChatMessage[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<ChatCompletionResponse> {
  return invoke<ChatCompletionResponse>('opencode_chat_completion', {
    sessionId,
    messages,
    model: options?.model,
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
  });
}

/**
 * Get available models
 */
export async function getModels(): Promise<ModelInfo[]> {
  return invoke<ModelInfo[]>('opencode_get_models');
}

/**
 * Check gateway health
 */
export async function checkHealth(): Promise<HealthStatus> {
  return invoke<HealthStatus>('opencode_check_health');
}

// ============================================
// CLI Configuration
// ============================================

/**
 * Generate CLI configuration for external tools
 */
export async function generateCliConfig(): Promise<string> {
  return invoke<string>('opencode_generate_cli_config');
}

/**
 * Get connection info for OpenCode CLI
 */
export async function getConnectionInfo(): Promise<ConnectionInfo> {
  return invoke<ConnectionInfo>('opencode_get_connection_info');
}

// ============================================
// Utility Functions
// ============================================

/**
 * Format cost for display
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(6)}`;
  }
  return `$${cost.toFixed(4)}`;
}

/**
 * Format tokens for display
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(2)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Get model display name
 */
export function getModelDisplayName(modelId: string): string {
  const modelNames: Record<string, string> = {
    'anthropic/claude-3.5-sonnet': 'Claude 3.5 Sonnet',
    'anthropic/claude-3-opus': 'Claude 3 Opus',
    'anthropic/claude-3-haiku': 'Claude 3 Haiku',
    'openai/gpt-4o': 'GPT-4o',
    'openai/gpt-4o-mini': 'GPT-4o Mini',
    'deepseek/deepseek-chat': 'Deepseek Chat',
    'deepseek/deepseek-coder': 'Deepseek Coder',
    'google/gemini-pro-1.5': 'Gemini Pro 1.5',
    'google/gemini-flash-1.5': 'Gemini Flash 1.5',
  };
  return modelNames[modelId] || modelId;
}

/**
 * Calculate estimated cost for tokens
 */
export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs: Record<string, { input: number; output: number }> = {
    'anthropic/claude-3.5-sonnet': { input: 0.003, output: 0.015 },
    'anthropic/claude-3-opus': { input: 0.015, output: 0.075 },
    'anthropic/claude-3-haiku': { input: 0.00025, output: 0.00125 },
    'openai/gpt-4o': { input: 0.005, output: 0.015 },
    'openai/gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'deepseek/deepseek-chat': { input: 0.00014, output: 0.00028 },
    'deepseek/deepseek-coder': { input: 0.00014, output: 0.00028 },
    'google/gemini-pro-1.5': { input: 0.00125, output: 0.005 },
    'google/gemini-flash-1.5': { input: 0.000075, output: 0.0003 },
  };
  
  const modelCosts = costs[modelId] || { input: 0.001, output: 0.002 };
  return (inputTokens * modelCosts.input + outputTokens * modelCosts.output) / 1000;
}

// ============================================
// OpenCode Service Class
// ============================================

/**
 * OpenCode Service singleton for managing state
 */
class OpenCodeServiceClass {
  private currentSession: OpenCodeSession | null = null;
  private serverStatus: ServerStatus | null = null;
  private healthCheckInterval: number | null = null;
  
  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    this.serverStatus = await getServerStatus();
    
    // Start health check interval
    this.startHealthCheck();
  }
  
  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.healthCheckInterval = window.setInterval(async () => {
      try {
        this.serverStatus = await getServerStatus();
      } catch (error) {
        console.error('Health check failed:', error);
      }
    }, 30000); // Every 30 seconds
  }
  
  /**
   * Stop health checks
   */
  stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
  
  /**
   * Get current session
   */
  getCurrentSession(): OpenCodeSession | null {
    return this.currentSession;
  }
  
  /**
   * Set current session
   */
  setCurrentSession(session: OpenCodeSession | null): void {
    this.currentSession = session;
  }
  
  /**
   * Get cached server status
   */
  getCachedServerStatus(): ServerStatus | null {
    return this.serverStatus;
  }
  
  /**
   * Quick send message (convenience method)
   */
  async sendMessage(
    content: string,
    options?: {
      systemPrompt?: string;
      model?: string;
      temperature?: number;
    }
  ): Promise<string> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }
    
    const messages: ChatMessage[] = [];
    
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    
    messages.push({ role: 'user', content });
    
    const response = await chatCompletion(this.currentSession.id, messages, {
      model: options?.model,
      temperature: options?.temperature,
    });
    
    return response.choices[0]?.message?.content || '';
  }
  
  /**
   * Cleanup
   */
  cleanup(): void {
    this.stopHealthCheck();
    this.currentSession = null;
    this.serverStatus = null;
  }
}

// Export singleton instance
export const openCodeService = new OpenCodeServiceClass();

// Export all functions and types
export default {
  // Server Management
  startServer,
  stopServer,
  getServerStatus,
  isServerRunning,
  
  // Configuration
  getConfig,
  setConfig,
  setApiKey,
  updateConfig,
  
  // Session Management
  createSession,
  getSession,
  listSessions,
  stopSession,
  setSessionModel,
  getActiveSession,
  
  // API Key Management
  createApiKey,
  listApiKeys,
  revokeApiKey,
  
  // Usage & Stats
  getUsage,
  getSessionUsage,
  
  // LLM Gateway
  chatCompletion,
  getModels,
  checkHealth,
  
  // CLI Configuration
  generateCliConfig,
  getConnectionInfo,
  
  // Utilities
  formatCost,
  formatTokens,
  getModelDisplayName,
  estimateCost,
  
  // Service instance
  openCodeService,
};
