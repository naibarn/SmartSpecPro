export type AgencyNodeType =
  | "agent"
  | "supervisor"
  | "router"
  | "aggregator"
  | "knowledge_base"
  | "skill_call"
  | "human_approval";

export interface AgencyNodeData {
  nodeType: AgencyNodeType;
  name: string;
  description?: string;
  instructions?: string;
  model?: string;
  modelSettings?: { max_tokens?: number; temperature?: number; top_p?: number };
  isEntryPoint?: boolean;
  isOptional?: boolean;
  tools?: Array<{ toolId: string; toolName: string; toolConfig?: Record<string, unknown> }>;
  nodeConfig?: Record<string, unknown>;
  validationErrors?: string[];
}
