# Section-08 Code Review — 2026-07-16 (ssp-reviewer)

Verdict: REQUEST_CHANGES (as scoped) → resolved per triage below.

## Findings

1. **BLOCKER (as-scoped) — foreign MCP auto-resolution hunk in
   mediaTransportResolver.ts (L150-183 + sharedGroupId change):**
   untested MCP connection auto-resolve logic (personal-default /
   single-eligible inference + new error copy) rides in the staged file.
   DISPOSITION: identified as a concurrent MCP-sharing session's
   uncommitted work — `mediaTransportResolver.ts` AND its companion
   `mcpConnectionSharingService.ts` were both in the dirty list at session
   start, before section-08 touched anything. Shared-tree ride-along
   policy applies (prod already runs this content; deleting = destroying
   another session's work). Noted prominently in the commit body; the
   reviewer's concern (zero tests on those paths) is flagged to the owner
   via the commit note.
2. **MEDIUM — seed SQL ON CONFLICT omits creditCost** while the tested
   helper recomputes it (helper/SQL parity break). FIXED.
3. **MEDIUM — storyboardReviewWorkspace.ts normalizer narrows away
   hermes_worker/provider_account** (client lib, L574/L585). Not reachable
   until hermes is offered on storyboard_review. DEFERRED → carried into
   section-09/10 dispatch briefs as a required fix.

## Clean
Two-Grok-paths rules (names/aliases/provider/creditCost); configJson vs
consumer contract (limits 3/3/1, durations 1-15 match kie.ai row,
maxItems, pricing); resolver hermes branch (flag order, wire-format
errors, no DB reads pinned by tests, symmetric cross-transport
rejections); seed --dry-run truly connectionless; isMainModule guard;
McpCreditPolicy widening ripple checked (one passthrough consumer safe).
