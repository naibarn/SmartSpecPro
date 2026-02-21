/**
 * Execution State Store (Zustand)
 *
 * Manages workflow execution lifecycle, node statuses, and execution logs.
 * Integrates with SSE stream for real-time updates.
 */

import { create } from "zustand";

export type ExecutionStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface LogEntry {
  id: string;
  timestamp: number; // milliseconds since epoch
  nodeId: string;
  nodeName: string;
  eventType:
    | "node_start"
    | "node_complete"
    | "node_error"
    | "workflow_complete"
    | "workflow_error"
    | "approval_required";
  status: ExecutionStatus;
  duration?: number; // milliseconds
  output?: Record<string, unknown>;
  error?: string;
  approvalData?: {
    approval_id: string;
    message: string;
    approval_type: "approve_reject" | "decision" | "input";
    options?: string[];
    timeout_minutes?: number;
    data?: unknown;
  };
}

export interface NodeStatus {
  status: ExecutionStatus;
  startTime?: number;
  endTime?: number;
  output?: Record<string, unknown>;
  error?: string;
}

interface ExecutionState {
  // Execution context
  isExecuting: boolean;
  executionId: string | null;

  // Node statuses
  nodeStatuses: Record<string, NodeStatus>;

  // Execution log
  logs: LogEntry[];

  // Actions
  startExecution: (executionId: string) => void;
  updateNodeStatus: (nodeId: string, statusUpdate: Partial<NodeStatus>) => void;
  addLog: (entry: LogEntry) => void;
  completeExecution: () => void;
  resetExecution: () => void;

  // Selectors
  getNodeStatus: (nodeId: string) => ExecutionStatus;
  getLogs: () => LogEntry[];
  canExecute: () => boolean;
}

export const useExecutionStore = create<ExecutionState>((set, get) => ({
  // Initial state
  isExecuting: false,
  executionId: null,
  nodeStatuses: {},
  logs: [],

  // Actions
  startExecution: (executionId: string) => {
    set({
      isExecuting: true,
      executionId,
      nodeStatuses: {},
      logs: [],
    });
  },

  updateNodeStatus: (nodeId: string, statusUpdate: Partial<NodeStatus>) => {
    set((state) => ({
      nodeStatuses: {
        ...state.nodeStatuses,
        [nodeId]: {
          ...state.nodeStatuses[nodeId],
          ...statusUpdate,
        },
      },
    }));
  },

  addLog: (entry: LogEntry) => {
    set((state) => ({
      logs: [...state.logs, entry],
    }));
  },

  completeExecution: () => {
    set({
      isExecuting: false,
    });
  },

  resetExecution: () => {
    set({
      isExecuting: false,
      executionId: null,
      nodeStatuses: {},
      logs: [],
    });
  },

  // Selectors
  getNodeStatus: (nodeId: string) => {
    const status = get().nodeStatuses[nodeId];
    return status?.status || "pending";
  },

  getLogs: () => {
    return get().logs;
  },

  canExecute: () => {
    return !get().isExecuting;
  },
}));
