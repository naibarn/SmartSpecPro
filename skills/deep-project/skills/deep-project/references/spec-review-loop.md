# Spec Review Loop Protocol

After writing ALL spec.md files (Step 6), run this iterative review loop BEFORE proceeding to Step 7 (Completion).

## Purpose

Spec files are the foundation for /deep-plan. Gaps here cascade into broken plans and wasted implementation cycles. This protocol catches issues early through structured self-review and cross-validation.

## Review Checklist

For EACH spec.md, verify ALL of these:

### 1. Completeness Check
- [ ] **Goal statement** — Clear, specific outcome (not vague "implement X")
- [ ] **Scope boundaries** — What IS and IS NOT included
- [ ] **User-facing behavior** — What the end user sees/does
- [ ] **Technical constraints** — Languages, frameworks, existing patterns to follow
- [ ] **Dependencies declared** — What this split needs from other splits (inputs)
- [ ] **Outputs declared** — What this split provides to other splits (outputs)
- [ ] **Edge cases** — At least 3 non-obvious scenarios from interview
- [ ] **Error handling expectations** — What happens when things fail
- [ ] **Testing expectations** — What kinds of tests are needed

### 2. Self-Containment Check
- [ ] Can someone read ONLY this spec and understand what to build?
- [ ] Are there implicit assumptions not written down?
- [ ] Are referenced external resources (APIs, schemas, configs) described sufficiently?

### 3. Cross-Reference Check (against other specs + manifest)
- [ ] Every dependency in manifest is mentioned in the spec
- [ ] Every output this spec declares matches what dependent specs expect as input
- [ ] No circular dependencies created
- [ ] Interface contracts between splits are consistent (same field names, same types)

### 4. Interview Fidelity Check
- [ ] Key decisions from interview are captured
- [ ] User's stated priorities are reflected
- [ ] Constraints mentioned in interview are not forgotten

## Review Loop Procedure

```
Round 1: Read ALL spec files + manifest + interview transcript
         Score each spec against checklist (PASS/FAIL per item)

         If ALL specs PASS all items → DONE, proceed to Step 7
         If ANY spec has FAIL items → Fix, then go to Round 2

Round 2: Re-read ONLY the specs that were modified in Round 1
         ALSO re-read specs that DEPEND ON modified specs
         Re-score against checklist

         If ALL PASS → DONE
         If ANY FAIL → Fix, then go to Round 3

Round N: Repeat until all pass (max 5 rounds)
         After 5 rounds, classify remaining:
           80%+ confident → [AUTO-FIX] and apply
           Genuinely ambiguous → [SUGGEST] for completion summary
```

## Output Format

After each round, print:

```
═══════════════════════════════════════════════════════════════
SPEC REVIEW — Round {N}
═══════════════════════════════════════════════════════════════
Spec                  | Completeness | Self-Contained | Cross-Ref | Interview
──────────────────────|──────────────|────────────────|───────────|──────────
01-auth/spec.md       | PASS         | PASS           | FAIL      | PASS
02-api/spec.md        | PASS         | PASS           | PASS      | PASS
03-frontend/spec.md   | FAIL         | PASS           | FAIL      | PASS

Issues found: 3
  [01] 01-auth: Cross-ref — declares "userModel" output but 03-frontend expects "UserSchema"
  [02] 03-frontend: Completeness — missing error handling expectations
  [03] 03-frontend: Cross-ref — references "authMiddleware" from 01-auth but 01-auth doesn't declare it as output

Fixing...
═══════════════════════════════════════════════════════════════
```

## Cascade Detection

When fixing a spec, check if the fix creates NEW issues in dependent specs:

- If you rename an output → check all specs that import it
- If you add a new dependency → verify the source spec provides it
- If you change scope → verify manifest dependencies are still accurate

Update `project-manifest.md` if dependency relationships changed during review.

## Common Issues to Watch For

| Issue | How It Manifests | Fix |
|-------|-----------------|-----|
| Vague scope | "Handle authentication" without specifying OAuth/JWT/sessions | Add specific mechanism from interview answers |
| Missing interface | Split A outputs "user data" but Split B expects specific fields | Define explicit field list in both specs |
| Orphaned dependency | Manifest says A→B but spec B never mentions needing A | Either remove dependency or add the reference |
| Interview amnesia | User said "must support SSO" but no spec mentions it | Add to the appropriate spec with interview reference |
| Implicit knowledge | Spec assumes reader knows the existing auth system | Add context section explaining current state |
