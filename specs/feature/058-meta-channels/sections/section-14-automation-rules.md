# Section 14 — Automation Rules & Approval Queue

## Dependencies
- **section-01-db-schema**: `socialAutomationRules`, `socialHumanApprovals` tables
- **section-06-inbox-backend**: Conversation/message context for rule matching
- **section-08-ai-draft**: Draft generation pipeline for automated responses
- **section-13-rag-archival**: RAG collection availability for grounded automation

## Overview

This section implements the automation rules engine and human approval queue. Automation rules define per-page or per-tenant triggers (new message, keyword match, unread timeout) that invoke the AI draft pipeline. The approval queue manages pending AI actions that require human review before execution.

---

## Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/server/routers/socialAutomation.ts` | Create | tRPC router for rules + approvals |
| `apps/web/server/routers/__tests__/socialAutomation.test.ts` | Create | Tests |
| `apps/web/server/services/socialAutomationService.ts` | Create | Rule matching + approval logic |
| `apps/web/client/src/pages/SocialAutomation.tsx` | Create | Automation settings + approval queue page |
| `apps/web/server/routers.ts` | Modify | Register router |

---

## Tests First

### tRPC Router Tests (`apps/web/server/routers/__tests__/socialAutomation.test.ts`)

```
# --- Automation Rules ---
# Test: listRules returns rules for a page scoped by tenantId
# Test: createRule creates rule with correct defaults (isEnabled=false, actionMode=draft_only)
# Test: createRule validates triggerType enum
# Test: updateRule updates name, conditions, actionMode
# Test: toggleRule enables/disables a rule
# Test: deleteRule removes rule
# Test: all rule procedures reject cross-tenant access

# --- Approval Queue ---
# Test: listApprovals returns pending approvals for tenant
# Test: listApprovals filters by pageId and status
# Test: approveAction sets status to "approved" and executes the pending action
# Test: approveAction with edited content sends the edited version
# Test: rejectAction sets status to "rejected" with decisionNote
# Test: expired approvals (>24h) auto-transition to "expired" status
# Test: all approval procedures reject cross-tenant access
# Test: all procedures reject when META_CHANNELS_ENABLED is false
```

---

## Implementation Guidance

### tRPC Router: `socialAutomation.ts`

All procedures use `protectedProcedure` with `META_CHANNELS_ENABLED` middleware.

**Rule Management Procedures:**

- **`listRules`**: Input `{ pageId? }`. Query `socialAutomationRules` WHERE `tenantId`, optional `pageId` filter. Return sorted by `createdAt DESC`.

- **`createRule`**: Input `{ name, pageId?, triggerType, conditions?, actionMode?, policyConfig? }`. Insert with `isEnabled=false` default. Validate `triggerType` is one of: `new_message`, `keyword_match`, `unread_timeout`.

- **`updateRule`**: Input `{ ruleId, name?, conditions?, actionMode?, policyConfig? }`. Verify tenant ownership. Update fields.

- **`toggleRule`**: Input `{ ruleId, isEnabled: boolean }`. Verify tenant. Update `isEnabled`.

- **`deleteRule`**: Input `{ ruleId }`. Verify tenant. Hard delete.

**Approval Queue Procedures:**

- **`listApprovals`**: Input `{ pageId?, status?, cursor?, limit }`. Query `socialHumanApprovals` WHERE `tenantId`, filters. Order by `createdAt DESC`. Return with proposed content, confidence, entity type.

- **`approveAction`**: Input `{ approvalId, editedContent? }`. Verify tenant. Set `status="approved"`, `reviewedByUserId`. Execute the pending action:
  - If `entityType === "reply"`: Send the `editedContent || proposedContent` as a reply via `socialInboxService.sendReply()`
  - If `entityType === "post"`: Publish the post via `socialPublishing.publishNow()`
  - Write audit log: `social.approval.approved`

- **`rejectAction`**: Input `{ approvalId, note? }`. Set `status="rejected"`, `decisionNote`. Write audit log.

### Service: `socialAutomationService.ts`

**Rule Matching:**

```typescript
async function matchAutomationRules(params: {
  pageId: number;
  tenantId: string;
  messageBody: string;
  conversationId: number;
}): Promise<MatchedRule | null>
```

Called by the webhook processing pipeline (section-05 Celery task publishes event → Node.js listener → rule matching):

1. Query `socialAutomationRules` WHERE (`pageId = params.pageId` OR `pageId IS NULL`) AND `isEnabled = true`
2. For each rule, evaluate trigger:
   - `new_message`: Always matches on any inbound message
   - `keyword_match`: Check if `messageBody` contains any keyword from `conditions.keywords[]`
   - `unread_timeout`: Check if conversation's `unreadCount > conditions.threshold` AND `lastInboundAt < now() - conditions.timeoutMinutes`
3. Return first matching rule (priority order) or null

**Approval Expiry:**

Add a utility that's called on `listApprovals` to auto-expire pending approvals older than 24 hours:

```typescript
async function expireOldApprovals(tenantId: string): Promise<number>
```

Updates `status = "expired"` WHERE `status = "pending"` AND `createdAt < now() - 24h`.

### Frontend: `SocialAutomation.tsx`

Create a new page at `/social/automation` (add route + menu item if desired, or embed as a tab in SocialChannels).

**Layout:**

1. **Per-Page Rules Section:**
   - Page selector dropdown
   - Rules list with toggle switch per rule
   - "Add Rule" button opens form dialog:
     - Name field
     - Trigger type select: New Message, Keyword Match, Unread Timeout
     - Conditions config (dynamic based on trigger type):
       - keyword_match: textarea for keywords (comma-separated)
       - unread_timeout: number input for threshold + minutes
     - Action mode select: Off, Draft Only, Approval Required, Auto Send
     - Policy config: blocked categories checkboxes
   - Edit/Delete actions per rule

2. **Approval Queue Section:**
   - Filter tabs: Pending, Approved, Rejected, Expired
   - Table: Entity type, Proposed content (preview), Confidence badge, Page, Created date, Actions
   - Actions for pending: Approve (opens edit modal), Reject (opens note modal)
   - Edit modal: textarea pre-filled with proposed content, "Approve & Send" button
   - Reject modal: textarea for rejection note

**Data:** Uses `trpc.socialAutomation.*` hooks.

### Blocked Categories

Stored in `policyConfig.blockedCategories`:
```json
{
  "blockedCategories": ["billing", "legal", "harassment", "refund"],
  "toneGuide": "Professional and friendly"
}
```

When a rule's `actionMode` is `auto_send`, the draft service checks the detected intent against blocked categories. If matched, the action is forced to `approval_required` regardless of confidence.

### Kill Switch

The per-tenant kill switch is `META_CHANNELS_ENABLED = false`. The per-page kill switch is `socialPages.aiActionMode = "off"`. Both prevent any automated actions.

### Security

- All rules scoped by tenantId
- Approval actions verify reviewer is in the same tenant
- Auto-send blocked categories prevent unsafe autonomous actions
- Audit trail for every approval/rejection decision
