export type AgencyNodeType =
  | "agent"
  | "supervisor"
  | "router"
  | "aggregator"
  | "knowledge_base"
  | "skill_call"
  | "human_approval"
  | "browser_session";

export interface AgencyNodeData {
  nodeType: AgencyNodeType;
  name: string;
  description?: string;
  instructions?: string;
  model?: string;
  modelSettings?: { maxTokens?: number; temperature?: number; topP?: number; reasoningEffort?: "minimal" | "low" | "medium" | "high" };
  parallelToolCalls?: boolean;
  maxTurns?: number;
  isEntryPoint?: boolean;
  isOptional?: boolean;
  tools?: Array<{ toolId: string; toolName: string; toolConfig?: Record<string, unknown> }>;
  toolIds?: string[];
  nodeConfig?: Record<string, unknown>;
  guardrailIds?: string[];
  validationErrors?: string[];
}
