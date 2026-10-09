# SPEC-231 / SPEC-232 / SPEC-245 Identity Reconciliation Finding

Baseline: task worktree from `origin/main` `05ffe1c9640fda1e3324514daaa456cb3f0d020a`.

## Evidence observed

1. `specs/feature/231-Unified LLM Routing & Inference Orchestration/spec.md` §§98–101 states an owner-directed allocation of 231 to LLM routing, 232 to Redis/BullMQ migration, and 245 to the broader Cloudflare migration, but §98 itself says Git reservation remains pending and requires verification.
2. `specs/feature/232-Zero-Downtime RedisBullMQ to Cloudflare Migration & Runtime Hardening/handoff/requirement-ledger.json` contains a requirement claiming the user assigned 232 to Redis because 231 is the independent LLM Routing Spec. This is a design/ledger assertion, not an owner-signed identity record.
3. `specs/feature/245-Full-System Cloudflare Migration Master Plan/handoff/requirement-ledger.json` contains a requirement assigning 245 to broader migration planning and 232 to Redis/BullMQ cutover. It is also a requirement assertion, not an authority disposition.
4. `specs/_config/spec-id-registry.json` has no 231/232/245 alias or historical-disposition record that supplies an owner decision or resolves those references. `specs/_status/spec-id-registry.json` lists those IDs as occupied but does not identify owner authority.
5. `specs/_status/spec-index.json` separately lists canonical paths for 231, 232, and 245, but marks each `authority=UNRESOLVED`, `disposition=DORMANT_UNRESOLVED`, and `continuation=RECONCILIATION_REQUIRED`. Their handoff histories each contain only low-confidence automated reconciliation snapshots on 2026-10-06, with no owner decision event.
6. A read-only open-PR query returned no open PRs at initial task discovery. Existing task worktrees and historical commits do not replace a current owner decision or registry disposition.

## Classification

`RECONCILIATION_REQUIRED` — the content and cross-Spec claims align around 231/232/245 as separate topics, but there is no canonical owner/registry decision sufficient to confirm authority. Do not assign, renumber, alias, promote status, or rewrite old references in this task. Preserve all historic records.

## Reactivation predicate and next safe action

- **Reactivation predicate:** an authenticated Spec owner decision names the exact canonical logical UID/path for 231, 232, and 245 and the identity treatment for historical bare-231 references; the decision is recorded in the supported registry/Handoff workflow; aliases and source digests validate; refreshed index shows one authority per identity.
- **Next safe action:** obtain/locate that owner decision and reconcile the three identities through the canonical writer and repository registry workflow. Only afterward may the conditional DirectSDK design be treated as a normative routing-provider proposal; commercial entitlement and Runner acceptance remain separate gates.

This finding is not evidence that the proposed owner mapping is false. It records that the checked canonical authority sources do not yet approve it.
