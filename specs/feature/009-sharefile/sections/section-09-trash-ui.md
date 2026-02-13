# Section 09: Trash UI

## Overview

This section implements the Trash UI component for SmartSpecPro's Document Management feature. The Trash Panel displays soft-deleted files with a 90-day retention period, allows restoration, and supports permanent deletion. Only file owners can view and manage trash items (sharees do not see deleted files).

## Dependencies

**Required sections:**
- section-01-database-schema (deletedAt, deletedBy columns)
- section-05-library-router (listTrash, restoreFromTrash, permanentDelete endpoints)

## Files to Create/Modify

### New Files
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/library/TrashPanel.tsx`

### Modified Files
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/DocumentManagement.tsx` (add 4th tab)

## Background Context

### Interview Requirements

From the interview notes:
- **Interview Q2:** "When owner deletes a file, sharees should not see it in 'Shared With Me' immediately"
- **Interview Q3:** "Only the owner can permanently delete files from trash"
- **Interview Q4:** "Deleted files are excluded from search results"
- 90-day retention period before auto-purge
- Owner-only visibility for trash items

### Technical Context

The trash system uses soft deletes:
- `library_items.deletedAt` timestamp marks deletion
- `library_items.deletedBy` tracks who deleted the file
- Files remain in database for 90 days
- Background job (section-06-trash-job) purges files after 90 days

## Tests First

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/library/TrashPanel.test.tsx`

```typescript
/**
 * Test stubs for TrashPanel component
 * Write these tests BEFORE implementing the component
 */

describe('TrashPanel', () => {
  describe('Rendering', () => {
    test.todo('renders only owner\'s deleted items');
    test.todo('shows relative deleted date ("5 days ago")');
    test.todo('shows days until auto-purge (90 - daysSinceDeletion)');
    test.todo('shows warning badge when < 7 days remaining');
    test.todo('shows "Deleted by" user name');
    test.todo('shows empty state when trash is empty');
    test.todo('renders as 4th tab in DocumentManagement');
  });

  describe('Actions', () => {
    test.todo('calls restoreFromTrash mutation on "Restore" button click');
    test.todo('calls permanentDelete mutation on "Delete" button click');
    test.todo('shows confirmation dialog before permanent delete');
    test.todo('shows "Empty Trash" button only when items exist');
  });

  describe('Authorization', () => {
    test.todo('shows restore button for all trash items (owner-only visibility)');
    test.todo('shows delete button only for owner (not deleter if different)');
  });

  describe('Accessibility', () => {
    test.todo('has proper ARIA labels for action buttons');
    test.todo('has accessible empty state message');
    test.todo('warning badge has appropriate role and aria-label');
  });
});
```

## Implementation Details

### TrashPanel Component Structure

**Component signature:**
```typescript
interface TrashPanelProps {
  // No props needed - queries based on authenticated user
}

export function TrashPanel(): JSX.Element;
```

**State management:**
```typescript
const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
```

**Queries:**
```typescript
const { data: trashItems, isLoading, error } = trpc.library.listTrash.useQuery({
  limit: 50,
  offset: 0
});
```

**Mutations:**
```typescript
const restoreMutation = trpc.library.restoreFromTrash.useMutation({
  onSuccess: () => {
    // Invalidate trash list and main library list
    trpc.library.listTrash.invalidate();
    trpc.library.list.invalidate();
  }
});

const deleteMutation = trpc.library.permanentDelete.useMutation({
  onSuccess: () => {
    trpc.library.listTrash.invalidate();
  }
});
```

### Layout Specification

```
┌─────────────────────────────────────────────────────┐
│ 🗑️ Trash                             [Empty Trash]  │
├─────────────────────────────────────────────────────┤
│ Items will be permanently deleted after 90 days.    │
├─────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐ │
│ │ 📄 Marketing Plan Q1.docx                      │ │
│ │    Deleted by You • 5 days ago • 85 days left  │ │
│ │                          [Restore] [Delete]    │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ 📊 Sales Report.xlsx                           │ │
│ │    Deleted by John Doe • 15 days ago • 75 left │ │
│ │                          [Restore] [Delete]    │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ 🖼️ Logo Design.png                             │ │
│ │    Deleted 89 days ago • 1 day remaining ⚠️    │ │
│ │                          [Restore] [Delete]    │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Display Logic

**Relative date calculation:**
```typescript
function getRelativeDate(deletedAt: Date): string {
  const now = new Date();
  const diff = now.getTime() - deletedAt.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}
```

**Days until purge:**
```typescript
function getDaysUntilPurge(deletedAt: Date): number {
  const now = new Date();
  const diff = now.getTime() - deletedAt.getTime();
  const daysSinceDeletion = Math.floor(diff / (1000 * 60 * 60 * 24));
  return Math.max(0, 90 - daysSinceDeletion);
}
```

**Warning badge logic:**
```typescript
function shouldShowWarning(deletedAt: Date): boolean {
  return getDaysUntilPurge(deletedAt) < 7;
}
```

**Deleted by display:**
```typescript
function getDeleterName(deletedBy: number | null, currentUserId: number): string {
  if (!deletedBy) return 'Unknown';
  if (deletedBy === currentUserId) return 'You';
  // Fetch user name from deletedBy userId (populated by backend)
  return deletedByUserName;
}
```

### Empty State

```
┌─────────────────────────────────────┐
│           🗑️                        │
│       Trash is empty                │
│   Deleted items will appear here    │
└─────────────────────────────────────┘
```

**Implementation stub:**
```typescript
if (!trashItems || trashItems.length === 0) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <TrashIcon className="w-16 h-16 text-gray-400" aria-hidden="true" />
      <h3 className="mt-4 text-lg font-medium text-gray-900">Trash is empty</h3>
      <p className="mt-2 text-sm text-gray-500">Deleted items will appear here</p>
    </div>
  );
}
```

### Action Handlers

**Restore handler:**
```typescript
async function handleRestore(itemId: number) {
  try {
    await restoreMutation.mutateAsync({ itemId });
    toast.success('File restored successfully');
  } catch (error) {
    toast.error('Failed to restore file');
  }
}
```

**Permanent delete handler:**
```typescript
async function handlePermanentDelete(itemId: number) {
  try {
    await deleteMutation.mutateAsync({ itemId });
    toast.success('File permanently deleted');
    setShowDeleteConfirm(false);
  } catch (error) {
    toast.error('Failed to delete file');
  }
}
```

**Empty trash handler (batch delete all):**
```typescript
async function handleEmptyTrash() {
  // Confirmation dialog required
  const confirmed = await confirmDialog({
    title: 'Empty Trash',
    message: 'Are you sure you want to permanently delete all items in trash? This cannot be undone.',
    confirmText: 'Empty Trash',
    variant: 'danger'
  });

  if (!confirmed) return;

  // Delete all items in parallel
  await Promise.all(
    trashItems.map(item => deleteMutation.mutateAsync({ itemId: item.id }))
  );

  toast.success('Trash emptied');
}
```

### Integration with DocumentManagement

**Modify:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/DocumentManagement.tsx`

Add TrashPanel as 4th tab:

```typescript
const tabs = [
  { id: 'my_library', label: 'My Library', component: LibraryGrid },
  { id: 'shared_with_me', label: 'Shared With Me', component: SharedWithMeGrid },
  { id: 'my_groups', label: 'My Groups', component: SharedGroupsGrid },
  { id: 'trash', label: 'Trash', icon: TrashIcon, component: TrashPanel } // NEW
];
```

**Tab rendering:**
```typescript
<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList>
    <TabsTrigger value="my_library">My Library</TabsTrigger>
    <TabsTrigger value="shared_with_me">Shared With Me</TabsTrigger>
    <TabsTrigger value="my_groups">My Groups</TabsTrigger>
    <TabsTrigger value="trash">
      <TrashIcon className="w-4 h-4 mr-2" />
      Trash
    </TabsTrigger>
  </TabsList>

  <TabsContent value="trash">
    <TrashPanel />
  </TabsContent>
</Tabs>
```

### Accessibility Requirements

**ARIA attributes:**
- Restore button: `aria-label="Restore [filename]"`
- Delete button: `aria-label="Permanently delete [filename]"`
- Empty Trash button: `aria-label="Empty all trash items"`
- Warning badge: `role="status"`, `aria-label="Item will be deleted in X days"`
- Empty state: `role="status"`, `aria-live="polite"`

**Keyboard navigation:**
- All action buttons keyboard accessible (tab, enter)
- Confirmation dialogs keyboard accessible (tab, escape to cancel)

### Error Handling

**Error scenarios:**
- Restore fails (network error, item already purged)
- Delete fails (network error, permission denied)
- Query fails (network error, backend error)

**Error display:**
```typescript
if (error) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <ExclamationTriangleIcon className="w-16 h-16 text-red-500" />
      <h3 className="mt-4 text-lg font-medium text-gray-900">Failed to load trash</h3>
      <p className="mt-2 text-sm text-gray-500">{error.message}</p>
      <button onClick={() => refetch()} className="mt-4 btn-primary">
        Retry
      </button>
    </div>
  );
}
```

### Loading State

```typescript
if (isLoading) {
  return (
    <div className="flex justify-center py-16">
      <Spinner size="lg" />
      <span className="sr-only">Loading trash items...</span>
    </div>
  );
}
```

## Implementation Checklist

- [x] Create TrashPanel.tsx with component structure
- [x] Implement listTrash query with tRPC
- [x] Implement restoreFromTrash mutation with error handling
- [x] Implement permanentDelete mutation with AlertDialog confirmation
- [x] Implement relative date display logic (formatDeleteInfo)
- [x] Implement days-until-purge calculation (backend-computed)
- [x] Implement warning badge for < 7 days remaining (bg-red-100)
- [ ] Implement "Deleted by" user name display (DEFERRED: needs backend username population)
- [x] Implement empty state
- [x] Add TrashPanel as 4th tab in DocumentManagement (via DocumentLibraryTabs + scope routing)
- [x] Add ARIA attributes for accessibility
- [x] Write 21 SSR tests (TrashPanel.test.ts)
- [x] Run tests and verify all pass (21/21)
- [ ] Test keyboard navigation (deferred to section-11)
- [ ] Test screen reader compatibility (deferred to section-11)

## Implementation Notes

### Actual Files Modified/Created
- `apps/web/client/src/components/library/TrashPanel.tsx` — Main trash panel component (EXISTING, updated with `import React` and code review fixes)
- `apps/web/client/src/components/library/TrashPanel.test.ts` — 21 SSR tests using renderToStaticMarkup
- `apps/web/client/src/components/library/DocumentLibraryTabs.tsx` — Already had 4-column grid with Trash tab (pre-existing)
- `apps/web/client/src/pages/DocumentManagement.tsx` — Already had TrashPanel integration (pre-existing), added listScope mapping and query disabling for trash mode

### Deviations from Plan
1. **AlertDialog instead of window.confirm**: Component uses Radix AlertDialog for both single-item delete and empty-trash confirmations (better UX than window.confirm)
2. **"Deleted by" display deferred**: Backend `listTrash` returns `deletedBy` as userId (number), not username. Needs backend enhancement to populate name.
3. **Test approach**: Uses `.test.ts` with SSR `renderToStaticMarkup` instead of `.test.tsx` with `@testing-library/react` (project doesn't have jsdom environment)
4. **Empty trash uses Promise.allSettled**: Code review fix — reports partial failure count instead of failing silently
5. **Fixed dangling separator**: Code review fix — separator only renders when daysUntilPurge >= 7

## Validation

After implementation, verify:

1. **Owner-only visibility:** Sharees do not see deleted files (interview Q2)
2. **Restore functionality:** Files move back to main library after restore
3. **Permanent delete:** Files are hard-deleted (owner only - interview Q3)
4. **Search exclusion:** Deleted files do not appear in search (interview Q4)
5. **90-day retention:** Items show correct days until purge
6. **Warning badge:** Appears when < 7 days remaining
7. **Empty state:** Displays when no trash items exist
8. **Accessibility:** All ARIA attributes present, keyboard navigation works
9. **Error handling:** Network errors display user-friendly messages
10. **Loading state:** Spinner displays during query

## Performance Considerations

- Pagination: Limit to 50 items per page (configurable)
- No real-time updates (user must refresh to see changes)
- Invalidate cache on restore/delete to update UI immediately

## Security Notes

- Owner-only visibility enforced by backend (listTrash filters by ownerUserId)
- Permanent delete permission checked by backend (interview Q3)
- No cross-tenant access (backend validates tenantId)

## Known Limitations

- No bulk restore (must restore one at a time)
- No search/filter within trash (future enhancement)
- No sort options (fixed by deletedAt descending)
- "Deleted by" may show "Unknown" for items deleted before deletedBy column was added

---

**End of Section 09**
