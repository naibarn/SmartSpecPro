# Section 13 Code Review Interview

## Auto-fixes Applied

### M1: Shared tools resolved per-agent → cached per-run
- **Issue**: `resolve_shared_tools_for_agency()` called inside per-agent loop (N+1 queries)
- **Fix**: Added `self._shared_tools_cache` to `AgencyOrchestrator.__init__()`. First agent resolves shared tools; subsequent agents reuse the cached list.
- **Status**: Applied

## Items Let Go
- L1: `ConversationStarterChips` and `SharedInstructionsPanel` not yet wired into builder page — these are standalone components for the chat view and settings panel, which are separate UI concerns.
- L2: `SharedToolsBadge` not yet used in `ToolPicker` — will be integrated when the shared tools management UI is built.

## No User Interview Needed
All findings were either auto-fixable or intentional scope boundaries.
