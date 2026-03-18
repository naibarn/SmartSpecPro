export { SYSTEM_USER_ID, SYSTEM_USER_EMAIL } from "@shared/virtualAdmin/types";
export type { IncidentSeverity, IncidentStatus, ApprovalStatus, TicketType, TicketStatus, TicketResolution } from "@shared/virtualAdmin/types";

export interface SensorReading {
  sensorId: string;
  timestamp: Date;
  status: "healthy" | "degraded" | "critical" | "unknown";
  metrics: Record<string, number | string>;
  message: string;
  tenantId?: string;
}

export interface Sensor {
  id: string;
  name: string;
  defaultIntervalMs: number;
  category: "system" | "per_tenant" | "cross_system";
  collect(tenantId?: string): Promise<SensorReading>;
}

export interface SensorConfig {
  id: string;
  tenantId: string;
  sensorId: string;
  enabled: boolean;
  intervalMs: number | null;
  thresholdsJson: Record<string, unknown> | null;
  updatedAt: Date;
}

export interface ActionPlan {
  autoFix?: { type: string; params: Record<string, unknown> };
  notify: { channels: ("in_app" | "email" | "slack" | "telegram")[] };
  requiresApproval?: boolean;
}

export interface IncidentRule {
  id: string;
  sensorId: string;
  condition: (reading: SensorReading) => boolean;
  severity: "info" | "warning" | "error" | "critical";
  actionPlan: ActionPlan;
  cooldownMs: number;
}

export type ActionType =
  | "retry_failed_job" | "cleanup_temp_files" | "clear_stale_cache" | "failover_provider"
  | "notify_admin" | "notify_user" | "notify_slack"
  | "pause_queue" | "restart_celery_worker" | "disable_provider" | "kill_stuck_task" | "emergency_maintenance";

export interface ActuatorResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export type ActuatorFn = (
  params: Record<string, unknown>,
  incident: { id: number; tenantId?: string | null; severity: string },
) => Promise<ActuatorResult>;

export const APPROVAL_REQUIRED_ACTIONS = new Set<string>([
  "pause_queue", "restart_celery_worker", "disable_provider", "kill_stuck_task", "emergency_maintenance",
]);

export const APPROVAL_TTL = {
  critical: 4 * 60 * 60 * 1000,
  default: 24 * 60 * 60 * 1000,
};
