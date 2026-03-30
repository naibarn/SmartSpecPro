# Section 11: Memory Panel UI

## Section ID
`section-11-memory-panel-ui`

## Dependencies
- **section-10-trpc-endpoints** -- provides `memory.getArchive`, `memory.searchArchive`, `memory.searchMemoryContext` tRPC procedures
- **section-01-schema-migration** -- `scoped_memories` table with `sourceType`, `ownerType`, `ownerId` columns
- Existing `scopedMemoryRouter` provides `scopedMemory.search`, `scopedMemory.update`, `scopedMemory.delete`

## Overview

Update the existing `MemoryPanel.tsx` component to display both legacy entity memories and new vector-indexed scoped memories (extracted facts) in a unified, merged view. Each item shows an `[auto]` or `[manual]` badge to indicate origin. The panel adds edit, delete, and promote/demote importance actions for scoped memories.

## Files to Modify

| File | Action |
|------|--------|
| `apps/web/client/src/components/chat/MemoryPanel.tsx` | Modify -- add scoped memory query, merged view, badges, actions |

## Files to Create

| File | Action |
|------|--------|
| `apps/web/client/src/components/chat/__tests__/MemoryPanel.test.tsx` | Unit tests |

---

## Data Sources

Two independent tRPC queries merged client-side:

1. **Entity memories (legacy)** -- `trpc.memory.getEntityMemories.useQuery(...)` (existing)
2. **Scoped memories (new facts)** -- `trpc.scopedMemory.search.useQuery({ scopes: [{ type: "user", id: String(userId) }] })`

Fetched in parallel, merged and sorted by `lastAccessedAt ?? createdAt` descending. Rules pinned to top.

---

## Merged View

### Unified Item Shape

```typescript
interface MemoryDisplayItem {
  displayId: string;          // "entity-{id}" or "scoped-{id}"
  source: "entity" | "scoped";
  rawId: number | string;
  title: string;
  contentLines: string[];
  typeLabel: string;
  typeKey: string;
  importance: number;
  reinforcementCount: number;
  lastAccessedAt: string | null;
  createdAt: string | null;
  originBadge: "auto" | "manual";
  memoryKind?: string;
}
```

### Badge Display

- `[auto]` -- Badge variant="outline", blue/indigo tint
- `[manual]` -- Badge variant="outline", green tint

### Type Config for Scoped Memories

```typescript
const memoryKindConfig = {
  fact: { icon: Brain, label: "Fact", color: "bg-blue-500" },
  rule: { icon: Shield, label: "Rule", color: "bg-amber-600" },
  preference: { icon: Settings2, label: "Preference", color: "bg-purple-500" },
  decision: { icon: GitBranch, label: "Decision", color: "bg-red-500" },
  note: { icon: FileText, label: "Note", color: "bg-gray-500" },
  checklist: { icon: CheckSquare, label: "Checklist", color: "bg-yellow-500" },
  artifact_note: { icon: Code2, label: "Artifact", color: "bg-orange-500" },
};
```

---

## Actions for Scoped Memories

### Edit (inline dialog)
Reuse Add Memory dialog pattern, pre-fill fields. Call `trpc.scopedMemory.update.useMutation({ memoryId, title?, content?, importance? })`.

### Delete
AlertDialog pattern. Call `trpc.scopedMemory.delete.useMutation({ memoryId })`. Invalidate scoped query on success.

### Promote/Demote Importance
Up/down arrows. Call `trpc.scopedMemory.update.useMutation({ memoryId, importance: current +/- 1 })` clamped [1, 10].

---

## Tests

```
# Test: renders entity memories with [auto] badge when source is "auto"
# Test: renders scoped memories with [manual] badge when sourceType is "manual"
# Test: merged list pins rule-type memories at the top
# Test: merged list sorts non-rule items by lastAccessedAt descending
# Test: delete button on scoped memory calls scopedMemory.delete
# Test: importance up arrow calls scopedMemory.update with importance + 1
# Test: importance up arrow does not exceed 10
# Test: importance down arrow does not go below 1
# Test: edit dialog opens pre-filled for scoped memory
# Test: type filter filters both entity and scoped memories
# Test: normalizeEntityMemory maps fields to MemoryDisplayItem shape
# Test: normalizeScopedMemory maps fields to MemoryDisplayItem shape
```

---

## Implementation Notes

- `MemoryPanel.tsx` is currently 762 lines. Modifications add ~100-150 lines.
- The existing entity memory list rendering (lines 616-693) should iterate over merged `MemoryDisplayItem[]`.
- Add Memory dialog remains entity-memory-only (existing).
- Refresh button invalidates both `memory.getEntityMemories` and `scopedMemory.search`.
- Get `userId` from auth context (check `useAuth()` hook or similar pattern in the codebase).
