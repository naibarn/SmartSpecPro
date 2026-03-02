# Code Review Interview — Section 12: Channel Router (F10)

**Date:** 2026-03-02
**Interviewer:** Senior Architect
**Implementer:** Claude (deep-implement)

---

## Review Findings & Decisions

### H2: totalMatches Race Condition — AUTO-FIXED

**Finding:** `evaluateRules` used client-side read-modify-write `(rule.totalMatches ?? 0) + 1`. Under concurrent traffic, multiple processes could read the same value and then all write `current + 1`, losing increments.

**Decision:** Auto-fix — standard SQL `+1` pattern, low risk.

**Fix applied:**
```typescript
db.update(channelRoutingRules)
  .set({
    totalMatches: sql`"totalMatches" + 1`,
    lastMatchedAt: new Date(),
  })
  .where(eq(channelRoutingRules.id, rule.id))
  .catch(() => {});
```

Also added `sql` to the drizzle-orm mock in `channelRouterService.test.ts`.

---

### H4: testRule Invalidates Production Cache — AUTO-FIXED

**Finding:** `testRule` called `invalidateCache(tenantId)` before evaluation, flushing the shared Redis cache on every admin test run. This degrades real-user performance.

**Decision:** Auto-fix — remove `invalidateCache()` from `testRule`. The procedure already notes this in a JSDoc comment explaining the current behavior (30s TTL means data is fresh enough).

**Fix applied:** Removed `await invalidateCache(tenantId)` from the `testRule` query handler.

---

### H3: Admin Cross-Tenant Update Broken — AUTO-FIXED

**Finding:** The `update` procedure resolved `tenantId` the same way for both admin and domain_admin roles. When an admin tried to update another tenant's rule, `assertRuleOwnership` passed (role === "admin" → bypass), but the WHERE clause included `eq(tenantId, adminOwnTenantId)`, causing NOT_FOUND.

**Decision:** Auto-fix — admin role sets `tenantId = null`, builds `WHERE id = $1` only; domain_admin builds `WHERE id = $1 AND tenantId = $2`.

**Fix applied:**
```typescript
const tenantId =
  ctx.user!.role === "admin"
    ? null
    : (ctx.tenantId ?? String((ctx.user as any)?.currentTenantId ?? ""));

// ...

const whereClause =
  tenantId !== null
    ? and(eq(channelRoutingRules.id, input.id), eq(channelRoutingRules.tenantId, tenantId))
    : eq(channelRoutingRules.id, input.id);
```

---

### M2: Drag-and-Drop Reorder UI Missing — USER DECISION

**Finding:** The `reorder` tRPC procedure was implemented but no drag-and-drop UI existed in `AdminChannelRouter.tsx`.

**User decision:** "Implement it"

**Fix applied:** HTML5 native drag-and-drop (no external library — @dnd-kit not installed). Uses `draggable`, `onDragStart`, `onDragOver`, `onDrop` attributes on table rows with a `DragHandleIcon` visual cue. Optimistic local reorder state via `localOrder` array; `reorderMutation` fires on drop.

---

### M6: workflow/chat Routing Targets Are No-Ops — USER DECISION

**Finding:** The DB schema supports `targetPersonaId` and `targetWorkflowId`, but the gateway only handles `agency` targets. Rules with other target types match but then fall through to normal routing silently.

**User decision:** "Remove workflow/chat from Zod schema"

**Fix applied:**
- `targetTypeSchema = z.literal("agency")` (was `z.enum(["agency", "persona", "workflow", "chat"])`)
- Removed `targetPersonaId` and `targetWorkflowId` from `createRuleSchema` and `updateRuleSchema`
- AdminChannelRouter target type selector restricted to "agency" only
- Added comment to router explaining why only "agency" is allowed

---

### L4: Dead testMutation Variable — AUTO-FIXED

**Finding:** `const testMutation = ...` was declared in `AdminChannelRouter.tsx` but never used. The test sandbox used `utils.channelRouter.testRule.fetch()` directly.

**Decision:** Auto-fix.

**Fix applied:** Removed the unused variable.

---

### L6/L7: Circular Cache Test & Arithmetic Test — LET GO

**Finding:** Two tests in `channelRouter.test.ts` that don't exercise real router code (circular mock assertion, `50 >= 50` arithmetic).

**Decision:** Let go. The tests don't regress. Rewriting them would require a full tRPC test harness setup (caller mock, ctx mock). Not worth the complexity for what's essentially a schema-validation test file.

---

## Summary

| Finding | Action | Status |
|---------|--------|--------|
| H2: totalMatches race condition | Auto-fix: SQL `+1` | ✅ Applied |
| H4: testRule flushes cache | Auto-fix: removed invalidateCache | ✅ Applied |
| H3: Admin cross-tenant update | Auto-fix: null tenantId for admin | ✅ Applied |
| M2: DnD missing | User: Implement it → HTML5 DnD | ✅ Applied |
| M6: workflow/chat no-ops | User: Remove from Zod schema | ✅ Applied |
| L4: Dead testMutation | Auto-fix: removed variable | ✅ Applied |
| L6/L7: Weak tests | Let go | — |

All 25 tests passing after fixes.
