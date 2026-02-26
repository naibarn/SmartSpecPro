/**
 * Maps internal sandbox job status values to user-friendly display labels.
 * Stateless, pure function -- no I/O, no side effects.
 */

export type SandboxInternalStatus =
  | "accepted"
  | "policy_resolved"
  | "queued"
  | "provisioning"
  | "staging_inputs"
  | "executing"
  | "collecting_outputs"
  | "persisting"
  | "completed"
  | "failed"
  | "timed_out"
  | "canceled";

export interface StatusProjection {
  /** User-facing label */
  label: string;
  /** Phase grouping */
  phase: "pending" | "active" | "finishing" | "terminal";
  /** Whether this is a final state (no further transitions) */
  isTerminal: boolean;
}

const STATUS_MAP: Record<string, StatusProjection> = {
  accepted: { label: "Queued", phase: "pending", isTerminal: false },
  policy_resolved: { label: "Queued", phase: "pending", isTerminal: false },
  queued: { label: "Queued", phase: "pending", isTerminal: false },
  provisioning: { label: "Preparing secure workspace", phase: "active", isTerminal: false },
  staging_inputs: { label: "Preparing secure workspace", phase: "active", isTerminal: false },
  executing: { label: "Running securely", phase: "active", isTerminal: false },
  collecting_outputs: { label: "Collecting results", phase: "finishing", isTerminal: false },
  persisting: { label: "Collecting results", phase: "finishing", isTerminal: false },
  completed: { label: "Completed", phase: "terminal", isTerminal: true },
  failed: { label: "Failed", phase: "terminal", isTerminal: true },
  timed_out: { label: "Timed out", phase: "terminal", isTerminal: true },
  canceled: { label: "Canceled", phase: "terminal", isTerminal: true },
};

const UNKNOWN: StatusProjection = { label: "Unknown", phase: "pending", isTerminal: false };

export function projectStatus(status: SandboxInternalStatus): StatusProjection {
  return STATUS_MAP[status] ?? UNKNOWN;
}
