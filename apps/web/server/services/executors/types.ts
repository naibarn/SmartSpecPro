import type { FallbackAttempt } from "../skillModelFallback";
import type { SkillDefinition } from "@smartspec/skills";

// ---------------------------------------------------------------------------
// Capability Families
// ---------------------------------------------------------------------------

/** All supported capability families for unified routing. */
export type CapabilityFamily =
  | "writing.article"
  | "writing.review"
  | "media.image"
  | "media.video"
  | "media.audio"
  | "orchestration.swarm"
  | "skill_factory.create";

/** Runtime-iterable list of all capability families. */
export const CAPABILITY_FAMILIES: readonly CapabilityFamily[] = Object.freeze([
  "writing.article",
  "writing.review",
  "media.image",
  "media.video",
  "media.audio",
  "orchestration.swarm",
  "skill_factory.create",
] as const);

// ---------------------------------------------------------------------------
// Credit Mode
// ---------------------------------------------------------------------------

export type CreditMode = "deduct" | "calculate_only" | "skip";
export const DEFAULT_CREDIT_MODE: CreditMode = "deduct";

// ---------------------------------------------------------------------------
// Request Building Blocks
// ---------------------------------------------------------------------------

export interface Attachment {
  type: "image" | "file";
  url: string;
  mimeType?: string;
  name?: string;
}

export interface ConversationContext {
  conversationId?: number;
  conversationModel?: string;
  activePersonaId?: string | null;
  publicUrl?: string;
}

export interface TeamContext {
  assistantId: string;
  roomId: string;
  teamId: string;
  runId?: string;
  objective: string;
  initiatedByUserId?: number;
  currentMessage?: string;
  memoryMode?: "full" | "no_long" | "off";
}

export interface RouteHint {
  selectedSkillId?: string;
  route: "chat" | "skill" | "agency" | "hybrid";
  reason: string;
  confidence?: number;
}

// ---------------------------------------------------------------------------
// Unified Request / Result
// ---------------------------------------------------------------------------

export interface UnifiedExecutionRequest {
  channel: "chat" | "team_room";
  userId: number;
  tenantId: string;
  userMessage: string;
  attachments?: Attachment[];
  dynamicParams?: Record<string, unknown>;
  conversationContext?: ConversationContext;
  teamContext?: TeamContext;
  routeHint?: RouteHint;
  creditMode?: CreditMode;
  capabilitiesAllowed?: CapabilityFamily[];
  traceId?: string;
}

export interface RouteDecision {
  capability: CapabilityFamily;
  executorId: string;
  reason: string;
}

export interface TextResult {
  type: "text";
  content: string;
}

export interface MediaJobResult {
  type: "media_job";
  mediaType: "image" | "video" | "audio";
  jobPayload: unknown;
}

export interface DelegatedResult {
  type: "delegated";
  target: string;
  payload: unknown;
}

export interface ExecutionTelemetry {
  routerVersion: string;
  policyVersion: string;
  executorId: string;
  attempts: FallbackAttempt[];
  totalDurationMs: number;
}

export interface UnifiedExecutionResult {
  route: RouteDecision;
  result: TextResult | MediaJobResult | DelegatedResult;
  tokens: { input: number; output: number };
  costCredits: number;
  creditsDeducted?: number;
  modelUsed: string | null;
  skillId: string;
  nextSpeakerHint?: string;
  metadata: Record<string, unknown>;
  telemetry: ExecutionTelemetry;
}

// ---------------------------------------------------------------------------
// Executor Interface
// ---------------------------------------------------------------------------

export interface ExecutorInput {
  messages: Array<{ role: string; content: string | unknown[] }>;
  executionPolicy: Record<string, unknown>;
  extraBodyParams?: Record<string, unknown>;
  enableThinking?: boolean;
  dynamicModelOverride?: string;
  dynamicParams?: Record<string, unknown>;
  skill: SkillDefinition;
  skillSlug: string;
  userId: number;
  /** Tenant scope for durable media publication and ownership checks. */
  tenantId?: string;
  channel: "chat" | "team_room";
  traceId?: string;
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface ExecutorResult {
  success: boolean;
  content?: string;
  mediaJob?: { mediaType: "image" | "video" | "audio"; jobPayload: unknown };
  delegated?: { target: string; payload: unknown };
  modelUsed?: string;
  inputTokens: number;
  outputTokens: number;
  attempts: FallbackAttempt[];
  totalDurationMs: number;
  error?: string;
  nextSpeakerHint?: string;
  metadata?: Record<string, unknown>;
}

export interface CapabilityExecutor {
  id: string;
  capabilities: readonly CapabilityFamily[];
  canHandle(route: RouteDecision): boolean;
  execute(input: ExecutorInput): Promise<ExecutorResult>;
}

// ---------------------------------------------------------------------------
// Persistence Hook
// ---------------------------------------------------------------------------

export interface PersistenceContext {
  conversationId?: number;
  roomId?: string;
  runId?: string;
}

export interface PersistenceHook {
  channel: "chat" | "team_room";
  onExecutionComplete(
    result: UnifiedExecutionResult,
    context: PersistenceContext,
  ): Promise<void>;
}

// Re-export for convenience
export type { FallbackAttempt, SkillDefinition };
