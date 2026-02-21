# Section 02 Code Review Interview

## Auto-fixed
1. **Export types** (HIGH) — Exported `WorkflowJson`, `WorkflowNode`, `WorkflowEdge`, `WorkflowNodeData` for Section 04 integration.
2. **DB compatibility** — Added `parentId?` to `WorkflowNode`, `type?` to `WorkflowEdge`, and index signature on `WorkflowNodeData` for `Record<string, any>` compatibility.

## Let go
- O(N*E) in `assignGridPositions` — acceptable for <20 nodes per template
- Cycle rendering quality — edge case for template data (all templates are DAGs)
- Missing `<g>` wrapper on nodes — functionally equivalent
- Missing `edgeId` on paths — not needed for display
- Inlined `fitToViewport` — functional equivalent of separate function
- Additional color category tests — the 4 tested colors verify the lookup logic works
- XML well-formedness test depth — basic check is sufficient for this use case
