# Alignment Review - Features 079 And 080

Version: 1.1
Date: 2026-04-10
Status: Reviewed
Scope: Coherence, completeness, safety, and autonomy realism across the autonomous work layer and the persistent role-agent layer

---

## 1. Overall verdict

The two-spec structure is the correct split.

- Feature 079 is the reusable automation layer.
- Feature 080 is the persistent AI organization layer.

Keeping them separate improves clarity, implementation sequencing, and safety.
It prevents role-level autonomy from bypassing workpack replay, benchmark, and policy controls.

---

## 2. Dependency and boundary check

| Layer | Responsibility | Why it belongs there |
|---|---|---|
| Feature 075 | Unified trusted web + desktop execution surfaces | Provides the managed runtime and trust envelope |
| Feature 037 | Task-first execution routing | Decides how bounded work should execute |
| Feature 079 | Case -> playbook -> workpack -> run -> benchmark | Defines the reusable unit of safe automation |
| Feature 080 | Role agent -> routine -> workpack ownership -> monitor | Defines persistent ownership, continuity, and org-level control |

Boundary rule:

- Feature 079 should never become a full AI org operating system.
- Feature 080 should never invent a second execution object that bypasses workpacks.

This review considers that boundary healthy after the latest edits.

---

## 3. Recheck results and applied fixes

### 3.1 Applied to Feature 079

- Added an explicit boundary that Feature 080 sits above the workpack layer.
- Added a goal that workpacks must be reusable by future persistent role agents.
- Added a non-goal clarifying that 079 does not own the always-on role monitor or AI org operating model.
- Added an integration rule that persistent role agents must execute through workpacks rather than bypass them.

### 3.2 Added in Feature 080

- Defined Role Agent as the persistent worker identity.
- Locked the key realism rule that persistence is logical continuity, not one immortal process.
- Defined role contracts, routines, authority envelopes, checkpoints, typed communication, and promotion gates.
- Added no-install managed posture requirements.
- Added anti-runaway controls, budget ceilings, emergency stop, and drift-triggered downgrade.

### 3.3 Added after implementation-aware recheck

- Bound Feature 080 explicitly to the now-implemented Feature 079 workpack substrate.
- Added a rule that Feature 080 must inherit `workpacksEnabled`, `workpackAutonomousPilot`, and `workpackOpsConsole` instead of creating a parallel rollout taxonomy.
- Added a rule that role-level emergency stop must fan into existing workpack incident controls.
- Added an integration requirement that the role monitor aggregates workpack readiness, telemetry, replay, and exception evidence rather than duplicating that state.
- Added rollout-phase and acceptance-criteria language so the first build of Feature 080 stays grounded in existing workpack control-plane surfaces.

---

## 4. Completeness assessment

| Concern | Coverage after recheck | Verdict |
|---|---|---|
| Reusable automation unit | Strong in 079 | Good |
| Persistent role ownership | Strong in 080 | Good |
| Role monitor UI | Strong in 080 | Good |
| Exception-only human oversight | Strong in both | Good |
| Replay and simulation before autonomy | Strong in 079, consumed by 080 | Good |
| Long-horizon continuity | Strong in 080 | Good |
| Self-improvement with safety gates | Strong in both | Good |
| No-install managed path | Covered by 075 and enforced in 080 | Good |
| Department-grade role modeling | Defined in 080, implementation still ahead | Good spec, pending product build |
| Typed inter-agent communication | Strong in 080 | Good |
| Rollout inheritance from implemented workpack gates | Now explicit in 080 | Good |
| Incident-state reuse instead of parallel kill switches | Now explicit in 080 | Good |

No structural contradiction remains between the two specs.

---

## 5. Safety and safe-launch review

The combined design is safe to pursue only if these launch gates are treated as mandatory:

1. Role agents may execute routine work only through approved workpack families.
2. Contract changes that expand authority must be reviewable and audit-logged.
3. Role agents must not self-grant new connectors, secrets, scopes, or budgets.
4. Replay, benchmark, and simulation evidence must remain mandatory before higher-autonomy promotion.
5. Emergency stop must exist at tenant, org, role, and routine scope.
6. Drift, loops, or repeated failure must downgrade or pause autonomy automatically.
7. Browser takeover and live approvals remain exception paths for sensitive browser routines.
8. High-risk labels such as CEO, finance, or legal must still honor explicit side-effect ceilings.
9. Feature 080 must not create autonomous role execution paths that bypass implemented Feature 079 rollout gates.
10. Feature 080 must not create a second incident ledger whose state can disagree with workpack incident controls.

If any of the gates above are skipped, the system may appear autonomous but will not be safe enough for real departmental ownership.

---

## 6. Autonomy realism review

The combined design can be "auto for real" if implemented with the following posture:

- routine work is modeled as scheduled or event-driven cycles, not ad hoc prompts
- role agents choose from approved workpacks instead of improvising every action
- durable checkpoints make recovery normal and expected
- typed handoffs prevent endless unstructured agent chatter
- KPI and backlog visibility turn autonomy into an operational system instead of a black box
- learning is tied to replay and benchmark evidence, not only model confidence

The most important realism decision is already captured in Feature 080:

- month-scale operation should come from resume and recovery
- not from one uninterrupted process that tries to stay alive forever

That decision sharply improves feasibility.

The most important implementation-aware decision after Feature 079 is now:

- role agents should orchestrate through the workpack substrate that already exists
- not through a fresh execution stack that would re-open safety and rollout questions

---

## 7. Remaining additions worth planning before implementation

These are not blockers for spec acceptance, but they should be planned before build-out:

1. Canonical scheduler and durable queue design for routine triggers and wake conditions.
2. Database persistence strategy for role contracts, checkpoints, handoffs, and promotion gates.
3. Tenant-level incident workflow for emergency stop, postmortem, and safe resume layered on top of existing workpack incident controls.
4. Role KPI evaluation harness so quality is measured by outcomes, not only activity.
5. Connector delegation matrix to prevent cross-role policy smuggling.
6. Recovery and archival policy for long-lived memory versus hot operational context.
7. A clear projection layer from workpack telemetry/readiness into role-monitor aggregates so the monitor remains explainable.

---

## 8. Final recommendation

Proceed with Feature 080 as a separate feature.

Use this implementation sequence:

1. Finish the reusable workpack substrate from Feature 079.
2. Add persistent role contracts, checkpoints, and the monitor shell from Feature 080.
3. Bind low-risk department routines to approved workpack families.
4. Roll out guarded autonomy before any lights-out operation.

This keeps the product safe, understandable, and much more likely to achieve real routine-work replacement instead of fragile demo autonomy.
