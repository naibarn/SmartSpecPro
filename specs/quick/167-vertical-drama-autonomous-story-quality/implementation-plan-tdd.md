# TDD plan

1. Add pure contract tests first:
   - protagonist cannot hear a secret in a different shot/location;
   - protagonist present during an unmarked secret produces a repair finding;
   - premise facts with contradictory knowledge produce a finding;
   - same event fingerprint repeats only when no cause/difference is supplied;
   - clean 50/120 episode ledgers pass.
2. Add repair-policy tests:
   - content findings retry and then return a structurally complete
     `completed_with_warnings` best-known result;
   - operational failures remain retryable and never accept fallback prose;
   - target episodes include bounded closure neighbors;
   - attempt keys are distinct per repair and idempotent on redelivery.
3. Add long-form runtime tests for 120 episodes, accepted block preservation,
   repair impact bounds, final closure repair, and checkpoint resume.
4. Add story-bible/script/pipeline wiring tests proving the ledger and findings
   enter prompts and that validation runs after hydration/revise.
5. Run focused tests from the repository root using the existing npm workspace
   command, then affected typecheck and diff checks.
