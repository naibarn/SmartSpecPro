/** Guardrail UI types — derived from agency_guardrails schema and tRPC router. */

export type GuardrailStrategy =
  | "keyword_block"
  | "regex_match"
  | "llm_classify"
  | "json_schema"
  | "max_length"
  | "pii_detection"
  | "custom_endpoint";

export type GuardrailType = "input" | "output";
export type GuardrailMode = "guidance" | "strict";

export interface KeywordBlockConfig {
  keywords: string[];
}

export interface RegexMatchConfig {
  pattern: string;
  action: "block" | "require";
}

export interface LlmClassifyConfig {
  prompt: string;
  blockIf: string;
  model?: string;
}

export interface JsonSchemaConfig {
  schema: Record<string, unknown>;
}

export interface MaxLengthConfig {
  maxChars: number;
}

export interface PiiDetectionConfig {
  patterns: ("email" | "phone" | "ssn")[];
  action?: "block" | "redact";
}

export interface CustomEndpointConfig {
  endpoint: string;
  timeout?: number;
}

export type GuardrailConfig =
  | KeywordBlockConfig
  | RegexMatchConfig
  | LlmClassifyConfig
  | JsonSchemaConfig
  | MaxLengthConfig
  | PiiDetectionConfig
  | CustomEndpointConfig;

export interface Guardrail {
  id: string;
  tenantId: string;
  agencyId: string;
  name: string;
  type: GuardrailType;
  mode: GuardrailMode;
  strategy: GuardrailStrategy;
  config: Record<string, unknown>;
  validationAttempts: number;
  isEnabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  assignedAgentIds?: string[];
}

export interface GuardrailTestResult {
  passed: boolean;
  message: string;
  action?: string;
  redactedMessage?: string;
}

export const STRATEGY_META: Record<
  GuardrailStrategy,
  { label: string; icon: string; color: string }
> = {
  keyword_block: { label: "Keyword Block", icon: "Ban", color: "text-red-500" },
  regex_match: { label: "Regex Match", icon: "Code", color: "text-blue-500" },
  llm_classify: { label: "LLM Classify", icon: "Brain", color: "text-purple-500" },
  json_schema: { label: "JSON Schema", icon: "FileJson", color: "text-cyan-500" },
  max_length: { label: "Max Length", icon: "Ruler", color: "text-orange-500" },
  pii_detection: { label: "PII Detection", icon: "ShieldAlert", color: "text-amber-500" },
  custom_endpoint: { label: "Custom Endpoint", icon: "Globe", color: "text-green-500" },
};
