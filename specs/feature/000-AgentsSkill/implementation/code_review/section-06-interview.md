# Code Review Interview — Section 06

## Review Findings and Decisions

All review findings were auto-fixed. No user input required.

---

### HIGH-1: Missing `references/task-packet-format.md` citation in Step 4 — AUTO-FIX

**Finding:** Step 4 cited only `references/sub-agent-dispatch.md` for Task Packet construction. The spec explicitly requires citing `references/task-packet-format.md` as the construction guide.

**Applied:**
- Added `references/task-packet-format.md` to the lazy-loading table (medium+ scope, Step 4)
- Added citation in Step 4 body: "See `references/task-packet-format.md` for the construction guide"

---

### HIGH-2: Red-state notification text didn't match compaction-safety.md canonical templates — AUTO-FIX

**Finding:** SKILL.md collapsed the two-phase canonical notification into a single custom message.

**Applied:** Replaced with the canonical two-phase notification:
- Phase 1 (before snapshot): `🔴 CONTEXT CRITICAL: Snapshot required before continuing...`
- Phase 2 (after complete): `✅ Snapshot complete...`

---

### HIGH-3: `contracts.md` freeze wording too strict vs artifact-management.md — AUTO-FIX

**Finding:** SKILL.md said "frozen after they are written" which is stricter than artifact-management.md which says "frozen after Wave 1 begins" (allowing pre-dispatch amendments).

**Applied:** Changed to "Contracts are frozen after Wave 1 begins — there is a legitimate window between Step 3 completion and Wave 1 dispatch to amend contracts."

---

### MEDIUM-1: `task_summary` missing from plan.md template — AUTO-FIX

**Finding:** Step 1 plan.md template had `bug_route` but was missing `task_summary`.

**Applied:** Added `task_summary` field. Made `bug_route` conditional ("if applicable — bug sub-tree classification").

---

### MEDIUM-2: `isolation: worktree` missing from Step 4 constraints — AUTO-FIX

**Finding:** The "maximum 2 agents editing files simultaneously" constraint was missing the enforcement mechanism.

**Applied:** Added "(use `isolation: worktree` when enforcing this on Claude Code)".

---

### MEDIUM-3: Green state criteria dropped "context window" condition — AUTO-FIX

**Finding:** Green state classification omitted "context window is well below limits" from the canonical compaction-safety.md definition.

**Applied:** Changed to "Short conversation, few decisions, simple task (trivial/small scope); context window is well below limits".

---

### LOW-1: Lazy-loading table for artifact-management.md was ambiguous — AUTO-FIX

**Finding:** "Only on fresh session setup or archive" was ambiguous about the first-ever invocation case (no snapshot, no existing orchestra/).

**Applied:** Updated to "Always on Step 0 when orchestra/ needs to be created, archived, or verified — fresh start, archive path, and first-ever invocation all read this file". Also updated Step 0 body to always read artifact-management.md.

---

### LOW-2: Internal cross-references said "STOP conditions table in Step 2" but table is at top level — AUTO-FIX

**Finding:** STOP conditions table was hoisted to a top-level section, but Steps 3 and 6 still said "see STOP conditions table in Step 2".

**Applied:** Changed to "see STOP Conditions section above" in both places.

---

### NITPICK-2: "Resuming After Compaction" framing was ambiguous — AUTO-FIX

**Finding:** The section read like a parallel flow alongside Step 0, not as "instructions for when SKILL.md is not in context".

**Applied:** Added explicit framing: "This section is for when this SKILL.md is NOT in context — i.e., after /clear or after context compaction has removed the original skill instructions."

---

### IDE DIAGNOSTIC: YAML block scalar syntax warnings — AUTO-FIX

**Finding:** The YAML frontmatter used `>` block scalars for description and compatibility, which the skill file validator reported as "Unexpected indentation" and "Attribute not supported".

**Applied:** Changed to single-line quoted strings matching the deep-plan SKILL.md convention.
