# Section 07: Readiness, observability and Staging acceptance

## Requirements

REQ-311-01, REQ-311-14, REQ-311-16, REQ-311-17, REQ-311-18, REQ-311-19.

## Operational suspension

Live migration was disabled and trial compute resources removed by owner direction on 2026-11-01. Perform independent local implementation and verification first. Any provider spike, reprovisioning or deployment described below is a future live-phase deliverable, not authorization to recreate resources now. Follow spec.md R1.1 and cloudflare-decommission-20261101.md; historical IDs/receipts are not live readiness.

## Prerequisites

section-03, section-04, section-05, section-06. Reconcile current canonical source, handoff and existing implementation before changing code.

## Touched scope

Existing deployment readiness/admission services and AdminDeploymentTargets UI, Worker diagnostics, focused service/integration/browser suites and canonical Spec evidence.

## Implementation tasks

Wire exact completeness and runtime evidence into the existing server-side readiness path with readable per-component reasons and next actions; keep legitimate secret/IAM/budget checks. Make missing/expired observations fail closed, and preserve Prepare recovery behavior. Trace API/job/source/config/deployment while protecting sensitive data.

Execute all mapped routes/job types, real user auth/email/Chat/upload/billing flows and controlled test-tenant writes on Staging. Intentionally make application Containers and Debian application fallback unavailable for ordinary flows; correlate provider/egress evidence rather than trust headers. Run failure/recovery drills and a supervised 24-hour soak across old Container/profile boundaries. Test planned load and compare frozen baselines; record cost and Container-start evidence per workload. Any newly discovered active dependency reopens acceptance.

## Focused verification

Unknown/expired/missing per-component readiness prevents dispatch/cutover with a human-readable reason and enabled safe recovery; app Containers and Debian app egress unavailable while ordinary flows pass; full mapped fault suite, provider traces, no headers-only proof; minimum 24-hour supervised soak and measured costs.

## Observable deliverable

Verified implementation for the mapped behavior with exact-source evidence and explicit remaining inventory/requirement gaps. Preserve every unrelated dirty change. A completed section does not close runtime acceptance without its required live proof.

## Known gaps and next action

Runtime behavior is unverified at planning time. Start by inspecting the named source and actual capability, add the scoped failing test/proof, implement the smallest compatible slice, integrate promptly, and update the existing canonical requirement handoff. Do not allocate new infrastructure or claim provider access based on a source stub.
