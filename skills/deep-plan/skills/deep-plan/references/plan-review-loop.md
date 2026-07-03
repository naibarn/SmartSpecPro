# Plan Review Loop Protocol

This protocol defines iterative self-review for claude-plan.md — Phase A checklist self-review (after Step 11) and Phase B adversarial self-review (Step 13, which replaces the retired external-review step). It also covers section cross-consistency review (after Step 20).

## Why This Exists

Plans written in a single pass have systematic blind spots:
- Early sections make assumptions that later sections contradict
- Integration points between components are underspecified
- Edge cases mentioned in interview get lost during synthesis
- Phase A fixes can themselves introduce new inconsistencies in previously-correct sections

## Phase A: Plan Self-Review (After Step 11, Before Step 12)

### Review Checklist

Score claude-plan.md against EVERY item:

#### 1. Structural Integrity
- [ ] Every component mentioned in the plan has a clear location (file path or module)
- [ ] Data flows are traceable end-to-end (input → processing → output)
- [ ] No component is referenced but never defined
- [ ] No component is defined but never used
- [ ] API contracts between components are explicit (not "passes data to X")

#### 2. Completeness vs Spec
- [ ] Every requirement from claude-spec.md is addressed (grep each requirement)
- [ ] Every constraint from claude-interview.md is respected
- [ ] Every finding from claude-research.md that was relevant is incorporated
- [ ] Error handling strategy exists for each external dependency
- [ ] Authentication/authorization is addressed (if applicable)
- [ ] Data validation is specified at system boundaries

#### 3. Implementability
- [ ] An engineer with NO context can read this and start building
- [ ] No "TODO" or "TBD" placeholders remain
- [ ] Technology choices are justified (why X over Y)
- [ ] Performance considerations are noted where relevant
- [ ] Database schema changes are specified (if applicable)
- [ ] Migration strategy exists for existing data (if applicable)

#### 4. Internal Consistency
- [ ] Same concept uses same name throughout (no "user" vs "account" vs "profile" for same thing)
- [ ] Type definitions are consistent across sections
- [ ] Configuration keys referenced in multiple places match
- [ ] File paths referenced in multiple places match

#### 5. Edge Cases & Failure Modes
- [ ] At least one failure scenario per external integration
- [ ] Concurrent access scenarios considered (if applicable)
- [ ] Empty/null/missing data scenarios addressed
- [ ] Rate limiting and backpressure strategies (if applicable)

### Self-Review Procedure

```
Round 1: Read claude-plan.md end-to-end
         Cross-reference against claude-spec.md, claude-interview.md, claude-research.md
         Score each checklist item

         If ALL PASS → Proceed to Step 12
         If ANY FAIL → Fix in claude-plan.md, go to Round 2

Round 2: Re-read the MODIFIED sections of claude-plan.md
         Check if fixes introduced new inconsistencies
         Re-score failed items + items in sections that were touched

         If ALL PASS → Proceed to Step 12
         If ANY FAIL → Fix, Round 3

Max 5 rounds. After 5, classify remaining issues:
  - 80%+ confident → [AUTO-FIX] and apply anyway
  - Genuinely ambiguous → [SUGGEST] for output summary
```

### Output After Each Round

```
═══════════════════════════════════════════════════════════════
PLAN SELF-REVIEW — Round {N}
═══════════════════════════════════════════════════════════════
Category              | Score   | Issues
──────────────────────|─────────|────────
Structural Integrity  | 5/5     | —
Completeness vs Spec  | 3/6     | Missing: error handling for LLM API, auth not addressed, migration strategy absent
Implementability      | 5/6     | One TBD remaining in section 4
Internal Consistency  | 4/4     | —
Edge Cases            | 1/4     | Only happy path covered for payment flow

Total: 18/25 — NEEDS FIXES
Fixing 7 issues...
═══════════════════════════════════════════════════════════════
```

---

## Phase B: Adversarial Self-Review (Step 13, replaces external review)

This is the current model attacking its OWN plan from an adversarial angle, directly editing claude-plan.md. It replaces the retired external-review + integrate-findings steps (there is no external LLM and no claude-integration-notes.md). Where Phase A scores a completeness checklist, Phase B tries to *break* the plan.

### Adversarial Checklist

- [ ] Assume a hostile reviewer: which requirement could this plan silently fail to meet?
- [ ] Any Phase A fix that introduced a new contradiction with an earlier plan section
- [ ] Architectural choices with an unaddressed failure mode (scaling, concurrency, partial failure)
- [ ] Components referenced but never defined, or defined but never used (re-check after Phase A edits)
- [ ] Removed/renamed components that leave dangling references elsewhere in the plan

### Procedure

```
1. Re-read claude-plan.md end-to-end as an adversary trying to find a fatal gap
2. For EACH weakness found:
   a. Find all sections of claude-plan.md that touch the weak area
   b. Fix them directly in claude-plan.md
3. Run the Structural Integrity check (from Phase A) once more
4. If any fixes were made → re-check the newly-changed sections
```

This is typically 1-2 rounds. If more than 3 rounds are needed, the plan has deeper design issues — surface them in the output summary rather than patching endlessly.

---

## Phase C: Section Cross-Consistency Review (After Step 20, Before Step 21)

After section files are written by subagents, review them as a whole for cross-section consistency.

### Why Subagent-Written Sections Need This

Each section is written by an independent subagent that:
- Has only the plan + its own section scope as context
- Cannot see what other section subagents wrote
- May make different assumptions about shared interfaces

### Cross-Consistency Checklist

#### 1. Interface Alignment
- [ ] If section-02 imports from section-01, the import path/name matches what section-01 exports
- [ ] Shared data structures have identical field definitions across all sections
- [ ] API endpoints referenced in consumer sections match producer section definitions

#### 2. No Gaps
- [ ] Every component in claude-plan.md is covered by at least one section
- [ ] No "assumed to exist" references to things no section creates
- [ ] Database migrations are ordered correctly across sections

#### 3. No Overlaps
- [ ] No two sections create the same file
- [ ] No two sections define the same function/class
- [ ] No conflicting configuration values

#### 4. Dependency Order
- [ ] Section execution order in index.md respects actual code dependencies
- [ ] No section imports from a later section (unless explicitly parallel)
- [ ] Test sections have access to all code they need to test

#### 5. Self-Containment
- [ ] Each section file has enough context to implement independently
- [ ] Referenced types/interfaces from other sections are described (not just named)
- [ ] Testing approach per section is clear

### Procedure

```
1. Build a digest from `sections/index.md`, changed sections, and dependent sections.
   Read every section file sequentially only when the section set is small or digest/checker
   evidence indicates unresolved cross-section risk.
2. Build a dependency map: what each section imports/exports
3. Check for mismatches, gaps, overlaps
4. Fix issues directly in section files
5. If fixes changed interfaces → re-check dependent sections
6. Max 3 rounds of cross-checking
```

### Output

```
═══════════════════════════════════════════════════════════════
SECTION CROSS-CONSISTENCY REVIEW — Round {N}
═══════════════════════════════════════════════════════════════
Sections reviewed: {M}

Interface Alignment:  {PASS|N issues}
Coverage Gaps:        {PASS|N gaps}
Overlaps:             {PASS|N conflicts}
Dependency Order:     {PASS|N violations}
Self-Containment:     {PASS|N incomplete}

{If issues found:}
Issues:
  [1] section-02 imports `UserService` from section-01 but section-01 exports `UserManager`
  [2] section-04 references `POST /api/auth` but section-01 defines it as `POST /api/v1/auth`
  [3] Both section-03 and section-05 create `utils/helpers.ts`

Fixing...
═══════════════════════════════════════════════════════════════
```

---

## Summary: Where Each Phase Runs

```
deep-plan workflow:
  ...
  Step 11: Write claude-plan.md
  ──► Phase A: Plan Self-Review (1-5 rounds)
  Step 12: Context Check (pre-review)
  Step 13: Adversarial Self-Review ──► Phase B (1-3 rounds); replaces external review
  Step 14: Reserved (skipped)
  Step 15: Plan Status Log (auto-continue)
  Step 16: Apply TDD Approach
  ...
  Step 20: Write Section Files
  ──► Phase C: Section Cross-Consistency Review (1-3 rounds)
  Step 21: Final Status
  ...
```
