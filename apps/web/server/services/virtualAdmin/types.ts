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
