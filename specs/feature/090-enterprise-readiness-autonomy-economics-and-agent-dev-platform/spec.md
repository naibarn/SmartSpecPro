# 090 - Enterprise Readiness Autonomy Economics And Agent Dev Platform

Version: 1.0
Date: 2026-04-10
Status: Proposed
Depends-on: 048-auth-token-storage-hardening, 066-beam-billing-invoice-phase1, 068-billing-phase2-cards-autorenew, 075-unified-web-desktop-agent-platform, 082-work-os-case-ledger-and-operating-queues, 083-agent-registry-and-organization-model, 084-stateful-handoff-and-durable-run-ledger, 085-autonomy-ladder-and-hitl-control-plane, 086-agent-policy-guardrails-and-action-mesh, 087-enterprise-context-fabric-and-governed-memory, 088-agentops-tracing-evaluation-and-release-gates, 089-workforce-exchange-and-installable-operations-packs
Audience: Security, Platform, Billing, Developer Experience, Admin, Product Ops, QA

---

## 1. Executive summary

Feature 090 is the late-stage scale and adoption layer for Smart AI Hub.

It intentionally combines four concerns that should ship together:

- enterprise readiness
- autonomy economics
- agent developer platform
- operational adoption enablement

These belong together because a production workforce platform needs to be:

- secure enough for enterprise review
- measurable enough for financial scrutiny
- standardized enough for internal developers to build safely
- operable enough for real customer rollout

This enterprise layer must still respect the platform hierarchy:

- system admins can govern cross-tenant defaults and platform-wide controls
- tenant admins can manage readiness, rollout, and economics only for their own tenant
- regular users should keep using their own tenant work and teams without needing enterprise control access
- any developer platform features must produce tenant-scoped artifacts and audit trails

---

## 2. Problem statement

By the time Features 082-089 exist, SmartSpecPro can model work, agents, handoffs, policies, context, evaluation, and installable packs.

What still blocks enterprise-grade adoption is the final operating discipline:

- stronger identity and compliance controls
- cost-per-outcome visibility
- standardized internal SDK, tests, and release paths
- repeatable rollout and training playbooks

Without this feature:

- security review remains slower than necessary
- CFO and operations teams cannot quantify agent value clearly
- developers create agents inconsistently
- customer rollout depends too much on specialist knowledge

---

## 3. Goals

1. Strengthen identity, access, retention, and evidence controls for enterprise rollout.
2. Measure cost and ROI at the work, queue, pack, and role level.
3. Provide an internal developer platform for building and testing new agents safely.
4. Standardize rollout, migration, and operator onboarding practices.
5. Keep these capabilities grounded in the same policy, registry, and evaluation model established by prior features.

---

## 4. Non-goals

1. This feature does not itself certify SmartSpecPro for every compliance regime.
2. This feature does not replace existing billing or auth features; it extends them into workforce economics and enterprise control.
3. This feature does not make change-management training optional; it productizes the support layer around it.

---

## 5. Current-codebase fit

| Existing area | Current truth | Gap this feature fills |
|---|---|---|
| Feature 048 auth hardening | Token and auth hardening already exist | Extend to enterprise identity, access review, and evidence export |
| Features 066 and 068 billing | Billing and payment foundations already exist | Add workforce cost-per-outcome and ROI reporting |
| `apps/web/server/routers/tenantFeatureFlags.ts` | Rollout controls already exist | Standardize safe launch posture for enterprise workforce adoption |
| `apps/web/server/services/desktopReleaseService.ts` and `desktopReleaseBuildService.ts` | Release discipline already exists for desktop-host flows | Reuse rollout and verification discipline for workforce platform change control |
| `apps/web/server/services/skillStudioService.ts` | Builder workflows already exist | Add stronger internal agent SDK and test harness expectations |

---

## 6. Locked product decisions

1. **Enterprise trust is explainability plus control.**
   - Security posture must be inspectable, not implied.

2. **Autonomy must have economics.**
   - The platform should explain cost saved, not only tokens spent.

3. **Agent development must feel like service development.**
   - New agents need manifests, tests, rollout, and rollback standards.

4. **Rollout is a product capability.**
   - Adoption playbooks, pilot rings, and supervisor onboarding should not live only in tribal knowledge.

---

## 7. Functional requirements

### 7.1 Enterprise readiness

- Support or prepare for:
  - SSO / OIDC / SAML
  - SCIM provisioning
  - fine-grained ABAC overlays
  - dual-control approvals
  - retention and legal-hold workflows
  - audit evidence export
  - model and data usage attestations

### 7.2 Autonomy economics

- The platform must report:
  - cost per run
  - cost per successful outcome
  - cost per handoff
  - cost per approval
  - time saved versus human baseline
  - queue-level and role-level ROI

### 7.3 Agent developer platform

- Provide internal standards for:
  - agent manifests
  - prompt and policy registry
  - local simulator
  - replay CLI
  - scenario fixtures
  - policy regression tests
  - rollout and rollback hooks

### 7.4 Adoption enablement

- Product and ops teams must be able to run:
  - work discovery
  - candidate-task scoring
  - supervised pilot rollout
  - exception-handling training
  - supervisor onboarding

---

## 8. Acceptance criteria

1. Enterprise reviewers can inspect identity, access, retention, and audit posture without reverse-engineering agent behavior from raw logs.
2. Operators can measure cost per successful outcome and compare it to a human baseline for selected workloads.
3. Internal teams can create a new governed agent using one standard manifest and test workflow.
4. Tenant rollout can be staged through safe-launch posture with explicit pilot and rollback controls.
5. Product, security, finance, and developer-experience stakeholders can all reason about the same workforce platform using one shared operating model.
