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
