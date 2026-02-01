export interface WorkflowArgs {
  spec_id: string;
  category: string;
  mode: string;
  platform: string;
}

export interface Workflow {
  name: string;
  description: string;
}

export type OutputMessageType =
  | "started"
  | "log"
  | "progress"
  | "output"
  | "error"
  | "completed"
  | "failed";

export interface OutputMessage {
  type: OutputMessageType;
  workflow_id: string;
  timestamp: string;
  [key: string]: any;
}

export interface StartedMessage extends OutputMessage {
  type: "started";
  workflow_name: string;
}

export interface LogMessage extends OutputMessage {
  type: "log";
  level: string;
  message: string;
}

export interface ProgressMessage extends OutputMessage {
  type: "progress";
  step: string;
  progress: number;
  message: string;
}

export interface OutputContentMessage extends OutputMessage {
  type: "output";
  content: string;
}

export interface ErrorMessage extends OutputMessage {
  type: "error";
  code: string;
  message: string;
}

export interface CompletedMessage extends OutputMessage {
  type: "completed";
  result: any;
}

export interface FailedMessage extends OutputMessage {
  type: "failed";
  error: string;
}

export type WorkflowStatus = "idle" | "running" | "completed" | "failed" | "stopped";

export interface WorkflowExecution {
  id: string;
  name: string;
  status: WorkflowStatus;
  args: WorkflowArgs;
  messages: OutputMessage[];
  startTime?: Date;
  endTime?: Date;
  error?: string;
  result?: any;
}
