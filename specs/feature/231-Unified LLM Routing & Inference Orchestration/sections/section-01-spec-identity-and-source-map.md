# Section 01 — Spec identity and source map

## Goal

Make implementation artifacts unambiguous and establish a verifiable owner map before touching global routing behavior.

## Implementation

1. Define immutable UIDs for LLM routing and Redis migration independently of their provisional display numbers.
2. Build a scanner/registry contract that accepts UID-qualified references, rejects ambiguous numeric-only references, and detects duplicate UIDs/numbers without rewriting either topic.
3. Inventory all HTTP, tRPC, Python, Worker, workflow, media, voice and internal callers that send inference requests; record auth context, selection lock, endpoint surface, stream/tool use, budget/settlement, current fallback and runtime owner.
4. Identify existing credit, Spec 220 policy, Spec 222 feedback, Spec 224/worker_jobs, conversation state and event/outbox owner contracts.
5. Capture baseline test outputs and pre-existing type diagnostics according to repository resource policy.

## Tests first

- UID collision and unqualified-reference rejection tests.
- Scanner fixtures for valid alias, duplicate UID, duplicate number, missing spec and cross-spec stale reference.
- Caller inventory completeness check that rejects an unowned active callsite.

## Acceptance

- Both topics remain intact; no number is reassigned absent the live registry gate.
- Every discovered active production source entrypoint has a runtime owner or a typed unresolved owner.
- No schema, route or provider behavior is changed in this section.

## UI/UX Contract

### Target User / JTBD
N/A — repository metadata and source inventory only; no browser workflow changes.

### Existing Pattern Reference
N/A — no UI is designed or modified in this section.

### Surface Inventory
N/A — no UI surface changes.

### Component Map
N/A — no UI component changes.

### State Matrix
N/A — no UI states are introduced.

### Responsive Matrix
N/A — no UI layout changes.

### Accessibility Acceptance
N/A — no UI changes.

### Visual Direction and Tokens
N/A — no UI changes.

### Copy Contract
N/A — no user-facing copy changes.

### Browser Evidence Required
N/A — no UI changes; repository scanner/CI output is the relevant evidence.
