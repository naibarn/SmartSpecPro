# Section 05 — Chat-to-Native Bridge Gate

## Objective

Define a future narrow consumer adapter from existing authenticated SmartAIHub Chat into canonical work admission, only after its Runner/Chat producer contract is stable and approved.

## Requirement IDs

R1.3.2–R1.3.5 and R1.3.7; A58, A60–A63.

## Scope

Separate SPEC-310 consumer code and tests only after entry criteria. Do not change WP1–WP2C2, Desktop Auth, Companion Chat, Task Control, `chat.runOnRunner`, or protected main. Do not use `llm:chat` as execution authority.

## Prerequisites

Exact merged producer SHA and contract version; explicit owner acknowledgement; existing SPEC-279/195 admission; distinct per-run execution, capability and Gateway/credit authority; SPEC-224 E2E remains priority.

## Deliverable and completion predicate

Bridge creates one canonical job only after authorization; replay conflicts, missing/revoked grants, stale schema and unavailable Runner fail closed; cancellation is reconciled to observed terminal state. Projection remains canonical and producer files remain unchanged.

## Verification and evidence

Consumer/provider compatibility tests bound to merged SHA, identity/scope denial tests, duplicate/replay tests, feature-off regressions and scoped diff proof. No bridge success is claimed from current open PR heads.

## Blocker challenge

Without stable approved ingress, mark `WAITING_STABLE_APPROVED_RUNNER_CHAT_CONTRACT`; continue isolated runtime and non-Git contracts that do not depend on Chat dispatch.
