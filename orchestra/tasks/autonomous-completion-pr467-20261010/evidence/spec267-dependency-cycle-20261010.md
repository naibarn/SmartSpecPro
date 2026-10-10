# SPEC-267 Dependency-Cycle Recovery Evidence

- Canonical source SHA tested: `e20e13db2f01f5eb19d7dc611d753328ed084de4` (`origin/main` at run time).
- Implementation integration SHA: PR #471 squash merge `d72bb64b9e9e8dc326b872f6bb249126591c1642`; the tested canonical SHA is its descendant and the `jobControlPlane.ts` implementation/test tree is unchanged.
- Command, run from `apps/web`:

  ```sh
  pnpm exec vitest run server/services/__tests__/jobControlPlane.test.ts -t 'does not claim a dependent Job|fails a dependent Job closed|fails a multi-job dependency cycle|detects a dependency cycle through|keeps oversized dependency scans|rejects a known adapter|fences stale workers|increments the business attempt once|does not auto-dispatch an operator-review retry|recovers a lease-expired story checkpoint'
  ```

- Result: 1 file passed; 10 tests passed; 63 tests skipped by the focused name filter; duration 1.79s. This is a focused unit-test result, not DB integration, full typecheck, CI, deployment, or production evidence.
- Covered: proven two-node and transitive cycles fail closed; one failure event is emitted for the claimed root; an independent job remains claimable; a graph exceeding the 128-node scan budget remains queued without a false cycle diagnosis; existing dependency, adapter, lease-fencing and retry behavior remains covered.
- Implementation: `apps/web/server/services/jobControlPlane.ts`; tests: `apps/web/server/services/__tests__/jobControlPlane.test.ts`.
- State: `IMPLEMENTED` and `TESTED` for this requirement; not evidence that SPEC-267 overall is complete, deployed, or production ready.
