// ========================================
// Common Types
// ========================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

// ========================================
// User & Auth Types
// ========================================

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = "admin" | "user" | "viewer";

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  expiresAt: number | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ========================================
// Workspace Types
// ========================================

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string;
  settings: WorkspaceSettings;
}

export interface WorkspaceSettings {
  theme?: "light" | "dark" | "system";
  defaultModel?: string;
  autoSave?: boolean;
  [key: string]: unknown;
}

export interface WorkspaceStats {
  jobsCount: number;
  tasksCount: number;
  chatSessionsCount: number;
  knowledgeCount: number;
  memoryCount: number;
  databaseSize: number;
}

// ========================================
// Job & Task Types
// ========================================

export interface Job {
  id: string;
  workspaceId: string;
  title: string;
  description?: string;
  status: JobStatus;
  priority: Priority;
  branch?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  tasks: Task[];
}

export type JobStatus = "pending" | "in_progress" | "completed" | "cancelled" | "failed";

export type Priority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: string;
  jobId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  order: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export type TaskStatus = "todo" | "in_progress" | "done" | "blocked";

// ========================================
// Chat & LLM Types
// ========================================

export interface ChatSession {
  id: string;
  workspaceId: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  model?: string;
  tokens?: number;
  createdAt: string;
}

export type MessageRole = "user" | "assistant" | "system";

export interface LLMModel {
  id: string;
  name: string;
  provider: LLMProvider;
  contextLength: number;
  inputCost: number;
  outputCost: number;
  capabilities: string[];
}

export type LLMProvider = "openrouter" | "openai" | "anthropic" | "deepseek" | "google";

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

// ========================================
// Knowledge & Memory Types
// ========================================

export interface Knowledge {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Memory {
  id: string;
  workspaceId: string;
  type: MemoryType;
  content: string;
  importance: number;
  accessCount: number;
  expiresAt?: string;
  createdAt: string;
  lastAccessedAt: string;
}

export type MemoryType = "short_term" | "working" | "long_term";

// ========================================
// Template Types
// ========================================

export interface Template {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  icon: string;
  tags: string[];
  variables: TemplateVariable[];
  files: TemplateFile[];
}

export type TemplateCategory = 
  | "web_app"
  | "mobile_app"
  | "api"
  | "cli"
  | "library"
  | "ecommerce"
  | "saas"
  | "other";

export interface TemplateVariable {
  name: string;
  label: string;
  type: "string" | "number" | "boolean" | "select";
  default?: string | number | boolean;
  required?: boolean;
  options?: SelectOption[];
}

export interface TemplateFile {
  path: string;
  content: string;
  isTemplate: boolean;
}

// ========================================
// Spec Builder Types
// ========================================

export interface Spec {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  components: SpecComponent[];
  connections: SpecConnection[];
  createdAt: string;
  updatedAt: string;
}

export interface SpecComponent {
  id: string;
  type: ComponentType;
  title: string;
  description?: string;
  properties: Record<string, unknown>;
  position: { x: number; y: number };
}

export type ComponentType =
  | "feature"
  | "user_story"
  | "api_endpoint"
  | "database_table"
  | "ui_component"
  | "service"
  | "integration"
  | "note";

export interface SpecConnection {
  id: string;
  sourceId: string;
  targetId: string;
  type: ConnectionType;
  label?: string;
}

export type ConnectionType = "depends_on" | "implements" | "uses" | "extends";

// ========================================
// Plugin Types
// ========================================

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  repository?: string;
  license?: string;
  permissions: string[];
  entrypoint: string;
}

// ========================================
// Marketplace Types
// ========================================

export interface MarketplaceItem {
  id: string;
  type: MarketplaceItemType;
  name: string;
  description: string;
  author: string;
  version: string;
  downloads: number;
  rating: number;
  ratingCount: number;
  price: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type MarketplaceItemType = "plugin" | "template" | "theme";

// ========================================
// Notification Types
// ========================================

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  actionUrl?: string;
  createdAt: string;
}

export type NotificationType = "info" | "success" | "warning" | "error";

// ========================================
// Performance Types
// ========================================

export interface PerformanceMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkLatency: number;
  cacheHitRate: number;
  activeConnections: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
  hitRate: number;
}

// ========================================
// Rate Limit Types
// ========================================

export interface RateLimitStatus {
  provider: LLMProvider;
  requestsRemaining: number;
  requestsLimit: number;
  tokensRemaining: number;
  tokensLimit: number;
  resetAt: string;
  costToday: number;
  costLimit: number;
}

// ========================================
// Enterprise Types
// ========================================

export interface SSOConfig {
  provider: SSOProvider;
  clientId: string;
  issuer: string;
  enabled: boolean;
}

export type SSOProvider = "saml" | "oidc" | "azure_ad" | "okta" | "google" | "github";

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
}

export interface Permission {
  resource: string;
  actions: string[];
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  details: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

// ========================================
// Utility Types
// ========================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Nullable<T> = T | null;

export type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};
