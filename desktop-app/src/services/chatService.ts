// Chat Service - Frontend service for LLM Chat with Long Memory
//
// Provides:
// - Chat operations with memory integration
// - Model selection and management
// - Skills system
// - Session management

import { invoke } from '@tauri-apps/api/core';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// ============================================
// Types
// ============================================

export interface ShortTermMemory {
  id: number;
  session_id: string;
  role: string;
  content: string;
  tool_calls_json?: string;
  tool_results_json?: string;
  tokens_used?: number;
  model_id?: string;
  created_at: string;
  expires_at?: string;
}

export interface WorkingMemory {
  id: number;
  session_id?: string;
  category: string;
  title: string;
  content: string;
  is_pinned: boolean;
  pin_order: number;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface LongTermMemory {
  id: number;
  category: string;
  title: string;
  content: string;
  tags_json?: string;
  source: string;
  confidence: number;
  access_count: number;
  last_accessed_at?: string;
  embedding_json?: string;
  created_at: string;
  updated_at: string;
}

export interface RetrievedContext {
  memory_type: string;
  id: number;
  title: string;
  content: string;
  relevance_score: number;
  source: string;
}

export interface MemoryStats {
  short_term_count: number;
  working_count: number;
  pinned_count: number;
  long_term_count: number;
  total_tokens: number;
}

export interface LlmModel {
  id: string;
  name: string;
  provider: string;
  context_length: number;
  input_cost_per_1k: number;
  output_cost_per_1k: number;
  supports_vision: boolean;
  supports_tools: boolean;
  supports_streaming: boolean;
}

export interface SkillInfo {
  name: string;
  command: string;
  description: string;
  keywords: string[];
}

export interface ChatSession {
  id: string;
  workspace_id: string;
  title: string;
  skill?: string;
  model_id: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  requires_api_key: boolean;
  supports_fallback: boolean;
}

export interface ProviderConfig {
  provider: string;
  api_key: string;
  enabled: boolean;
  priority: number;
}

export interface LlmServiceConfig {
  providers: ProviderConfig[];
  default_model: string;
  fallback_enabled: boolean;
  openrouter_settings: {
    allow_fallbacks: boolean;
    sort_by: string[];
    app_name: string;
    app_url: string;
  };
}

export interface MediaAttachment {
  type: 'image' | 'video' | 'audio';
  url: string;
  thumbnail_url?: string;
  title?: string;
  model?: string;
}

export interface WorkflowApprovalRequest {
  workflow_id: string;
  artifact_type: string;
  artifact_path: string;
  preview: string;
  next_command: string;
}

export interface WorkflowProgressInfo {
  workflow_id: string;
  workflow_name: string;
  current_step: string;
  progress: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'workflow';
  content: string;
  skill?: string;
  tokens?: number;
  timestamp: Date;
  isStreaming?: boolean;
  attachments?: MediaAttachment[];
  // Workflow-related fields
  workflowApproval?: WorkflowApprovalRequest;
  workflowProgress?: WorkflowProgressInfo;
  workflowLogs?: Array<{ level: string; message: string; timestamp: Date }>;
}

// ============================================
// Memory API Functions
// ============================================

export async function addShortTermMemory(
  workspaceId: string,
  request: {
    session_id: string;
    role: string;
    content: string;
    tool_calls_json?: string;
    tool_results_json?: string;
    tokens_used?: number;
    model_id?: string;
    ttl_minutes?: number;
  }
): Promise<ShortTermMemory> {
  return invoke('add_short_term_memory', { workspaceId, request });
}

export async function getSessionMemory(
  workspaceId: string,
  sessionId: string,
  limit?: number
): Promise<ShortTermMemory[]> {
  return invoke('get_session_memory', { workspaceId, sessionId, limit });
}

export async function clearSessionMemory(
  workspaceId: string,
  sessionId: string
): Promise<number> {
  return invoke('clear_session_memory', { workspaceId, sessionId });
}

export async function addWorkingMemory(
  workspaceId: string,
  request: {
    session_id?: string;
    category: string;
    title: string;
    content: string;
    is_pinned: boolean;
    source: string;
  }
): Promise<WorkingMemory> {
  return invoke('add_working_memory', { workspaceId, request });
}

export async function getPinnedMemory(workspaceId: string): Promise<WorkingMemory[]> {
  return invoke('get_pinned_memory', { workspaceId });
}

export async function pinMemory(
  workspaceId: string,
  memoryId: number,
  pin: boolean
): Promise<void> {
  return invoke('pin_memory', { workspaceId, memoryId, pin });
}

export async function reorderPinnedMemory(
  workspaceId: string,
  memoryIds: number[]
): Promise<void> {
  return invoke('reorder_pinned_memory', { workspaceId, memoryIds });
}

export async function addLongTermMemory(
  workspaceId: string,
  request: {
    category: string;
    title: string;
    content: string;
    tags?: string[];
    source: string;
    confidence?: number;
  }
): Promise<LongTermMemory> {
  return invoke('add_long_term_memory', { workspaceId, request });
}

export async function updateLongTermMemory(
  workspaceId: string,
  memoryId: number,
  updates: {
    title?: string;
    content?: string;
    tags?: string[];
  }
): Promise<void> {
  return invoke('update_long_term_memory', {
    workspaceId,
    memoryId,
    title: updates.title,
    content: updates.content,
    tags: updates.tags,
  });
}

export async function getLongTermMemory(
  workspaceId: string,
  category?: string,
  limit?: number
): Promise<LongTermMemory[]> {
  return invoke('get_long_term_memory', { workspaceId, category, limit });
}

export async function retrieveContext(
  workspaceId: string,
  query: {
    query: string;
    categories?: string[];
    limit?: number;
    include_short_term: boolean;
    include_working: boolean;
    include_long_term: boolean;
    min_relevance?: number;
  }
): Promise<RetrievedContext[]> {
  return invoke('retrieve_context', { workspaceId, query });
}

export async function getMemoryStats(workspaceId: string): Promise<MemoryStats> {
  return invoke('get_memory_stats', { workspaceId });
}

// ============================================
// LLM API Functions
// ============================================

export async function getAvailableModels(): Promise<LlmModel[]> {
  return invoke('get_available_models');
}

export async function getLlmConfig(): Promise<LlmServiceConfig> {
  return invoke('get_llm_config');
}

export async function updateLlmConfig(config: LlmServiceConfig): Promise<void> {
  return invoke('update_llm_config', { config });
}

export async function setModelForMode(mode: string, modelId: string): Promise<void> {
  return invoke('set_model_for_mode', { mode, modelId });
}

export async function getModelForMode(mode: string): Promise<string> {
  return invoke('get_model_for_mode', { mode });
}

export async function estimateTokens(text: string): Promise<number> {
  return invoke('estimate_tokens', { text });
}

export async function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): Promise<number> {
  return invoke('estimate_cost', { modelId, inputTokens, outputTokens });
}

// ============================================
// Skills API Functions
// ============================================

export async function getAvailableSkills(): Promise<SkillInfo[]> {
  return invoke('get_available_skills');
}

export async function detectSkill(message: string): Promise<SkillInfo | null> {
  return invoke('detect_skill', { message });
}

// ============================================
// Provider API Functions
// ============================================

export async function getAvailableProviders(): Promise<ProviderInfo[]> {
  return invoke('get_available_providers');
}

export async function testProviderConnection(
  providerId: string,
  apiKey: string
): Promise<boolean> {
  return invoke('test_provider_connection', { providerId, apiKey });
}

// ============================================
// Chat Context
// ============================================

interface ChatContextValue {
  // Session
  currentSession: ChatSession | null;
  sessions: ChatSession[];
  createSession: (title: string, skill?: string) => Promise<ChatSession>;
  switchSession: (sessionId: string) => void;
  
  // Messages
  messages: ChatMessage[];
  sendMessage: (content: string) => Promise<void>;
  isLoading: boolean;
  
  // Model
  selectedModel: LlmModel | null;
  availableModels: LlmModel[];
  setSelectedModel: (model: LlmModel) => void;
  
  // Memory
  pinnedMemory: WorkingMemory[];
  retrievedContext: RetrievedContext[];
  memoryStats: MemoryStats | null;
  addToKnowledge: (title: string, content: string, category: string) => Promise<void>;
  addMessageWithAttachments: (role: 'user' | 'assistant', content: string, attachments: MediaAttachment[]) => Promise<void>;
  
  // Skills
  skills: SkillInfo[];
  activeSkill: SkillInfo | null;
  setActiveSkill: (skill: SkillInfo | null) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ 
  children, 
  workspaceId 
}: { 
  children: ReactNode; 
  workspaceId: string;
}) {
  // Session state
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  
  // Message state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Model state
  const [selectedModel, setSelectedModel] = useState<LlmModel | null>(null);
  const [availableModels, setAvailableModels] = useState<LlmModel[]>([]);
  
  // Memory state
  const [pinnedMemory, setPinnedMemory] = useState<WorkingMemory[]>([]);
  const [retrievedContext, setRetrievedContext] = useState<RetrievedContext[]>([]);
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
  
  // Skills state
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [activeSkill, setActiveSkill] = useState<SkillInfo | null>(null);

  // Initialize
  useEffect(() => {
    const init = async () => {
      try {
        // Load models
        const models = await getAvailableModels();
        setAvailableModels(models);
        if (models.length > 0) {
          setSelectedModel(models[0]);
        }
        
        // Load skills
        const skillList = await getAvailableSkills();
        setSkills(skillList);
        
        // Load pinned memory
        const pinned = await getPinnedMemory(workspaceId);
        setPinnedMemory(pinned);
        
        // Load memory stats
        const stats = await getMemoryStats(workspaceId);
        setMemoryStats(stats);
      } catch (error) {
        console.error('Failed to initialize chat:', error);
      }
    };
    
    init();
  }, [workspaceId]);

  // Load session messages when session changes
  useEffect(() => {
    if (!currentSession) {
      setMessages([]);
      return;
    }
    
    const loadMessages = async () => {
      try {
        const memory = await getSessionMemory(workspaceId, currentSession.id);
        const msgs: ChatMessage[] = memory.map(m => ({
          id: m.id.toString(),
          role: m.role as 'user' | 'assistant',
          content: m.content,
          tokens: m.tokens_used,
          timestamp: new Date(m.created_at),
        }));
        setMessages(msgs);
      } catch (error) {
        console.error('Failed to load messages:', error);
      }
    };
    
    loadMessages();
  }, [currentSession?.id, workspaceId]);

  const createSession = useCallback(async (title: string, skill?: string): Promise<ChatSession> => {
    const session: ChatSession = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      title,
      skill,
      model_id: selectedModel?.id || 'anthropic/claude-3.5-sonnet',
      message_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    setSessions(prev => [session, ...prev]);
    setCurrentSession(session);
    setMessages([]);
    
    if (skill) {
      const skillInfo = skills.find(s => s.name === skill);
      setActiveSkill(skillInfo || null);
    }
    
    return session;
  }, [workspaceId, selectedModel, skills]);

  const switchSession = useCallback((sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      setCurrentSession(session);
      if (session.skill) {
        const skillInfo = skills.find(s => s.name === session.skill);
        setActiveSkill(skillInfo || null);
      } else {
        setActiveSkill(null);
      }
    }
  }, [sessions, skills]);

  const sendMessage = useCallback(async (content: string) => {
    if (!currentSession || !content.trim()) return;
    
    setIsLoading(true);
    
    // Add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    
    try {
      // Detect skill if not already active
      if (!activeSkill) {
        const detected = await detectSkill(content);
        if (detected) {
          setActiveSkill(detected);
        }
      }
      
      // Retrieve relevant context
      const context = await retrieveContext(workspaceId, {
        query: content,
        include_short_term: false,
        include_working: true,
        include_long_term: true,
        limit: 5,
        min_relevance: 0.3,
      });
      setRetrievedContext(context);
      
      // Save user message to memory
      await addShortTermMemory(workspaceId, {
        session_id: currentSession.id,
        role: 'user',
        content,
        model_id: selectedModel?.id,
      });
      
      // TODO: Call LLM API through backend
      // For now, simulate response
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `[Simulated response] I received your message: "${content}"\n\nRelevant context found: ${context.length} items`,
        skill: activeSkill?.name,
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      // Save assistant message to memory
      await addShortTermMemory(workspaceId, {
        session_id: currentSession.id,
        role: 'assistant',
        content: assistantMessage.content,
        model_id: selectedModel?.id,
      });
      
      // Update memory stats
      const stats = await getMemoryStats(workspaceId);
      setMemoryStats(stats);
      
    } catch (error) {
      console.error('Failed to send message:', error);
      // Add error message
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to process message'}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [currentSession, workspaceId, selectedModel, activeSkill]);

  const addToKnowledge = useCallback(async (
    title: string,
    content: string,
    category: string
  ) => {
    await addLongTermMemory(workspaceId, {
      category,
      title,
      content,
      source: 'chat',
    });
    
    // Refresh memory stats
    const stats = await getMemoryStats(workspaceId);
    setMemoryStats(stats);
  }, [workspaceId]);

  const addMessageWithAttachments = useCallback(async (
    role: 'user' | 'assistant',
    content: string,
    attachments: MediaAttachment[]
  ) => {
    if (!currentSession) return;

    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role,
      content,
      timestamp: new Date(),
      attachments,
    };

    setMessages(prev => [...prev, newMessage]);

    // Save to memory (as JSON in content for now, or we could extend the backend)
    // For simplicity in this phase, we'll just update the local state
    // In a real app, we'd update the backend schema to support attachments
    await addShortTermMemory(workspaceId, {
      session_id: currentSession.id,
      role,
      content: attachments.length > 0 
        ? `${content}\n\n[Media: ${attachments.map(a => a.url).join(', ')}]`
        : content,
      model_id: selectedModel?.id,
    });
  }, [currentSession, workspaceId, selectedModel]);

  const value: ChatContextValue = {
    currentSession,
    sessions,
    createSession,
    switchSession,
    messages,
    sendMessage,
    isLoading,
    selectedModel,
    availableModels,
    setSelectedModel,
    pinnedMemory,
    retrievedContext,
    memoryStats,
    addToKnowledge,
    addMessageWithAttachments,
    skills,
    activeSkill,
    setActiveSkill,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}

// ============================================
// Utility Functions
// ============================================

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

export function getModelDisplayName(model: LlmModel): string {
  return `${model.name} (${formatTokenCount(model.context_length)} ctx)`;
}

export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    decision: '🎯',
    constraint: '⚠️',
    pattern: '🔄',
    learning: '💡',
    reference: '📚',
    project_info: '📁',
    code_context: '💻',
  };
  return icons[category] || '📝';
}

export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    decision: 'blue',
    constraint: 'orange',
    pattern: 'purple',
    learning: 'green',
    reference: 'gray',
    project_info: 'cyan',
    code_context: 'indigo',
  };
  return colors[category] || 'gray';
}
