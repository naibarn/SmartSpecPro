# Section 01 — Contract foundation

## Objective

Create the additive, cross-language assurance envelope used by every task kind. Reuse the existing Agent Runtime contract and keep current/current-minus-one compatibility.

## Files

- Add `apps/web/shared/agentRuntime/orchestraSchemas.ts` and focused tests under `apps/web/shared/agentRuntime/__tests__/`.
- Add `python-backend/app/services/agent_output_assurance.py` contract models and `python-backend/tests/unit/test_agent_output_assurance.py`.
- Extend existing request/response types only with optional assurance fields; do not break legacy readers.

## Acceptance

Task kind, lifecycle, budget, evidence policy, provider profile, output contract, side-effect token, contract hash and result schemas reject invalid input with stable codes. Canonical JSON hashing produces identical vectors in Node and Python. No secrets or raw untrusted content are included in the hash.

## Tests

Run the Python focused contract test and the Node assurance test. Also run `git diff --check`.
