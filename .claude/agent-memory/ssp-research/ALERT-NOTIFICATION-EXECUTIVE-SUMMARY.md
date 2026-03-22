# Alert/Notification System — Executive Summary

**Date**: 2026-03-19
**Researcher**: CMD-1 SmartSpecPro Research Agent
**Status**: Complete audit with gaps identified and fix plan

---

## The Problem

Users report: **Alerts don't provide enough context to investigate issues.**

**Example**: User gets notified "Media Job Completed" but doesn't know:
- Which job was completed?
- How long did it take?
- What was the output size?
- How much did it cost?

To find details, user must:
1. Click notification
2. Get generic "Open Media Studio" link
3. Manually search the Media Studio for their job
4. (If it failed) See only generic error message, no stack trace or recovery steps

---

## Root Cause

SmartSpecPro's notification system stores only **title + content** in the database.

```typescript
// Current schema
userNotifications = {
  id,
  userId,
  type,
  title: "Media Job Completed: abc-123",
  content: "Your image generation job has completed.",
  priority,
  isRead,
  createdAt,
  // Missing: relatedResourceId, actionUrl, metadata
}
```

Frontend **hardcodes string matching** to infer what action to show:

```typescript
if (n.title?.includes("Media Job")) {
  // Show "Open Media Studio" button
}
// This breaks if title format changes
```

---

## What We Audited

| Component | Files | Status |
|-----------|-------|--------|
| **Frontend Toasts** | `GlobalAlerts.tsx`, `sonner.tsx` | Working but no history |
| **Frontend Notification Bell** | `GlobalAlerts.tsx` (915 lines) | Brittle string matching |
| **Notification Database** | `userNotifications` table | Minimal fields |
| **Notification Creator** | `notificationService.ts` | Doesn't attach context |
| **Admin Monitoring** | `monitoring.ts`, `notifier.ts` | No search/filter |
| **Python Backend Alerts** | `alerts.py` (346 lines) | TODO — never reach users |

---

## Notifications in SmartSpecPro (5 Systems)

### 1. Sonner Toasts
- **Where**: Top-right corner, transient (auto-dismiss 3-5s)
- **Used by**: 150+ components
- **Problem**: No history, not searchable
- **Example**: "Saved successfully", "Error: network timeout"

### 2. Notification Bell (User Notifications)
- **Where**: Fixed button top-right, dropdown list (20 items)
- **Triggered by**: Scheduled alerts, feedback replies, skill approvals, media jobs, workflows
- **Problem**: Only shows title + content. Frontend guesses action via string matching.
- **Storage**: `userNotifications` table (persistent)

### 3. Urgent Messages & Reminders
- **Where**: Full-screen modals (z-index 9999)
- **Triggered by**: Direct messages marked urgent, high/critical priority reminders
- **Problem**: Modal shows message but no timestamp or thread context

### 4. Guardian System Alerts
- **Where**: Admin only, routed to email/Slack/Telegram
- **Triggered by**: System health rules (high error rate, slow API, revenue anomalies)
- **Data available**: incidentId, ruleId, sensorId (but not stored in notification)
- **Problem**: Rich data exists in Guardian but isn't attached to user notification

### 5. Python Backend Alerts (Broken)
- **Where**: Should route to email/Slack/webhook
- **Triggered by**: Celery failures, LLM provider health, media generation errors
- **Problem**: All delivery functions are TODO — alerts go to logs only, never reach users

---

## Critical Gaps

### Gap 1: No Structured Metadata

**What's missing**:
- Resource ID (which job, workflow, ticket?)
- Action URL (where to navigate?)
- Error details (what went wrong? stack trace? recovery steps?)
- Metrics (duration, cost, output size?)
- Event ID (for tracing to audit log)

**Impact**: Users can't investigate alerts without manual searching.

### Gap 2: Brittle Action Routing

**Current approach** (lines 731-827 in GlobalAlerts.tsx):
```typescript
if (n.title?.includes("Media Job"))           { /* Action 1 */ }
if (n.title?.includes("credit") || n.title?.includes("Credit")) { /* Action 2 */ }
if (n.title?.includes("latency") || n.title?.includes("API error")) { /* Action 3 */ }
if (n.title?.includes("Feedback"))            { /* Action 4 + regex parse */ }
```

**Risk**: Change backend title format → action links silently break. No compile-time check.

### Gap 3: No Notification History

Users can only see:
- Last 20 notifications (dropdown list)
- Unread only (no toggle to show read)
- No search by keyword/date/type
- No export/audit trail

### Gap 4: No Smart Auto-Linking

Related resources (parent workflow, team, room) not stored in notification. Impossible to navigate from an alert to its context.

**Example**: "Team run completed" notification should link to the run, the team, AND the parent workflow. Currently shows nothing.

### Gap 5: Python Alerts Never Reach Users

`python-backend/app/monitoring/alerts.py` defines 5 alert rules:
- High error rate (> 5%)
- Slow API response (> 2000ms)
- High concurrent load (> 100 concurrent)
- Revenue split anomaly (85/15 check)
- No recent purchases (business monitoring)

**Status**: All email/Slack/Discord delivery functions marked **TODO**.

**Impact**: System health issues invisible to admins.

---

## Proposed Fix

### Phase 1: Add Metadata to Schema (2-3 hours)

Add 4 new fields to `userNotifications` table:

```typescript
relatedResourceType: varchar(50),     // "media_job", "workflow", "feedback", etc.
relatedResourceId: varchar(100),      // The actual job/workflow/ticket ID
actionUrl: text,                      // Direct link: "/media-studio?jobId=abc-123"
metadata: jsonb,                      // Error details, metrics, retry info, related items
```

### Phase 2: Update Notification Creation (1-2 hours)

Modify 30+ `createNotification()` calls to attach:

**Before**:
```typescript
await createNotification({
  db, userId,
  type: "alert",
  title: "Media Job Completed",
  content: "Your image generation finished.",
});
```

**After**:
```typescript
await createNotification({
  db, userId,
  type: "alert",
  title: "Image Generation Complete",
  content: `Generated 1920x1080 in 45s. Cost: $0.08.`,
  relatedResourceType: "media_job",
  relatedResourceId: jobId,
  actionUrl: `/media-studio?jobId=${jobId}`,
  metadata: {
    duration: 45,
    costUsd: 0.08,
    outputSize: "1920x1080",
    eventId: traceId,  // For audit trail
  },
});
```

### Phase 3: Frontend Action Links (1-2 hours)

Replace hardcoded string matching:

**Before**:
```typescript
if (n.title?.includes("Media Job")) {
  // Show "Open Media Studio"
}
```

**After**:
```typescript
if (n.relatedResourceType === "media_job" && n.actionUrl) {
  <button onClick={() => navigate(n.actionUrl)}>
    View Job →
  </button>
}
```

### Phase 4: Details Panel (2-3 hours)

Add side panel showing:
- Full notification title + content
- Related resource link
- Metadata (metrics, error details, retry info)
- Related items (parent workflow, team, room)
- Action buttons (Retry, Navigate, Dismiss)

### Phase 5: History & Search (2-4 hours)

Add notification history page:
- Search by keyword
- Filter by type, priority, resource type
- Sort by date, priority
- Export to CSV

---

## Implementation Plan

### Files to Modify

1. **Schema** (15 min)
   - `apps/web/drizzle/schema.ts` — Add 4 fields to userNotifications
   - Run `pnpm db:push` to migrate

2. **Backend Calls** (1 hour)
   - `apps/web/server/routers/mediaJobs.ts` (2 calls)
   - `apps/web/server/routers/workflow.ts` (3 calls)
   - `apps/web/server/routers/feedback.ts` (2 calls)
   - `apps/web/server/routers/skills.ts` (2 calls)
   - `apps/web/server/routers/agency.ts` (3 calls)
   - `apps/web/server/routers/follows.ts` (2 calls)
   - `apps/web/server/services/scheduler.ts` (4 calls)
   - `apps/web/server/services/virtualAdmin/feedbackProcessor.ts` (1 call)
   - `apps/web/server/jobs/pendingApprovalAlert.ts` (1 call)
   - Total: ~30 calls to update

3. **Frontend UI** (1 hour)
   - `apps/web/client/src/components/GlobalAlerts.tsx:731-827` — Remove string matching, add structured routing
   - Add details panel component
   - Update dropdown to show metadata

4. **Optional: Notifications Page** (2-4 hours)
   - Add `/notifications/history` page
   - Add search/filter/sort
   - Add export functionality

---

## Quick Facts

| Metric | Value |
|--------|-------|
| **Notification types** | 5 (Sonner, User, Orchestrator, Guardian, Python) |
| **Frontend hardcoded strings** | 4 (Media Job, Credit, Latency, Feedback) |
| **Places notifications created** | 9 routers/services |
| **Database fields** | 7 (current) → 11 (proposed) |
| **Python alerts unimplemented** | 5/5 delivery channels |
| **Notification table rows** | Per-user, no retention limit |

---

## Success Criteria

- [ ] Clicking a notification opens a details panel with full context
- [ ] Action buttons navigate directly to related resource (no manual searching)
- [ ] Error details (stack trace, error code) visible in details panel
- [ ] Retry button works for failed tasks
- [ ] Search/filter works on notification history
- [ ] No hardcoded string matching in frontend
- [ ] All 30+ createNotification() calls include metadata
- [ ] Python backend alerts reach users

---

## Risk Assessment

| Risk | Likelihood | Severity | Mitigation |
|------|------------|----------|-----------|
| String matching breaks when title changes | HIGH | MEDIUM | Add structured metadata NOW |
| New fields not populated in old notifications | HIGH | LOW | Handle NULL gracefully in frontend |
| Missing createNotification() calls | MEDIUM | MEDIUM | Grep all calls, add unit test |
| URL format inconsistent across resource types | MEDIUM | MEDIUM | Create mapping function, test each type |
| Python alerts never implemented | HIGH | HIGH | Mark as Phase 3, track separately |
| Users confused by new details panel | LOW | LOW | Add tooltip/help text |

---

## Next Steps

1. **Review** this audit with stakeholders
2. **Prioritize**: Phase 1+2+3 (high priority), Phase 4+5 (nice-to-have)
3. **Assign**: Frontend dev + Backend dev + DB (schema migration)
4. **Timeline**: Phase 1-3 can complete in 1 sprint (7-10 hours total work)
5. **PR Review**: Ensure every createNotification() updated before merge

---

## References

- **Full Audit**: `ALERT-NOTIFICATION-SYSTEM-AUDIT.md` (11 sections, 500+ lines)
- **Quick Reference**: `ALERT-NOTIFICATION-QUICK-REF.md` (Implementation details)
- **Detailed Files**:
  - Frontend: `apps/web/client/src/components/GlobalAlerts.tsx` (915 lines)
  - Backend: `apps/web/server/services/notificationService.ts` (111 lines)
  - Schema: `apps/web/drizzle/schema.ts:3059-3087`

