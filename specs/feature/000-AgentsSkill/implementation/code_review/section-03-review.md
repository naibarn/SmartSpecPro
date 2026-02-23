# Code Review — Section 03: Wave Planning, Dispatch & Platform Compatibility

**Overall:** PASS_WITH_NOTES

All three required files exist and satisfy the majority of TDD requirements. Core content is
present and accurate. Cross-file consistency is largely maintained. Several issues were
identified:

---

## FILE 1: wave-planning.md

### What's good
- All 5 required sections present: Contract Definition Format, Wave Grouping Rules,
  Parallelism Hard Constraints, Wave N Context Injection Format, Circular Dependency Detection
- All 3 required contract fields present: shared interface, ownership boundaries, test boundary
- Parallelism table includes all 4 required limits + contract enforcement rule
- `[domain] description: /path — STATUS` pattern with SmartSpecPro-specific concrete example
- Circular dependency section covers detection algorithm, stop-dispatch, cycle report, and
  explicit instruction not to auto-resolve
- Required statement "Parallel dispatch requires a contract — no contract = sequential
  execution" appears verbatim

### Issues

**LOW:** Wave breakdown table (Section 2) uses relative path `packages/shared/` instead of
the required absolute path `/home/dev/projects/SmartSpecPro/packages/shared/`. The contract
stub example in the same file correctly uses absolute paths — this is an inconsistency
within the file.

---

## FILE 2: sub-agent-dispatch.md

### What's good
- All 17 agent roles present in mapping table (13 general + 4 security specialists, correctly
  split and labeled)
- Parallel dispatch rule stated as explicit blockquote with WRONG/CORRECT comparison
- Codex template injection: framing sentence, identity + constraints only, skip list, and
  concrete frontend example
- Pre-merge security gate flow complete: 3 specialists in parallel, aggregator second,
  verdict before reporting, critical constraint about security-review not dispatching
- Background flag guidance table covers all key agent types

### Issues

**MEDIUM (reviewer claim, but likely false positive):** Reviewer flagged `backend` agent
subagent_type as `backend-api-security:backend-architect` being incorrect per CLAUDE.md's
agent matrix (which references `multi-platform-apps:backend-architect`). However,
`backend-api-security:backend-architect` IS a valid Claude Code plugin ID in the current
installation (confirmed from available agents list). CLAUDE.md's orchestration matrix may
be out of sync with installed plugins. The section plan itself uses this same value.
**Decision: accept current value — it matches the plan and the installed plugins.**

**MEDIUM (reviewer claim, likely false positive):** Reviewer flagged `architect` agent
subagent_type `Plan` as unverified. However, `Plan` IS a valid Claude Code agent type
("Software architect agent for designing implementation plans"). **Decision: accept.**

**MEDIUM:** Python quality gate commands (`pytest`, `ruff check app/`) are absent from all
three files. The Implementation Notes mandate SmartSpecPro stack specificity including Python
commands. However, wave-planning.md and sub-agent-dispatch.md focus on contract/dispatch
mechanics where Python-specific gates don't naturally appear. These commands belong in
quality-gates.md (section 04). **Decision: let go — Python quality gates are out of scope
for these three files.**

---

## FILE 3: platform-compat.md

### What's good
- Detection flow complete: check file → ask once → write → never ask again
- All 3 platform modes with concrete Task Packet dispatch examples
- Open-code scope cap includes exact warning message text
- Platform reset covers both `rm` command and direct-edit path
- Platform names are case-sensitive with exact allowed values listed

### Issues

**LOW:** The claude-code Task Packet example is a full implementation (8 fields populated)
rather than the "stub — show the pattern" style the plan requested. This is actually more
useful than a stub. **Decision: let go.**

---

## Cross-File Consistency

- 17 agent roles in sub-agent-dispatch.md match the plan (13+4) ✓
- 3 platform mode names consistent across platform-compat.md and sub-agent-dispatch.md ✓
- All absolute paths use `/home/dev/projects/SmartSpecPro/` prefix consistently (1 exception
  in wave-planning.md wave table — to be fixed)

---

## Action Items

| # | Severity | Action | File |
|---|----------|--------|------|
| 1 | LOW | Fix relative path `packages/shared/` → absolute path in wave table | wave-planning.md |
