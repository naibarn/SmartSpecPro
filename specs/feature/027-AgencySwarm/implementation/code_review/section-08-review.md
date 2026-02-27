# Section 08 Code Review

## HIGH SEVERITY
1. **Feature flag gating non-functional** - Neither page checks AGENCY_SWARM_ENABLED. Menu `requiresFeature` field is dead code.
2. **No cleanup on unmount** - useAgencyStream has no useEffect cleanup; fetch connection leaks on navigation.
3. **Stale options closure** - `connect` callback captures stale `options` object; callbacks may fire from old render.

## MEDIUM SEVERITY
4. **ScrollArea ref broken** - ScrollArea doesn't forward refs; auto-scroll never works.
5. **Token message ID collision** - `stream-${agent}` collides when same agent responds multiple times.
6. **streamingMsgRef not reset on agent_switch** - Agent B's message gets Agent A's tokens prepended.
7. **Pervasive `any` types** - Multiple files use `any` where proper types should be used.
8. **Unused useAgencyConversations import** - Imported but never called.

## LOW SEVERITY
9. tenantId parameter missing from useAgencyList
10. Duplicated AGENT_COLORS/getAgentColor across files
11. handleSend/handleKeyDown not memoized
12. Panel open state doesn't respond to resize
13. Activity panel missing expand/collapse per-step
14. Tests use setTimeout-based timing

## ALL ISSUES ADDRESSED
- H1: Rely on server-side tRPC error + redirect on isError
- H2: Added useEffect cleanup
- H3: Stored callbacks in refs
- M4: Replaced ScrollArea with plain div
- M5: Added run counter to message IDs
- M6: Reset buffer on agent_switch
- M7: Added AgencyItem interface, removed `any` casts
- M8: Removed unused import
