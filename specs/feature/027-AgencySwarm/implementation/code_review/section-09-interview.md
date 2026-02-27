# Section 09 Code Review Interview

## Decisions

### #1 CRITICAL: Save broken for existing agencies
**Decision:** Add `saveBuilder` mutation to agency router (user chose)
**Action:** Add new procedure, update frontend to call it

### #2 CRITICAL: Edge arrows not rendering
**Decision:** Auto-fix - use React Flow MarkerType instead of custom SVG refs
**Action:** Remove custom marker, use markerEnd prop from edge data

### #3 HIGH: edgeTypes not typed
**Decision:** Auto-fix
**Action:** Add EdgeTypes import and type annotation

### #4 HIGH: trpc as any casts
**Decision:** Let go - follows existing codebase pattern (WorkflowEditor uses same pattern)

### #5 HIGH: ToolPicker fetches non-existent listTools
**Decision:** Skip for now (user chose) - ToolPicker handles empty state gracefully

### #6 MEDIUM: handleAddAgent stale closure
**Decision:** Auto-fix - use ref-based check instead of nodes.length dependency

### #7 MEDIUM: No unsaved changes warning
**Decision:** Let go - nice to have, not critical for MVP

### #8 MEDIUM: Agency name not editable inline
**Decision:** Auto-fix - add onNameChange to toolbar

### #9 MEDIUM: No delete confirmation
**Decision:** Let go - agents can be re-added

### #10 MEDIUM: Publish doesn't save first
**Decision:** Let go - user is instructed to save first (toast message shown)

### #11-15 LOW issues
**Decision:** Let go for this section. #14 (infinite loop) will be auto-fixed.

## Fixes to Apply
1. Add `saveBuilder` mutation to agency router
2. Fix CommunicationEdge to use React Flow markers
3. Fix autoLayout infinite loop on cycles
4. Type edgeTypes
5. Fix handleAddAgent closure
6. Make agency name editable in toolbar
