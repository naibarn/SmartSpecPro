# Opus Review

**Model:** claude-opus-4-6
**Generated:** 2026-02-22T00:00:00Z

---

# Implementation Plan Review: Orchestra & Sub-Agents Skill Pack

**Plan file:** `/home/dev/projects/SmartSpecPro/specs/feature/000-AgentsSkill/claude-plan.md`

**Verdict:** The plan is well-structured and thorough for a markdown-only deliverable. However, there are several significant issues that range from architectural contradictions to missing operational details that will cause problems during implementation or first use.

---

## 1. Critical Issue: Sub-Agent Nesting Violation in Security Review Coordinator

**Section 08, lines 398-409 (security-review.md Coordinator)**

The plan states that the `security-review.md` coordinator agent will "dispatch all 3 specialists in parallel (single message, 3 Task calls)." However, the research document explicitly states:

> "Sub-agents CANNOT spawn other sub-agents. The conductor always manages delegation depth."

This is a hard architectural constraint of Claude Code. The security-review coordinator is itself a sub-agent dispatched by orchestra. If it then tries to dispatch 3 more sub-agents, it will fail at runtime.

**Recommendation:** The security review coordinator workflow must be restructured so that orchestra (the conductor) directly dispatches all 3 security specialists. The `security-review.md` agent should be downgraded to either: (a) a post-collection aggregation agent that receives the 3 audit results and produces the verdict, or (b) eliminated entirely, with orchestra performing the aggregation logic directly.

---

## 2. Missing: `tools` Field in Section 09 Agent Configuration Matrix

**Section 09, lines 485-503**

The agent configuration matrix specifies `model`, `permissionMode`, `maxTurns`, `memory`, and `background` for all 17 agents, but omits the `tools` field entirely. The YAML frontmatter pattern shows `tools: [allowlisted tools for this agent]` as a placeholder, but no concrete values are ever specified.

**Recommendation:** Add a `tools` column to the matrix. Differentiate between:
- Read-only agents (research, reviewer, architect, error-detective, security-trpc/fastapi/frontend): `Read, Grep, Glob`
- Write agents (frontend, backend, python, database, test-qa, security, debugger, infrastructure, docs-release): `Read, Grep, Glob, Bash, Write, Edit`

---

## 3. Missing: `isolation` Field in Section 09

**Section 09, lines 460-530**

The plan mentions `isolation: worktree` at line 125 but the Section 09 agent configuration matrix and YAML frontmatter pattern do not include `isolation` as a field. This means every writing agent dispatched in parallel could cause file conflicts.

**Recommendation:** Add `isolation` to the YAML frontmatter pattern and specify it for each writing agent. Writing agents dispatched in parallel waves should have `isolation: worktree`.

---

## 4. Missing: How Orchestra Is Registered as a Skill

**Section 06 and throughout**

The plan describes the files to create but never addresses how the `/orchestra` skill will be registered with Claude Code. The `.claude/settings.json` file lists enabled plugins explicitly (e.g., `"deep-plan@piercelamb-plugins": true`). There is no mention of whether a new plugin entry is needed or how the `/orchestra` slash command gets registered.

**Recommendation:** Add a section (or extend Section 01) documenting the skill registration process. Investigate how adding `skills/orchestra/SKILL.md` as a sibling to `deep-plan` interacts with the existing plugin system.

---

## 5. HIGH: Unclear Precedence Between `.claude/agents/` and Plugin Subagent Types

**Section 09 and Section 07**

The plan creates 17 `.claude/agents/*.md` files AND 17 `skills/sub-agents/agents/*.md` files. When orchestra dispatches `subagent_type=backend-api-security:backend-architect`, the relationship to `.claude/agents/backend.md` is unclear. Could they conflict with already-enabled plugins?

**Recommendation:** Clarify precedence rules. Consider using distinct naming for `.claude/agents/` definitions (e.g., `ssp-backend.md` prefix) to avoid collisions with plugin subagent types.

---

## 6. Agent Count Inconsistency

**Section 07 says "17 agent files" but lists 13. Section 08 adds 4 security specialists. Acceptance criteria says "13 general agent files."**

**Recommendation:** Fix the Section 07 header to say "13 general agent files" and add a note that the remaining 4 are in Section 08.

---

## 7. Ambiguous: `orchestra/` Directory Location

**Section 05, lines 223-235**

The plan does not specify whether `orchestra/` is created at the project root, relative to the current working directory, or feature-scoped. For multi-feature projects, a project-root `orchestra/` would cause state collisions between sessions.

**Recommendation:** Specify the exact path. Consider using a feature-scoped path like `specs/feature/{NNN}/orchestra/` or requiring the user to specify it at invocation.

---

## 8. Context Window Bloat from Unconditional Reference File Reads

**Section 06, lines 308-329**

SKILL.md reads 7-9 reference files during every orchestration session (1,000-2,000+ lines) before any real work begins. A trivial task would still cause the conductor to read wave-planning.md, security-review-protocol.md, and compaction-safety.md it doesn't need.

**Recommendation:** Add conditional reading logic. For trivial/small scope, skip reading reference files irrelevant to the chosen route.

---

## 9. Security: Auto-Approve of HIGH Findings in `auto_by_default` Mode

**Section 04, line 208**

HIGH severity security findings can be silently auto-approved when `decision_mode=auto_by_default`. This includes potential auth bypass, data exposure, or input validation gaps—contradicting the strict security posture in CLAUDE.md.

**Recommendation:** At minimum, require that auto-approved HIGH security findings are prominently logged in the final summary. Consider always requiring explicit user approval for HIGH security findings regardless of decision mode.

---

## 10. Snapshot JSON Schema Mismatch

**Section 05 vs. research document**

The plan uses `completed_waves`, `in_progress`, `pending_waves`. The research document uses a different schema with `completed_steps`, `in_progress` (different structure), `pending`, `task_id`, `phase`.

**Recommendation:** Define one canonical snapshot schema and reference it from both the plan and spec. Field names must match exactly between creation (Step 8) and parsing (R4 resume algorithm).

---

## 11. Missing: Large/Project Scope Handoff Gap Handling

**Section 06, lines 310-312 and Section 05, lines 265-274**

When orchestra hands off to deep-* skills, there is no mechanism to handle: what if the user forgets to resume? What if deep-* fails partway through? How does orchestra verify what deep-* produced?

**Recommendation:** Add a verification step to the resume flow. When `/orchestra resume` is invoked after a deep-* handoff, check for expected output artifacts and report any missing files.

---

## 12. Missing: Platform Detection Reset Mechanism

**Section 03, lines 146-157**

No mechanism exists to change the platform after initial selection (the plan says "never ask again"), or to handle a corrupted/deleted `orchestra/platform.md`.

**Recommendation:** Add support for a `/orchestra --platform=X` override flag or check for the platform detection file before each dispatch step.

---

## 13. Missing: Codex Template Injection Size Limits

**Section 03, lines 140-141**

Prepending full agent files (80-250 lines) to Task Packets in Codex mode could push combined prompts to 15,000-20,000+ characters with no size guidance.

**Recommendation:** Add a size budget for Codex mode. Create condensed agent templates (identity + constraints only) for Codex injection.

---

## 14. Duplicate Task Packet Content Across 3 Files

**Section 01, lines 52-58**

The task packet schema appears in `contracts/task-packet.schema.md`, `references/task-packet-format.md` (described as "identical content"), and SKILL.md Step 4. Three-way duplication creates maintenance burden.

**Recommendation:** Define the canonical schema in `contracts/task-packet.schema.md` and have others reference it.

---

## 15. Missing: Wave N Context Injection Format

**Section 03, line 121**

Results from wave N are prepended to wave N+1 prompts as "structured context" but the format is never defined.

**Recommendation:** Define the exact format for wave-result context injection with a concrete example.

---

## 16. Missing: `.gitignore` Verification for `orchestra/`

**Section 05, line 235**

The plan recommends tracking `orchestra/` in git but doesn't verify that existing `.gitignore` patterns (e.g., `*.json`) won't accidentally exclude `snapshot.json`.

**Recommendation:** Add a verification step in Section 01 to check `.gitignore` for patterns that might exclude `orchestra/` files.

---

## 17. Open-Code Mode Scalability for Medium+ Tasks

**Section 03, lines 155-156**

Sequential inline execution for medium+ tasks (6+ agents across 3 waves) in open-code mode will likely hit context window limits since the conductor holds all state and executes all work itself.

**Recommendation:** Add a note that open-code mode should cap at `small` scope, or automatically split medium+ tasks into sequential sessions with mandatory snapshots.

---

## 18. Minor: Copy-Paste Error in Spec Output Examples

The FastAPI security auditor's output example uses a tRPC file path (`apps/web/server/routers/admin.ts:42`). The Frontend auditor's example has the same issue.

**Recommendation:** Fix spec output examples to use domain-appropriate paths: `python-backend/app/api/v1/resource.py:42` for FastAPI, `apps/web/client/src/pages/Login.tsx:88` for Frontend.

---

## Summary of Findings by Severity

| # | Severity | Section | Issue |
|---|----------|---------|-------|
| 1 | CRITICAL | 08 | Sub-agent nesting violation: security-review coordinator cannot dispatch sub-agents |
| 2 | HIGH | 09 | Missing `tools` field in agent configuration matrix |
| 3 | HIGH | 09 | Missing `isolation` field for parallel write conflict prevention |
| 4 | HIGH | All | Missing skill registration documentation |
| 5 | HIGH | 07/09 | Unclear precedence between `.claude/agents/` and plugin subagent_types |
| 6 | MEDIUM | 07 | Agent count inconsistency (17 vs 13+4) |
| 7 | MEDIUM | 05/06 | Ambiguous `orchestra/` directory location |
| 8 | MEDIUM | 06 | Context window bloat from unconditional reference file reads |
| 9 | MEDIUM | 04 | Auto-approve of HIGH security findings in `auto_by_default` mode |
| 10 | MEDIUM | 05 | Snapshot JSON schema mismatch between plan and research doc |
| 11 | MEDIUM | 05/06 | Missing large/project scope handoff gap handling |
| 12 | LOW | 03 | Missing error handling for platform detection reset |
| 13 | LOW | 03 | Missing Codex template injection size limits |
| 14 | LOW | 01 | Duplicate task-packet content across 3 files |
| 15 | LOW | 03 | Missing wave N context injection format spec |
| 16 | LOW | 05 | Missing `.gitignore` verification step |
| 17 | LOW | 03 | Open-code mode scalability for medium+ tasks |
| 18 | LOW | 08 | Copy-paste error in spec output examples |
