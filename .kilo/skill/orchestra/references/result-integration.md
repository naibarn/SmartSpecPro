# Result Integration

Defines how the orchestra conductor processes wave outputs after all agents in a wave have
returned their Result Reports. Read by SKILL.md Step 5.

Result Report schema is defined in `../../sub-agents/contracts/result-report.schema.md`.

---

## Step-by-Step Integration Process

After every wave completes, the conductor follows these steps in order:

### Step 1: Collect Outputs

Read each agent's Result Report. Parse the 6 fields:
- `status`: completed / partial / failed
- `files_changed`: list of absolute paths modified or created
- `findings`: observations, warnings, or unexpected behavior
- `blockers`: issues preventing the agent from completing
- `next_steps`: what the agent recommends for the next wave
- `quality_gate_results`: pass/fail status of any gates the agent self-ran

### Step 2: Detect File Conflicts

For each file path in any `files_changed` list, check if more than one agent reports
changes to the same path. If yes, flag it as a conflict and proceed to the merge strategy.

Single-agent waves (sequential dispatch) cannot have file conflicts — skip this step.

### Step 3: Apply Merge Strategy

```
Are the changes in different sections or functions of the file?
  YES → Manual merge: read both agents' versions, combine non-conflicting changes, write result.

  NO  → Conflicting implementations. Apply contract-compliant resolution:
         1. Re-read orchestra/contracts.md.
         2. Determine which agent's output matches the agreed interface.
         3. Accept the contract-compliant version.
         4. Log the decision in orchestra/decisions.md (see format below).
         5. Re-dispatch the non-compliant agent with a Task Packet containing:
            - The accepted implementation as context
            - The contract the agent must comply with
            - A note that its previous output was superseded
```

### Step 4: Verify Contract Compliance

Compare each agent's output against the contract in `orchestra/contracts.md`:
- Correct files modified (ownership boundaries respected)?
- Output API shape matches the agreed interface?
- No out-of-scope modifications to files the agent does not own?

If an agent went out of scope, flag a contract violation. Log it to `orchestra/decisions.md`
and re-dispatch with tighter constraints.

### Step 5: Update Progress

Write wave status to `orchestra/progress.md`:
- Wave number and completion status (completed / partial / blocked)
- Files changed (list of absolute paths)
- Gate results (which gates passed/failed)
- Any blockers to carry into the next wave

### Step 6: Check Pre-Merge Security Gate

After the **final wave only**, evaluate whether trigger conditions in
`security-review-protocol.md` apply to the full session's changed files. If any condition
matches, run the pre-merge security gate before reporting completion.

---

## Merge Strategy

### Conflict Resolution Log Format (orchestra/decisions.md)

```
[YYYY-MM-DDTHH:MM:SSZ] Auto-resolved conflict
File: <absolute-repo-root>/apps/web/server/routers/dashboard.ts
Kept: backend agent output (matches contract: trpc.dashboard.getSummary response shape)
Superseded: frontend agent's incidental modification to the same router file
Re-dispatching: frontend agent with corrected scope constraints
Contract reference: orchestra/contracts.md — frontend ↔ backend — UserDashboard
```

---

## When to Pause for User

Conductor auto-resolves conflicts silently in most cases. Pause for user input only when:

- Both agents produced implementations that each claim to match the contract, but the
  contract itself is ambiguous (e.g., the Zod schema allows either interpretation)
- Resolving the conflict would require re-running more than one previous wave
- An agent returned `status: failed` with a blocker that cannot be fixed by re-dispatch
  (external API unavailable, required file deleted by another agent, missing dependency)

When pausing: present both implementations side-by-side, explain the conflict, and ask the
user which to accept. Do not proceed until the user responds.

---

## Failed Agent Handling

If an agent returns `status: failed`:

1. Read the `blockers` field in its Result Report.
2. If the blocker is fixable (wrong file path, missing import, minor schema mismatch):
   construct a fix Task Packet and re-dispatch.
3. If the blocker is unfixable (external service down, unresolvable merge conflict,
   missing dependency that requires a new wave): log to `orchestra/progress.md`, create the
   necessary backlog/follow-up item automatically, and continue if the remaining route is still
   safe. Pause only when the blocker implies destructive recovery, accepted-risk security bypass,
   or ambiguous product direction.
4. Never silently skip a failed agent's work and proceed to the next wave.

---

## Output Files

| File | Updated When | Content |
|------|-------------|---------|
| `orchestra/progress.md` | After every wave | Wave N status, files changed, gate results, blockers |
| `orchestra/decisions.md` | On every auto-resolution or auto-approval | Timestamp, decision, rationale, contract reference |
| `orchestra/contracts.md` | Never modified after creation | Read-only during integration; frozen after Wave 1 |
