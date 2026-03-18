/** System user constants */
export const SYSTEM_USER_ID = -1;
export const SYSTEM_USER_EMAIL = "system-agent@internal";

/** Severity and status types (mirror DB enums for client-side use) */
export type IncidentSeverity = "info" | "warning" | "error" | "critical";
export type IncidentStatus = "open" | "acknowledged" | "resolved" | "expired";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "execution_failed";
export type TicketType = "bug" | "feature_request" | "observation" | "question";
export type TicketStatus = "new" | "triaged" | "in_progress" | "deferred" | "resolved" | "duplicate" | "closed";
export type TicketResolution = "fixed" | "wont_fix" | "duplicate" | "cannot_reproduce" | "planned" | "by_design";
