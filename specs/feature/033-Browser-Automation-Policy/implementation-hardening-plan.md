# Implementation Hardening Plan

## Objective

Close the high-severity gap identified in the post-implementation security review by making browser-policy controls active on the live browser execution path and persisting decision evidence durably before any tenant-facing rollout expansion.

## Work items

1. Complete the section-04 execution seam
   - Carry workflow identity, execution identity, and per-action context into the live Automation Copilot / Python executor path.
   - Invoke the Node-owned browser-policy contract before every action dispatch and on navigation, frame, popup, redirect, download, upload, and prompt transitions.
   - Fail closed when the policy callback is unavailable.

2. Persist live audit artifacts
   - Create the additive raw SQL migration for the browser-policy decision table and monthly partitions.
   - Wire `browserPolicyAuditLogger` artifacts into JSONL output and structured DB writes from the live decision path.
   - Verify tamper-evident chain continuity across persisted events.

3. Activate incident controls in runtime
   - Wire kill switches, domain/category deny overrides, and approval revocation into executor dispatch and approval polling/resume flow.
   - Add operator-visible state surfaces for revocation and emergency overrides.

4. Harden trust-boundary classification
   - Replace the same-site heuristic with a PSL-aware resolver shared by Node and Python.
   - Add edge-case domain tests for public suffixes and multi-level registrable domains.

## Exit criteria

- Every live browser action and transition is denied, approved, or allowed only through the shared policy contract.
- Browser-policy decisions are durably written to JSONL and DB storage with verifiable integrity metadata.
- Kill switches and approval revocation fail closed on the live executor path.
- Rollout helpers are consumed by deployment or operator tooling before tenant-facing expansion.
