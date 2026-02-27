# Section 09 Code Review: Frontend Builder

## Critical Issues

### 1. CRITICAL: Save for existing agencies doesn't persist agents/edges/tools
The update branch only sends `name` and `status`. The backend `update` mutation doesn't accept agents or communicationFlows. Canvas edits are lost on refresh for existing agencies.

### 2. CRITICAL: CommunicationEdge uses non-existent SVG marker definitions
Edge path uses `markerEnd={url(#arrow-${flowType})}` but no SVG defs block exists. Arrows won't render.

### 3. HIGH: edgeTypes not typed (inconsistent with nodeTypes)

### 4. HIGH: trpc as any casts destroy type safety
Multiple `(trpc as any)` usages. Follows existing WorkflowEditor pattern but bypasses type checking.

### 5. HIGH: ToolPicker fetches from `agency.listTools` which doesn't exist
The procedure doesn't exist in the agency router. Tool assignment is non-functional.

## Medium Issues

### 6. handleAddAgent stale closure over nodes.length
### 7. No unsaved changes warning (no beforeunload handler)
### 8. Agency name not editable inline (plan says it should be)
### 9. No delete confirmation dialog
### 10. Publish doesn't save current canvas state first

## Low Issues

### 11. Model field is plain text input, not Select/Combobox
### 12. Temperature/TopP sliders use raw HTML input instead of project Slider
### 13. AgencyBuilder test coverage misses interaction tests
### 14. autoLayout BFS can infinite loop on cyclic graphs
### 15. Route ordering dependency not documented
