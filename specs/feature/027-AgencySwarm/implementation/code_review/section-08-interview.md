# Section 08 Code Review Interview

## Auto-approved (per user directive to auto-approve non-security items)

### H1: Feature flag gating — AUTO-FIX
Add `useFeatureFlag('AGENCY_SWARM_ENABLED')` check to both AgencyBrowser and AgencyChat, redirect to /dashboard if disabled. Menu filtering deferred (shared package change out of scope).

### H2: useEffect cleanup for stream disconnect — AUTO-FIX
Add `useEffect(() => () => disconnect(), [disconnect])` to useAgencyStream.

### H3: Stale options closure — AUTO-FIX
Store onRunFinished/onError in refs, read from refs inside handleSSEEvent.

### M4: ScrollArea ref not working — AUTO-FIX
Replace ScrollArea ref approach with a simple div wrapper for auto-scroll.

### M5: Token message ID collision across agent switches — AUTO-FIX
Include run counter in stream message IDs.

### M6: streamingMsgRef not reset on agent_switch — AUTO-FIX
Reset streamingMsgRef and finalize previous agent's message in agent_switch handler.

### M7: `any` types — PARTIAL FIX
Add proper typing where feasible. Full typing depends on tRPC router shape which is not yet implemented, so use interim types.

### M8: Unused useAgencyConversations import — AUTO-FIX
Remove unused import.

### L9: tenantId parameter — LET GO
Multi-tenant routing for agency list can be added when the tRPC router is implemented.

### L10: Duplicated agent colors — LET GO
Minor duplication, extract later during cleanup.

### L11: handleSend/handleKeyDown memoization — LET GO
Not impactful for performance.

### L12: Panel resize listener — LET GO
CSS handles responsive behavior adequately.

### L13: Expand/collapse per-step — LET GO
Nice-to-have enhancement for a future pass.

### L14: setTimeout-based test timing — LET GO
Standard pattern in this codebase; waitFor alternative adds complexity.
