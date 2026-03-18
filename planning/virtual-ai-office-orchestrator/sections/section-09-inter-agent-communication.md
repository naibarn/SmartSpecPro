# Section 09: Inter-Agent Communication Service

## Overview

Implements the inter-agent communication layer bridging system agents (Virtual Admin Agent / 046) with team agents. Two new tables, service layer, impact assessment engine, escalation protocol, and internal REST endpoints.

**Depends on:** Section 02 (team_runs schema), Section 07 (monitoring/notifications)
**Blocks:** Section 16 (automation/external intake)

**Files to create:**
- `apps/web/drizzle/schema.ts` — add `interAgentMessages` and `systemResourceState` tables + enums
- `apps/web/server/services/interAgentService.ts`
- `apps/web/server/routes/internalOrchestrator.ts` — Express routes for 046 integration
- `apps/web/server/services/__tests__/interAgentService.test.ts`

---

## Tests (Write First)

```typescript
// apps/web/server/services/__tests__/interAgentService.test.ts
describe("interAgentService", () => {
  describe("sendSystemBroadcast", () => {
    it("creates inter_agent_messages for each target room");
    it("injects system message into room timeline");
  });
  describe("assessImpact", () => {
    it("maps provider_down incident to runs using that provider");
    it("maps credit_exhausted to all tenant runs");
    it("returns unaffected for runs not using affected resource");
    it("executes classified actions (notify/degrade/pause/stop)");
  });
  describe("handleTeamEscalation", () => {
    it("creates inter_agent_message with channel=team_escalation");
    it("forwards to 046 API endpoint");
  });
  describe("updateResourceState", () => {
    it("upserts system_resource_state correctly");
  });
  describe("getResourceState", () => {
    it("returns all current states for prompt injection");
  });
  describe("security", () => {
    it("only system agents can use system_control channel");
    it("rate limits at 100 messages/minute per source");
  });
});
```

---

## Schema

### Enums
- `interAgentChannelEnum`: system_broadcast, system_control, team_escalation, system_direct, system_context
- `interAgentSourceTypeEnum`: team, system, external
- `interAgentTargetTypeEnum`: room, run, team, user, all_active_runs
- `interAgentPriorityEnum`: low, normal, high, critical
- `interAgentStatusEnum`: delivered, acknowledged
- `resourceStatusEnum`: healthy, degraded, down, critical

### Table: `inter_agent_messages`
Fields: id (uuid PK), tenantId, channel, sourceAgentType, sourceAgentId, targetType, targetId, priority (default normal), messageType (varchar 64), payload (jsonb), displayMessage (text), actionRequired (bool default false), status (default delivered), acknowledgedAt, expiresAt, relatedIncidentId (nullable int), relatedRunId, relatedRoomId, createdAt.

Indexes: `(targetType, targetId, createdAt DESC)`, `(relatedIncidentId)`, `(relatedRunId)`.

### Table: `system_resource_state`
Fields: id (varchar 64 PK — e.g. "provider:openai"), tenantId (nullable), resourceType (varchar 32), status, stateJson (jsonb), updatedBy (varchar 64), updatedAt.

---

## Service: `interAgentService.ts`

### `sendSystemBroadcast(targetRoomIds, messageType, displayMessage, severity, relatedIncidentId?)`
Creates inter_agent_messages per room. Calls roomService.sendMessage with senderType="system". Publishes SSE event.

### `assessImpact(incidentId, incidentType, affectedResources, recommendedAction)`
1. Load all active team_runs for the tenant
2. For each run, check resource usage (model provider, queue type, storage)
3. Classify: unaffected / degraded / blocked / critical
4. Execute: notify / inject warning / pause / hard-stop
5. Send inter_agent_messages + orchestrator_notifications
6. Return `{ affectedRuns: [{ runId, roomId, impactLevel, actionTaken }], messagesDelivered }`

Impact mapping: llm_provider_down→pause, all_providers_down→hard-stop, credit_exhausted→hard-stop, credit_low→warn, celery_worker_down→notify+queue, queue_depth_critical→throttle, error_rate_spike→caution, disk_95→pause artifacts, db_pool_exhausted→emergency pause.

### `handleTeamEscalation(roomId, runId, assistantId, escalationType, context)`
Creates inter_agent_message (channel=team_escalation), forwards to 046 via `POST /api/internal/virtual-admin/team-escalation`. Returns incidentId + estimatedResponseTime.

### `updateResourceState(resourceId, status, stateJson)`
Upsert into system_resource_state.

### `getResourceState(): SystemResourceState[]`
Returns all current states. Used by promptComposer to inject provider health warnings.

---

## Internal REST API Endpoints

File: `apps/web/server/routes/internalOrchestrator.ts` (Express, not tRPC — internal only)

### `POST /api/internal/orchestrator/system-impact`
Auth: SMARTSPEC_WEB_GATEWAY_TOKEN header.
Request: `{ incidentId, incidentType, severity, affectedResources[], recommendedAction, displayMessage }`
Response: `{ affectedRuns[], messagesDelivered }`

### `POST /api/internal/orchestrator/system-broadcast`
Request: `{ targetRoomIds[], messageType, displayMessage, severity, relatedIncidentId?, autoExpireMinutes? }`
Response: `{ messagesDelivered, roomsNotified[] }`

### `POST /api/internal/virtual-admin/team-escalation`
Request: `{ roomId, runId, assistantId, escalationType, context, urgency }`
Response: `{ incidentId, status, estimatedResponseTime }`

---

## 046 Integration

Extends 046 actuators: notify_admin→system_direct, failover_provider→system_broadcast, retry_failed_job→system_broadcast to room, pause_queue→system_run_paused, emergency_maintenance→system_stop_run for all.

New 046 sensor: `team_escalation` — monitors inter_agent_messages where channel=team_escalation.

## Security Rules
- sourceAgentType must match actual sender
- Only system agents use system_control channel
- All messages audit-logged
- System messages sanitized (no secrets)
- Rate limit: 100 msg/min per source agent
