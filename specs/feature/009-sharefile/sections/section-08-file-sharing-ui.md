Now I have all the context. Let me locate the section description for section-08-file-sharing-ui in the index.md file and extract the relevant content from the implementation plan and TDD plan.

Based on the index.md, section-08-file-sharing-ui covers:
- **Scope:** File sharing React components
- **Files:** ShareButton.tsx, ShareDialog.tsx, PermissionBadge.tsx
- **Key Tasks:** Implement sharing UI with separate user/group inputs, permission badges, multi-source display
- **Depends on:** section-05-library-router

Now I'll generate the complete self-contained section content:

---

# Section 08: File Sharing UI

**Feature:** Custom Groups & Permission-based File Sharing (SSP-SHAREFILE-009)
**Section:** section-08-file-sharing-ui
**Dependencies:** section-05-library-router (must be implemented first)

## Overview

This section implements the frontend UI components for file sharing functionality. Users can share library documents with individual users or groups, manage existing shares, and view permission levels. The UI provides separate interfaces for user search and group selection, displays multi-source permissions transparently, and follows accessibility best practices.

## Key Requirements

1. **Separate User and Group Selection** (Interview Q11): User search and group dropdown are distinct UI elements, not combined
2. **Multi-Source Permission Display** (Interview Q12): When users have multiple permission sources (direct + group), show all sources clearly
3. **Permission Management**: Users with "delete" or "owner" permission can modify or remove shares
4. **Accessibility**: All components must have proper ARIA attributes and keyboard navigation
5. **Share Count Badge**: Share button displays count of existing shares

## Tests First (TDD)

Write these tests BEFORE implementing the components. All tests use Vitest and React Testing Library.

### Test File 1: ShareButton.test.tsx

**Location:** `apps/web/client/src/components/library/ShareButton.test.tsx` (NEW)

```typescript
/**
 * Test stubs for ShareButton component
 * Write these tests first, then implement component
 */

describe('ShareButton', () => {
  test('renders share icon button', () => {
    // Arrange: Mock item with no shares
    // Act: Render ShareButton
    // Assert: Button with share icon is visible
  });

  test('shows badge with share count when shares exist', () => {
    // Arrange: Mock item with 3 shares
    // Act: Render ShareButton
    // Assert: Badge displays "3"
  });

  test('opens ShareDialog on click', () => {
    // Arrange: Mock item, mock onOpen callback
    // Act: Click button
    // Assert: onOpen callback called
  });

  test('has accessible tooltip', () => {
    // Arrange: Render ShareButton
    // Act: Hover over button
    // Assert: Tooltip with "Share file" text appears
    // Assert: aria-label is present
  });
});
```

### Test File 2: ShareDialog.test.tsx

**Location:** `apps/web/client/src/components/library/ShareDialog.test.tsx` (NEW)

```typescript
/**
 * Test stubs for ShareDialog component
 * Write these tests first, then implement component
 */

describe('ShareDialog', () => {
  test('renders user search input (separate from groups)', () => {
    // Arrange: Open dialog
    // Act: Render ShareDialog
    // Assert: User search input is visible
    // Assert: Group dropdown is visible (separate element)
  });

  test('renders group dropdown (separate from users)', () => {
    // Arrange: Mock user's groups
    // Act: Render ShareDialog
    // Assert: Group dropdown has all user's groups
    // Assert: User search is separate element
  });

  test('debounces user search (300ms delay)', () => {
    // Arrange: Mock search query
    // Act: Type in user search input
    // Assert: Query is debounced (not fired immediately)
    // Assert: Query fires after 300ms
  });

  test('shows current shares with permission levels', () => {
    // Arrange: Mock existing shares (2 users, 1 group)
    // Act: Render ShareDialog
    // Assert: All shares displayed with permission badges
  });

  test('shows owner row with disabled remove button', () => {
    // Arrange: Mock shares including owner
    // Act: Render ShareDialog
    // Assert: Owner row has "Owner" badge
    // Assert: Remove button is disabled for owner
  });

  test('shows multiple sources for users with multiple permissions', () => {
    // Arrange: Mock user with direct share (read) + group share (write)
    // Act: Render ShareDialog
    // Assert: Two rows displayed for same user
    // Assert: First row shows "Direct" with read permission
    // Assert: Second row shows "via Marketing Team" with write permission
  });

  test('calls shareItem mutation on "Add" button click', () => {
    // Arrange: Select user, select permission level
    // Act: Click "Add" button
    // Assert: shareItem mutation called with correct params
  });

  test('calls removeShare mutation on remove action', () => {
    // Arrange: Existing share with remove button
    // Act: Click remove button (X icon)
    // Assert: removeShare mutation called with correct params
  });

  test('calls updateSharePermission mutation on permission change', () => {
    // Arrange: Existing share with permission dropdown
    // Act: Change permission level from "read" to "write"
    // Assert: updateSharePermission mutation called
  });

  test('loads user\'s groups for group dropdown', () => {
    // Arrange: Mock groups.list query
    // Act: Open dialog
    // Assert: groups.list.useQuery called with scope = "all"
    // Assert: Dropdown populated with groups
  });

  test('loads current shares on mount', () => {
    // Arrange: Mock library.getItemShares query
    // Act: Open dialog
    // Assert: library.getItemShares.useQuery called with itemId
    // Assert: Shares displayed
  });
});
```

### Test File 3: PermissionBadge.test.tsx

**Location:** `apps/web/client/src/components/library/PermissionBadge.test.tsx` (NEW)

```typescript
/**
 * Test stubs for PermissionBadge component
 * Write these tests first, then implement component
 */

describe('PermissionBadge', () => {
  test('renders "read" badge with blue color and eye icon', () => {
    // Arrange: level = "read"
    // Act: Render PermissionBadge
    // Assert: Badge has blue background
    // Assert: Eye icon is visible
    // Assert: Label "Read Only" is displayed
  });

  test('renders "write" badge with green color and edit icon', () => {
    // Arrange: level = "write"
    // Act: Render PermissionBadge
    // Assert: Badge has green background
    // Assert: Edit icon is visible
    // Assert: Label "Can Edit" is displayed
  });

  test('renders "delete" badge with orange color and trash icon', () => {
    // Arrange: level = "delete"
    // Act: Render PermissionBadge
    // Assert: Badge has orange background
    // Assert: Trash icon is visible
    // Assert: Label "Can Delete" is displayed
  });

  test('renders "owner" badge with purple color and crown icon', () => {
    // Arrange: level = "owner"
    // Act: Render PermissionBadge
    // Assert: Badge has purple background
    // Assert: Crown icon is visible
    // Assert: Label "Owner" is displayed
  });

  test('has correct ARIA attributes (role="status", aria-label)', () => {
    // Arrange: level = "read"
    // Act: Render PermissionBadge
    // Assert: role="status" is present
    // Assert: aria-label="Read Only access" is present
  });

  test('icon has aria-hidden="true"', () => {
    // Arrange: level = "read"
    // Act: Render PermissionBadge
    // Assert: Icon has aria-hidden="true" (decorative)
  });
});
```

## Implementation Details

### Component 1: ShareButton

**File:** `apps/web/client/src/components/library/ShareButton.tsx` (NEW)

**Location in UI:** DocumentPreviewPanel header, next to download button

**Props Interface:**
```typescript
interface ShareButtonProps {
  itemId: number;
  shareCount: number;
  onOpenDialog: () => void;
}
```

**Key Implementation Points:**
- Use Radix Icons for share icon (ShareIcon or LinkIcon)
- Display badge with share count if count > 0
- Badge styling: Small circular badge in top-right corner of button
- Tooltip: "Share file" (use Radix Tooltip component)
- ARIA: `aria-label="Share file (X shares)"` where X is share count
- Click handler calls `onOpenDialog()` prop

**Visual Design:**
```
┌────────┐
│  🔗   3│  ← Share icon with badge showing "3" shares
└────────┘
```

**Styling Stub:**
```typescript
// Use CVA (class-variance-authority) for button variants
// Base: Radix Button component with ghost variant
// Badge: Absolute positioned, blue background, white text
```

### Component 2: ShareDialog

**File:** `apps/web/client/src/components/library/ShareDialog.tsx` (NEW)

**Props Interface:**
```typescript
interface ShareDialogProps {
  itemId: number;
  isOpen: boolean;
  onClose: () => void;
}
```

**State Management:**
```typescript
// Local state:
const [searchQuery, setSearchQuery] = useState('');
const [selectedPermission, setSelectedPermission] = useState<PermissionLevel>('read');
const [selectedGroup, setSelectedGroup] = useState<number | null>(null);

// tRPC queries:
const { data: shares } = trpc.library.getItemShares.useQuery({ itemId });
const { data: groups } = trpc.groups.list.useQuery({ scope: 'all' });
const { data: users } = trpc.groups.listTenantUsers.useQuery(
  { search: searchQuery },
  { enabled: searchQuery.length >= 2 }
);

// tRPC mutations:
const shareItemMutation = trpc.library.shareItem.useMutation();
const removeShareMutation = trpc.library.removeShare.useMutation();
const updatePermissionMutation = trpc.library.updateSharePermission.useMutation();
```

**Layout Structure:**
```
┌─────────────────────────────────────────┐
│ Share "Document.pdf"                [X] │
├─────────────────────────────────────────┤
│ Add people or groups                    │
│ ┌─────────────────────────────────────┐ │
│ │ 🔍 Search for people...             │ │  ← User search input
│ └─────────────────────────────────────┘ │
│                                         │
│ Or select a group:                      │
│ ┌─────────────────────────────────────┐ │
│ │ ▼ Select group...                   │ │  ← Group dropdown (Radix Select)
│ └─────────────────────────────────────┘ │
│                                         │
│ Permission level: [▼ Read]              │  ← Permission dropdown
│                    [Add]                │  ← Submit button
│                                         │
│ Who has access:                         │
│ ┌─────────────────────────────────────┐ │
│ │ 👤 John Doe (You)      [Owner]  [👑]│ │  ← Owner row (disabled remove)
│ │ 👤 Jane Smith       [▼ Write]   [✕] │ │  ← User share row
│ │ 👥 Marketing Team   [▼ Read]    [✕] │ │  ← Group share row
│ └─────────────────────────────────────┘ │
│                                         │
│ [Cancel]                    [Save]      │
└─────────────────────────────────────────┘
```

**Key Implementation Points:**

1. **User Search** (Interview Q11 - separate from groups):
   - Debounced input (use `useDebouncedValue` hook or similar, 300ms delay)
   - Minimum 2 characters before triggering search
   - Display user results with avatar + name
   - Click user to select (not auto-add, user selects permission first)

2. **Group Dropdown** (Interview Q11 - separate from users):
   - Use Radix Select component
   - Display only user's groups (from `groups.list` with `scope: 'all'`)
   - Group icon (👥) + group name in dropdown items

3. **Permission Level Selector**:
   - Radix Select with options: Read, Write, Delete
   - Default: "read"
   - Visible for both user and group selection

4. **Add Button**:
   - Disabled if no user/group selected
   - Calls `shareItem` mutation with:
     ```typescript
     {
       itemId,
       subjectType: selectedGroup ? 'group' : 'user',
       subjectId: selectedGroup || selectedUserId,
       permissionLevel: selectedPermission
     }
     ```
   - On success: Refetch shares, clear selection

5. **Current Shares List** (Interview Q12 - multi-source display):
   - Query `library.getItemShares` returns format:
     ```typescript
     {
       subjectType: 'user' | 'group',
       subjectId: number,
       permissionLevel: PermissionLevel,
       userName?: string,
       groupName?: string,
       sources?: Array<{ type: 'direct' | 'group', groupName?: string }>
     }
     ```
   - If `sources.length > 1`, display multiple rows:
     ```
     👤 Jane Smith (Direct)       [Read]    [✕]
     👤 Jane Smith (via Marketing) [Write]   [✕]
     ```
   - Owner row has no remove button (disabled)

6. **Remove Share**:
   - X icon button next to each share (except owner)
   - Confirmation dialog: "Remove access for [name]?"
   - Calls `removeShare` mutation with `{ itemId, subjectType, subjectId }`

7. **Update Permission**:
   - Permission dropdown for each share (except owner - read-only "Owner" badge)
   - On change: Calls `updateSharePermission` mutation
   - Optimistic update for better UX

**Accessibility:**
- Dialog uses Radix Dialog component (built-in ARIA)
- User search input: `aria-label="Search for users to share with"`
- Group dropdown: `aria-label="Select group to share with"`
- Permission dropdown: `aria-label="Permission level"`
- Remove buttons: `aria-label="Remove access for [name]"`
- Dialog title: `aria-labelledby` on header

### Component 3: PermissionBadge

**File:** `apps/web/client/src/components/library/PermissionBadge.tsx` (NEW)

**Props Interface:**
```typescript
interface PermissionBadgeProps {
  level: 'read' | 'write' | 'delete' | 'owner';
  label?: string; // Optional override for default label
}
```

**Permission Level Design Specifications:**

| Level | Color | Icon | Default Label | ARIA Label |
|-------|-------|------|---------------|------------|
| read | Blue (bg-blue-100 text-blue-700) | 👁️ Eye (EyeOpenIcon) | Read Only | Read Only access |
| write | Green (bg-green-100 text-green-700) | ✏️ Pencil (Pencil1Icon) | Can Edit | Can Edit access |
| delete | Orange (bg-orange-100 text-orange-700) | 🗑️ Trash (TrashIcon) | Can Delete | Can Delete access |
| owner | Purple (bg-purple-100 text-purple-700) | 👑 Crown (Component1Icon or custom) | Owner | Owner access |

**Implementation Stub:**
```typescript
export function PermissionBadge({ level, label }: PermissionBadgeProps) {
  // Use CVA for variant styling
  // Base classes: inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium
  // Variants: One per permission level with color classes
  
  const config = {
    read: { icon: EyeOpenIcon, defaultLabel: 'Read Only', ariaLabel: 'Read Only access' },
    write: { icon: Pencil1Icon, defaultLabel: 'Can Edit', ariaLabel: 'Can Edit access' },
    delete: { icon: TrashIcon, defaultLabel: 'Can Delete', ariaLabel: 'Can Delete access' },
    owner: { icon: Component1Icon, defaultLabel: 'Owner', ariaLabel: 'Owner access' },
  };

  const { icon: Icon, defaultLabel, ariaLabel } = config[level];

  return (
    <span
      className={/* CVA variant classes */}
      role="status"
      aria-label={ariaLabel}
    >
      <Icon aria-hidden="true" className="w-4 h-4" />
      <span>{label || defaultLabel}</span>
    </span>
  );
}
```

**Accessibility Notes:**
- `role="status"` indicates dynamic content
- `aria-label` provides full text description for screen readers
- Icon has `aria-hidden="true"` because it's decorative (text already conveys meaning)

## Integration with DocumentPreviewPanel

**File to Modify:** `apps/web/client/src/components/library/DocumentPreviewPanel.tsx` (EXTEND)

**Changes:**
1. Import ShareButton component
2. Add ShareButton to header toolbar (after download button, before close button)
3. Add state for ShareDialog open/close
4. Pass `itemId`, `shareCount`, and `onOpenDialog` to ShareButton
5. Render ShareDialog conditionally when open

**Code Stub:**
```typescript
// In DocumentPreviewPanel.tsx header section:
const [shareDialogOpen, setShareDialogOpen] = useState(false);

// Query to get share count:
const { data: shares } = trpc.library.getItemShares.useQuery({ itemId: item.id });

// In header toolbar:
<ShareButton
  itemId={item.id}
  shareCount={shares?.length || 0}
  onOpenDialog={() => setShareDialogOpen(true)}
/>

// Before closing component:
<ShareDialog
  itemId={item.id}
  isOpen={shareDialogOpen}
  onClose={() => setShareDialogOpen(false)}
/>
```

## Dependencies

### Backend Endpoints Required (from section-05-library-router):
- `library.shareItem` (mutation) - Create share
- `library.getItemShares` (query) - Get current shares
- `library.removeShare` (mutation) - Remove share
- `library.updateSharePermission` (mutation) - Update permission level
- `groups.list` (query) - Get user's groups
- `groups.listTenantUsers` (query) - Search users for sharing

All these endpoints must be implemented and tested in section-05 before starting this section.

### UI Component Dependencies:
- Radix UI components: Dialog, Select, Tooltip, Button
- Radix Icons: ShareIcon, EyeOpenIcon, Pencil1Icon, TrashIcon, Component1Icon (or custom crown icon)
- TanStack Query (via tRPC) for data fetching
- CVA (class-variance-authority) for component variants

## Files to Create/Modify

### New Files:
1. `apps/web/client/src/components/library/ShareButton.tsx`
2. `apps/web/client/src/components/library/ShareDialog.tsx`
3. `apps/web/client/src/components/library/PermissionBadge.tsx`
4. `apps/web/client/src/components/library/ShareButton.test.tsx`
5. `apps/web/client/src/components/library/ShareDialog.test.tsx`
6. `apps/web/client/src/components/library/PermissionBadge.test.tsx`

### Modified Files:
1. `apps/web/client/src/components/library/DocumentPreviewPanel.tsx` - Add ShareButton to header

## Testing Checklist

Before marking this section complete, verify:

- [ ] All test stubs pass (ShareButton, ShareDialog, PermissionBadge)
- [ ] User search is debounced (300ms)
- [ ] Group dropdown is separate from user search (Interview Q11)
- [ ] Multi-source permissions display correctly (Interview Q12)
- [ ] Owner row has disabled remove button
- [ ] Permission badges have correct colors and ARIA attributes
- [ ] ShareDialog calls correct mutations (shareItem, removeShare, updateSharePermission)
- [ ] Share count badge updates when shares change
- [ ] Keyboard navigation works for all interactive elements
- [ ] Screen reader announces all important state changes

## Error Handling

### ShareDialog Error States:
1. **Failed to Load Shares**: Display error message in dialog, disable add/remove actions
2. **Failed to Add Share**: Show toast notification with error (e.g., "User not found", "Permission denied")
3. **Failed to Remove Share**: Show toast notification with error
4. **Failed to Update Permission**: Revert dropdown to previous value, show toast error

### Loading States:
1. **Loading Shares**: Show skeleton UI for share list
2. **Loading Groups**: Show loading spinner in group dropdown
3. **Searching Users**: Show loading spinner in user search results
4. **Mutation in Progress**: Disable submit buttons, show loading spinner

## Performance Considerations

1. **Debounce User Search**: 300ms delay prevents excessive API calls
2. **Lazy Load Dialog Content**: Only query shares when dialog is opened
3. **Optimistic Updates**: Update permission dropdown immediately, rollback on error
4. **Paginated User Search**: Limit results to 20 users, add "Load more" if needed (future enhancement)

## Known Limitations (Accepted for MVP)

1. **No Bulk Share**: Cannot share with multiple users/groups at once (add individually)
2. **No Share History**: Cannot see who added a share or when (audit log only)
3. **No Expiration Dates**: Shares are permanent until manually removed (future feature)
4. **No Link Sharing**: Cannot generate shareable public links (future feature)

## Post-MVP Enhancements

1. **Bulk Share Operations**: Multi-select users/groups, share all at once
2. **Share Templates**: Pre-defined permission sets ("Viewer", "Editor", "Manager")
3. **Share Expiration**: Set time-limited shares (expires after 7 days, etc.)
4. **Public Link Sharing**: Generate read-only links with optional passwords
5. **Share Activity Log**: Show who viewed/downloaded shared files

## Implementation Checklist

Implementer should complete in this order:

1. [x] Write all test stubs (3 test files)
2. [x] Implement PermissionBadge component (simplest, no external dependencies)
3. [x] Run PermissionBadge tests, verify all pass
4. [x] Implement ShareButton component
5. [x] Run ShareButton tests, verify all pass
6. [x] Implement ShareDialog component (most complex)
7. [x] Run ShareDialog tests, verify all pass
8. [x] Integrate ShareButton into DocumentPreviewPanel
9. [ ] Manual testing: Open DocumentPreviewPanel, click Share button, test all flows
10. [ ] Accessibility audit: Test with keyboard navigation and screen reader
11. [x] Run full test suite: `cd apps/web && pnpm test`
12. [x] TypeScript type check: `cd apps/web && pnpm check`

## Implementation Notes (Actual vs Planned)

### Files Created
- `apps/web/client/src/components/library/PermissionBadge.tsx` - Permission level badge component
- `apps/web/client/src/components/library/PermissionBadge.test.ts` - 7 tests (SSR-based)
- `apps/web/client/src/components/library/ShareButton.tsx` - Share button with count badge
- `apps/web/client/src/components/library/ShareButton.test.ts` - 6 tests (SSR-based)
- `apps/web/client/src/components/library/ShareDialog.tsx` - Full sharing dialog
- `apps/web/client/src/components/library/ShareDialog.test.ts` - 14 tests (SSR-based)

### Files Modified
- `apps/web/client/src/components/library/DocumentPreviewPanel.tsx` - Added ShareButton + ShareDialog integration

### Deviations from Plan
1. **Test files use `.test.ts` not `.test.tsx`**: Project convention uses SSR-based tests (`renderToStaticMarkup`) in node environment (no jsdom). Tests use `React.createElement()` instead of JSX.
2. **`role="status"` removed from PermissionBadge**: Code review identified this as semantically incorrect for static labels. Using `aria-label` only.
3. **`itemId` prop removed from ShareButton**: Not used by the component; removed after code review.
4. **Remove share confirmation added**: `window.confirm()` dialog before removing shares (code review fix).
5. **Error state added**: Shows error message when shares fail to load, disables Add button.
6. **Groups loading state added**: Shows spinner while groups are loading.
7. **Multi-source permission display deferred**: Backend `getLibraryItemShares` doesn't return `sources` field. Deferred to section-10.
8. **Frontend permission check deferred**: Backend enforces authorization; frontend shows controls and handles FORBIDDEN errors via toast. Client-side permission gating requires additional data flow (user permissions).
9. **`itemTitle` prop added to ShareDialog**: Shows document name in dialog title (minor addition).

### Test Results
- 27 tests total (7 + 6 + 14), all passing
- 0 TypeScript errors

---

**End of Section 08: File Sharing UI**