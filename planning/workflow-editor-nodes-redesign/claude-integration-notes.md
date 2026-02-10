# External Review Integration Notes

## Suggestions Integrated

### 1. Add `workflows` table for user workflow persistence (Critical #12)
**Why:** Fundamental gap — users cannot save/resume editing workflows. Templates are for sharing, `workflows` is for user's active work. Adding this to Section 6 and database schema.

### 2. Fix skill schema path to `schemas/input.schema.json` (Critical #13)
**Why:** Factual error in the plan. Actual path confirmed by codebase.

### 3. Backend as single source of truth for node registry (Critical #8)
**Why:** Dual registries will drift. Frontend should dynamically render from `GET /api/v1/workflow/node-types` response. No hardcoded frontend registry.

### 4. Clarify ReactFlow type vs logical node type (Critical #2)
**Why:** ReactFlow `type` field determines component, logical node type stored in `data.nodeType`. Using a single `BaseNode` ReactFlow component for most nodes.

### 5. Reorder implementation steps (Critical #16)
**Why:** API endpoints for models/collections/approvers needed before frontend components. Moving to early in implementation order.

### 6. Specify expression evaluation library — `simpleeval` (Security #4)
**Why:** Vague "restricted parser" is dangerous. `simpleeval` is a well-tested Python library for safe expression evaluation. Adding explicit security constraints.

### 7. SSE authentication via cookie/session (Security #6)
**Why:** EventSource cannot send custom headers. App already uses session cookies — leverage existing auth.

### 8. Add tenant isolation to template queries (Security #7)
**Why:** Critical for multi-tenancy. Private templates must be scoped.

### 9. Simplify loops with explicit Loop Group approach (Architectural #9)
**Why:** Implicit cycle detection is too complex and error-prone. Using a "Loop Group" pattern where users explicitly define loop body within a group container.

### 10. Add pre-execution cost estimation (Missing #17)
**Why:** Users with credit-based system need to know estimated cost before running.

### 11. Fix dynamic Tailwind classes (Minor #18)
**Why:** Real bug. Dynamic class interpolation fails with Tailwind JIT purge.

### 12. Separate DataType from UI control type (Minor #22)
**Why:** Clean separation prevents confusion. Data types for port compatibility, UI types for form rendering.

### 13. Audit existing backend honestly (Critical #1)
**Why:** Plan overstated readiness. Will add honest "Infrastructure Gaps" section documenting what needs to be built.

### 14. Template JSON validation and XSS prevention (Security #5)
**Why:** Marketplace templates from other users need sanitization. Adding JSON Schema validation.

## Suggestions NOT Integrated

### A. Unify with existing marketplace router (Architectural #11)
**Why not:** The existing `marketplace.ts` handles a different domain (media marketplace). Workflow templates have different data shape, search criteria, and access patterns. Separate router is cleaner.

### B. Template rating abuse prevention (Security #6)
**Why not:** Over-engineering for initial release. Can add moderation features later. UNIQUE constraint is sufficient for now.

### C. Mobile/responsive consideration (#18 in full review)
**Why not:** Workflow editor is inherently a desktop tool. ReactFlow canvas requires mouse/keyboard interaction. Mobile is explicitly out of scope.

### D. Workflow JSON versioning strategy (Missing #15)
**Why not:** Premature for initial release. When node definitions change, we'll handle migration at that point. Adding a `schemaVersion` field is sufficient for forward compatibility.

### E. Skill node startup performance (#19)
**Why not:** We have <15 skills. Parsing JSON schemas is fast (< 100ms). Not a real performance concern until 50+ skills. Will note as future optimization.
