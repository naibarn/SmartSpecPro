// Database model types matching Rust backend

export type ExecutionStatus = "running" | "completed" | "failed" | "stopped";

export type ConfigValueType = "string" | "number" | "boolean" | "json";

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  version: string;
  config?: Record<string, any>;
  created_at: number;
  updated_at: number;
}

export interface CreateWorkflowRequest {
  name: string;
  description?: string;
  config?: Record<string, any>;
}

export interface UpdateWorkflowRequest {
  name?: string;
  description?: string;
  config?: Record<string, any>;
}

export interface Execution {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: ExecutionStatus;
  output?: Record<string, any>;
  error?: string;
  started_at: number;
  completed_at?: number;
}

export interface Config {
  id: string;
  workflow_id: string;
  key: string;
  value: string;
  value_type: ConfigValueType;
  description?: string;
  created_at: number;
  updated_at: number;
}

export interface WorkflowFilter {
  name?: string;
  limit?: number;
  offset?: number;
}

export interface ExecutionFilter {
  workflow_id?: string;
  status?: ExecutionStatus;
  limit?: number;
  offset?: number;
}

export interface DatabaseStats {
  workflow_count: number;
  execution_count: number;
  config_count: number;
}
