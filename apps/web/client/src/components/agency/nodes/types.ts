import type { Edge, EdgeProps, Node, NodeProps } from "@xyflow/react";

export type AgencyNodeType =
  | "agent"
  | "supervisor"
  | "router"
  | "aggregator"
  | "knowledge_base"
  | "skill_call"
  | "human_approval"
  | "browser_session"
  | "conditional_branch"
  | "parallel_fan_out"
  | "loop_retry"
  | "skill_discovery"
  | "data_transform"
  | "error_handler"
  | "autonomous_agent"
  | "engine_boundary";

export type AgencyCommunicationFlowType =
  | "delegation"
  | "handoff"
  | "parallel";

export interface AgencyNodeData extends Record<string, unknown> {
  nodeType: AgencyNodeType;
  name: string;
  description?: string;
  instructions?: string;
  model?: string;
  modelSettings?: { maxTokens?: number; temperature?: number; topP?: number; reasoningEffort?: "minimal" | "low" | "medium" | "high" };
  modelRequirements?: {
    supportsVision?: boolean;
    supportsThinking?: boolean;
    supportsFunctionTools?: boolean;
    supportsStructuredOutputs?: boolean;
    supportsJsonMode?: boolean;
    supportsStrictToolSchema?: boolean;
    supportsWebSearch?: boolean;
    supportsCodeExecution?: boolean;
    supportsComputerUse?: boolean;
    contextLength?: number;
    strategy?: "cheapest" | "balanced" | "best";
  };
  parallelToolCalls?: boolean;
  maxTurns?: number;
  isEntryPoint?: boolean;
  isOptional?: boolean;
  tools?: Array<{ toolId: string; toolName: string; toolConfig?: Record<string, unknown> }>;
  toolIds?: string[];
  nodeConfig?: Record<string, unknown>;
  guardrailIds?: string[];
  validationErrors?: string[];
  examples?: Array<Array<{ role: "user" | "assistant"; content: string }>>;
  outputSchema?: Record<string, unknown> | null;
  mcpServers?: Array<{ url: string; name?: string; transport?: "http" | "sse" }>;
  subgraphId?: string | null;
  engineHint?: "agency_swarm" | "adk2" | null;
  runtimeConfig?: Record<string, unknown> | null;
}

export type AgencyFlowNode = Node<AgencyNodeData>;
export type AgencyFlowNodeProps = NodeProps<AgencyFlowNode>;

export interface AgencyCommunicationEdgeData extends Record<string, unknown> {
  flowType: AgencyCommunicationFlowType;
}

export type AgencyCommunicationEdge = Edge<
  AgencyCommunicationEdgeData,
  "communication"
>;
export type AgencyCommunicationEdgeProps = EdgeProps<AgencyCommunicationEdge>;
