# Spec 231 planning interview

No follow-up questions were asked, per the user's explicit instruction that routine route, approach and implementation decisions proceed autonomously.

## Auto-decisions

1. Routine inference requests use `AUTO` and are routed without asking the user to choose a provider on every request.
2. A model/provider lock is not silently overridden. Only a pre-approved equivalent may be selected automatically; otherwise return a typed consent-required or unavailable result according to the lock contract.
3. Missing policy, budget, consent, capability, credential owner, deployment qualification or immutable-route proof rejects external egress. Do not reinterpret the request as approval.
4. Retain existing credit, authorization, retrieval, job and tool-effect authorities. Add no parallel billing ledger, approval engine, retrieval index or job queue.
5. Implement the deterministic contract and safety path first; learned routing and shadow evaluation remain disabled until data consent and evaluation gates pass.
6. Keep changes on `codex/spec231-completion`, based on the checked-out `main` HEAD, because the user's shared checkout contains unrelated pending edits.
7. Keep Spec 231 and the duplicate Redis-migration topic under stable `spec_uid` values. Number reassignment remains blocked until the live authoritative registry is available.
