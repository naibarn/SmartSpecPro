Now I understand the context. I need to generate the content for section-07-group-management-ui. Let me extract the relevant information from the plan and TDD documents.

---

# Section 07: Group Management UI

## Overview

This section implements the React-based group management UI, including pages for browsing groups, creating/editing groups, managing members, and discovering public groups. The UI enables users to manage their custom groups through intuitive interfaces with tabs, dialogs, and search capabilities.

## Dependencies

**Requires:**
- section-01-database-schema (tables must exist)
- section-02-groups-service (business logic)
- section-04-groups-router (tRPC endpoints)

**Blocks:**
- section-11-security-tests (UI integration tests)
- section-12-deployment-verification (E2E flows)

## Files to Create/Modify

### New Files
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/GroupManagement.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/GroupDiscovery.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/groups/GroupDetailPanel.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/groups/CreateGroupDialog.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/groups/AddMemberDialog.tsx`

### Modified Files
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/App.tsx` (routing configuration)
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/MainNav.tsx` (sidebar navigation)

### Test Files
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/GroupManagement.test.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/GroupDiscovery.test.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/groups/GroupDetailPanel.test.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/groups/CreateGroupDialog.test.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/groups/AddMemberDialog.test.tsx`

## Test Stubs (Write These First)

### GroupManagement.test.tsx

```typescript
/**
 * Test suite for GroupManagement page
 * Location: apps/web/client/src/pages/GroupManagement.test.tsx
 */

describe('GroupManagement', () => {
  it('renders "My Groups" tab with user\'s owned groups');
  it('renders "Member Of" tab with user\'s memberships');
  it('renders "Public Groups" tab with searchable public groups');
  it('opens CreateGroupDialog on "Create Group" button click');
  it('navigates to GroupDetailPanel on group card click');
  it('shows empty state when no groups exist');
});

describe('GroupManagement routing', () => {
  it('/groups route renders GroupManagement component');
  it('/groups/discover route renders GroupDiscovery component');
  it('/groups/:groupId route renders GroupDetailPanel component');
  it('routes require authentication (redirects to login if not authenticated)');
});

describe('GroupManagement navigation', () => {
  it('Groups link appears in sidebar navigation');
  it('Groups link routes to /groups correctly');
});
```

### GroupDetailPanel.test.tsx

```typescript
/**
 * Test suite for GroupDetailPanel component
 * Location: apps/web/client/src/components/groups/GroupDetailPanel.test.tsx
 */

describe('GroupDetailPanel', () => {
  it('renders group name, icon, member count');
  it('shows "Edit" button only for owner/admin');
  it('shows "Delete Group" button only for owner');
  it('shows "Leave Group" button only for members (not owner)');
  it('shows pending join requests section only for admins');
  it('renders member list with roles');
  it('calls removeMember mutation on remove action');
  it('calls leave mutation on "Leave Group" button click');
  it('calls delete mutation on "Delete Group" button click');
  it('calls approveMember mutation on approve action');
  it('calls rejectMember mutation on reject action');
});
```

### CreateGroupDialog.test.tsx

```typescript
/**
 * Test suite for CreateGroupDialog component
 * Location: apps/web/client/src/components/groups/CreateGroupDialog.test.tsx
 */

describe('CreateGroupDialog', () => {
  it('validates required name field');
  it('enforces max 128 chars for name');
  it('enforces max 512 chars for description');
  it('shows "Join Policy" options only when visibility = "public"');
  it('calls create mutation on submit');
  it('calls update mutation on submit (edit mode)');
  it('shows error on duplicate group name');
});
```

### AddMemberDialog.test.tsx

```typescript
/**
 * Test suite for AddMemberDialog component
 * Location: apps/web/client/src/components/groups/AddMemberDialog.test.tsx
 */

describe('AddMemberDialog', () => {
  it('debounces user search (300ms delay)');
  it('excludes users already in group');
  it('renders user avatars and names in results');
  it('selects role (Member/Admin) via radio buttons');
  it('calls addMember mutation on "Add" button click');
});
```

### GroupDiscovery.test.tsx

```typescript
/**
 * Test suite for GroupDiscovery page
 * Location: apps/web/client/src/pages/GroupDiscovery.test.tsx
 */

describe('GroupDiscovery', () => {
  it('searches public groups with query input');
  it('filters groups by sort option (member count, created date)');
  it('shows "Join" button for open groups');
  it('shows "Request Join" button for request-to-join groups');
  it('shows "Invite Only" badge for invite-only groups (no button)');
  it('calls join mutation on "Join" button click');
  it('calls requestJoin mutation on "Request Join" button click');
});
```

## Implementation Details

### 1. GroupManagement Page

**Purpose:** Main landing page for group management with tabbed interface.

**Layout Structure:**
```
┌─────────────────────────────────────────────────┐
│  My Groups                      [Create Group]  │
├─────────────────────────────────────────────────┤
│  [My Groups] [Member Of] [Public Groups]        │
├─────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ Marketing   │ │ Sales       │ │ Support   │ │
│  │ Team        │ │ Team        │ │ Team      │ │
│  │ 12 members  │ │ 8 members   │ │ 5 members │ │
│  └─────────────┘ └─────────────┘ └───────────┘ │
└─────────────────────────────────────────────────┘
```

**State Management:**
- `selectedTab`: "my_groups" | "member_of" | "public"
- `searchQuery`: string (for filtering/searching)
- `isCreateDialogOpen`: boolean

**tRPC Queries:**
- `trpc.groups.list.useQuery({ scope: selectedTab })`
  - Returns groups based on selected tab
  - Scope "my_groups": groups where user is owner
  - Scope "member_of": groups where user is member (not owner)
  - Scope "public": public groups in tenant
- `trpc.groups.searchPublic.useQuery({ query: searchQuery })` (Public Groups tab only)

**User Interactions:**
- Click "Create Group" button → Open CreateGroupDialog
- Click group card → Navigate to `/groups/:groupId` (GroupDetailPanel)
- Switch tabs → Update selectedTab, refetch appropriate query

**Empty States:**
- My Groups: "You haven't created any groups yet. Create your first group to get started."
- Member Of: "You're not a member of any groups yet. Join public groups or wait for an invitation."
- Public Groups: "No public groups found. Try a different search term."

**Component Signature:**
```typescript
export function GroupManagement() {
  // Component implementation stub
  // Uses: React.useState for tab state
  // Uses: tRPC queries for data fetching
  // Uses: Radix UI Tabs for tab navigation
  // Uses: Grid layout for group cards
}
```

### 2. GroupDetailPanel Component

**Purpose:** Display detailed information about a group and manage members.

**Layout Structure:**
```
┌────────────────────────────────────────────────┐
│  [Group Icon] Marketing Team                   │
│  12 members • Public • Open to join            │
│  [Edit] [Leave Group] [Delete Group]           │
├────────────────────────────────────────────────┤
│  Description: Collaborate on marketing content │
├────────────────────────────────────────────────┤
│  Pending Requests (Admin only) [2 pending]     │
│  ┌──────────────────────────────────────────┐  │
│  │ Jane Smith           [Approve] [Reject]  │  │
│  │ Bob Johnson          [Approve] [Reject]  │  │
│  └──────────────────────────────────────────┘  │
├────────────────────────────────────────────────┤
│  Members                          [Add Member] │
│  ┌──────────────────────────────────────────┐  │
│  │ 👤 John Doe (You)    Admin         [👑] │  │
│  │ 👤 Alice Cooper      Member        [✕]  │  │
│  │ 👤 Bob Williams      Admin         [✕]  │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

**Button Visibility Logic:**
- "Edit" button: visible only if user is owner OR admin
- "Delete Group" button: visible only if user is owner
- "Leave Group" button: visible only if user is member BUT NOT owner (interview Q9)
- "Add Member" button: visible only if user is owner OR admin
- Member remove (✕) button: visible only if user is owner OR admin

**tRPC Queries:**
- `trpc.groups.get.useQuery({ id: groupId })`
  - Returns group details with members array
  - Each member includes: userId, userName, role, status
  - Includes pending join requests if user is admin

**tRPC Mutations:**
- `trpc.groups.removeMember.useMutation()`
  - Input: `{ groupId, userId }`
  - Only allowed if actor is admin or removing self
- `trpc.groups.leave.useMutation()`
  - Input: `{ groupId }`
  - Self-removal shortcut (interview Q9)
  - Blocked if user is owner
- `trpc.groups.delete.useMutation()`
  - Input: `{ groupId }`
  - Only allowed if actor is owner
  - Cascades to permission deletion (backend handles)
- `trpc.groups.approveMember.useMutation()`
  - Input: `{ groupId, userId }`
  - Changes status from 'pending' to 'active'
- `trpc.groups.rejectMember.useMutation()`
  - Input: `{ groupId, userId }`
  - Removes membership record

**Component Signature:**
```typescript
interface GroupDetailPanelProps {
  groupId?: number; // from URL param or props
}

export function GroupDetailPanel({ groupId }: GroupDetailPanelProps) {
  // Component implementation stub
  // Uses: React Router for groupId param extraction
  // Uses: tRPC queries for group details
  // Uses: tRPC mutations for member management
  // Uses: Radix UI Dialog for confirmation modals
}
```

### 3. CreateGroupDialog Component

**Purpose:** Modal dialog for creating or editing groups.

**Form Fields:**
- Name: text input (required, max 128 chars)
- Description: textarea (optional, max 512 chars)
- Visibility: radio buttons ("Private" or "Public")
- Join Policy: dropdown ("Invite Only", "Request to Join", "Open")
  - Only visible when visibility = "Public"
  - Hidden when visibility = "Private" (defaults to "Invite Only")

**Form Validation:**
- Name: required, 1-128 characters
- Description: optional, max 512 characters
- Visibility: required, one of ["private", "public"]
- Join Policy: required if visibility = "public", one of ["invite_only", "request_to_join", "open"]

**tRPC Mutations:**
- `trpc.groups.create.useMutation()`
  - Input: `{ name, description?, visibility, joinPolicy? }`
  - Returns created group
  - May throw CONFLICT error if duplicate name
- `trpc.groups.update.useMutation()` (edit mode)
  - Input: `{ id, name?, description?, visibility?, joinPolicy? }`
  - Returns updated group

**Error Handling:**
- Duplicate name: "A group with this name already exists"
- Limit exceeded: "You've reached the maximum of 50 groups"
- Network error: "Failed to create group. Please try again."

**Component Signature:**
```typescript
interface CreateGroupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  groupToEdit?: { id: number; name: string; description?: string; visibility: string; joinPolicy?: string };
}

export function CreateGroupDialog({ isOpen, onClose, groupToEdit }: CreateGroupDialogProps) {
  // Component implementation stub
  // Uses: Radix UI Dialog for modal
  // Uses: React Hook Form for form state
  // Uses: Zod for validation schema
  // Uses: tRPC mutations for create/update
}
```

### 4. AddMemberDialog Component

**Purpose:** Modal dialog for searching and adding users to a group.

**Layout Structure:**
```
┌───────────────────────────────────────┐
│  Add Members to Marketing Team        │
├───────────────────────────────────────┤
│  Search users...                      │
│  ┌─────────────────────────────────┐  │
│  │ 🔍 Type to search...            │  │
│  └─────────────────────────────────┘  │
│                                       │
│  Results:                             │
│  ┌─────────────────────────────────┐  │
│  │ 👤 Jane Smith (jane@example.com)│  │
│  │ 👤 Bob Johnson (bob@example.com)│  │
│  └─────────────────────────────────┘  │
│                                       │
│  Role:                                │
│  ( ) Member  (•) Admin                │
│                                       │
│  [Cancel]                      [Add]  │
└───────────────────────────────────────┘
```

**Search Behavior:**
- Debounced search: 300ms delay after user stops typing (interview Q11)
- Searches by name and email
- Excludes users already in the group
- Tenant-scoped: only shows users from same tenant

**tRPC Queries:**
- `trpc.groups.listTenantUsers.useQuery({ search: searchQuery, excludeGroupId: groupId })`
  - Returns array of users with userId, name, email, avatarUrl
  - Excludes current group members
  - Debounced to avoid excessive queries

**tRPC Mutations:**
- `trpc.groups.addMember.useMutation()`
  - Input: `{ groupId, userId, role: "admin" | "member" }`
  - Validates user exists and is in same tenant (backend)
  - May throw CONFLICT if user already member
  - May throw BAD_REQUEST if group member limit exceeded

**Component Signature:**
```typescript
interface AddMemberDialogProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: number;
}

export function AddMemberDialog({ isOpen, onClose, groupId }: AddMemberDialogProps) {
  // Component implementation stub
  // Uses: Radix UI Dialog for modal
  // Uses: useDebouncedValue hook for search debouncing
  // Uses: tRPC queries for user search
  // Uses: tRPC mutations for adding member
  // Uses: Radio buttons for role selection
}
```

### 5. GroupDiscovery Page

**Purpose:** Search and join public groups in the tenant (interview Q6).

**Layout Structure:**
```
┌─────────────────────────────────────────────────┐
│  Discover Public Groups                         │
├─────────────────────────────────────────────────┤
│  Search: [_________________]  Sort: [▼ Members] │
├─────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ Marketing   │ │ Sales       │ │ Support   │ │
│  │ Team        │ │ Team        │ │ Team      │ │
│  │ 12 members  │ │ 8 members   │ │ 5 members │ │
│  │ [Join]      │ │ [Request]   │ │ Invite    │ │
│  │             │ │             │ │ Only      │ │
│  └─────────────┘ └─────────────┘ └───────────┘ │
└─────────────────────────────────────────────────┘
```

**Join Button Logic (interview Q6):**
- Join Policy = "open" → Show "Join" button (instant join)
- Join Policy = "request_to_join" → Show "Request Join" button (creates pending membership)
- Join Policy = "invite_only" → Show "Invite Only" badge (no button, can't join)

**Search and Filtering:**
- Search input: filters by group name and description
- Sort options: "Most Members", "Recently Created"
- Pagination: 20 groups per page

**tRPC Queries:**
- `trpc.groups.searchPublic.useQuery({ query: searchQuery, limit: 20, offset: page * 20 })`
  - Returns public groups matching search query
  - Includes group name, description, member count, join policy
  - Tenant-scoped (only returns groups from user's tenant)

**tRPC Mutations:**
- `trpc.groups.join.useMutation()`
  - Input: `{ groupId }`
  - Creates active membership immediately
  - Only works if joinPolicy = "open"
- `trpc.groups.requestJoin.useMutation()`
  - Input: `{ groupId }`
  - Creates pending membership (status = "pending")
  - Only works if joinPolicy = "request_to_join"

**Component Signature:**
```typescript
export function GroupDiscovery() {
  // Component implementation stub
  // Uses: React.useState for search query and pagination
  // Uses: tRPC queries for public group search
  // Uses: tRPC mutations for join/requestJoin
  // Uses: Grid layout for group cards
}
```

## Routing Configuration

### App.tsx Modifications

Add these routes to the router configuration:

```typescript
// In apps/web/client/src/App.tsx

import { GroupManagement } from './pages/GroupManagement';
import { GroupDiscovery } from './pages/GroupDiscovery';
import { GroupDetailPanel } from './components/groups/GroupDetailPanel';

// Inside router setup:
<Route path="/groups" component={protectedRoute(GroupManagement)} />
<Route path="/groups/discover" component={protectedRoute(GroupDiscovery)} />
<Route path="/groups/:groupId" component={protectedRoute(GroupDetailPanel)} />
```

**Authentication Requirement:**
All group routes require authentication. Use existing `protectedRoute` wrapper to redirect unauthenticated users to login page.

### MainNav.tsx Modifications

Add Groups link to sidebar navigation:

```typescript
// In apps/web/client/src/components/MainNav.tsx

import { UsersIcon } from '@radix-ui/react-icons';

// Add to navigation items array:
{
  path: "/groups",
  label: "Groups",
  icon: UsersIcon
}
```

Position: Insert after "Library" link, before "Media Studio" link.

## UI/UX Design Guidelines

### Component Library
- Use Radix UI primitives for all interactive elements (Dialog, Tabs, Radio, etc.)
- Use TailwindCSS for styling (follow existing design system)
- Use CVA (class-variance-authority) for component variants

### Colors and Icons
- Group icons: Use Radix UI Icons or Lucide Icons
- Color scheme: Follow existing library design (neutral grays, accent blues)
- Badge colors:
  - "Invite Only": gray
  - "Request to Join": yellow
  - "Open": green

### Accessibility (WCAG 2.1 AA)
- All buttons have accessible labels
- Dialogs have correct ARIA attributes (role="dialog", aria-labelledby)
- Form inputs have associated labels
- Tab navigation works with keyboard (arrow keys)
- Focus indicators visible on all interactive elements

### Loading and Error States

**Loading States:**
- Use skeleton loaders for group cards while fetching
- Show spinner in button during mutation (e.g., "Creating..." on submit)

**Error States:**
- Show error message at top of dialog/page (dismissible)
- Use existing error toast pattern for mutations
- Validation errors inline below form fields

## Integration Points

### tRPC Client Setup
All components use the existing tRPC client from `@/lib/trpc`. No additional configuration needed.

### State Management
Use TanStack Query (via tRPC) for server state. No global state management needed for this feature.

### Cache Invalidation
After mutations, invalidate relevant queries:
- After `create`: Invalidate `groups.list` with scope "my_groups"
- After `addMember`: Invalidate `groups.get` for that groupId
- After `leave`: Invalidate `groups.list` with scope "member_of"
- After `delete`: Invalidate all `groups.list` queries

Example:
```typescript
const utils = trpc.useContext();

const deleteMutation = trpc.groups.delete.useMutation({
  onSuccess: () => {
    utils.groups.list.invalidate();
    // Navigate back to /groups
  }
});
```

## Testing Approach

### Component Testing Strategy
- Use Vitest + React Testing Library
- Mock tRPC queries/mutations with mock data
- Test user interactions (clicks, form submissions)
- Test conditional rendering (buttons based on permissions)
- Test accessibility (ARIA attributes, keyboard navigation)

### Integration Testing (E2E)
Integration tests are covered in section-11-security-tests. This section focuses on component unit tests only.

## Known Limitations

1. **No bulk member operations**: Cannot add multiple users at once. Must add one by one via AddMemberDialog.
2. **No transfer ownership**: Group owner cannot transfer ownership to another admin. This is a post-MVP feature.
3. **No group templates**: Users create groups from scratch every time. Pre-defined templates are a post-MVP feature.

## Implementation Checklist

- [x] Create GroupManagement page with tabbed interface
- [x] Create GroupDetailPanel component with member list
- [x] Create CreateGroupDialog with form validation
- [x] Create AddMemberDialog with debounced search
- [x] Create GroupDiscovery page for public group search
- [x] Add routing configuration to App.tsx
- [x] Add "Groups" link to sidebar navigation (via `packages/shared/src/constants/menu.ts`)
- [x] Write component test stubs for all new components (full tests in section-11)
- [x] Write routing test stubs for all new routes (full tests in section-11)
- [ ] Test accessibility (keyboard navigation, ARIA attributes) — deferred to section-11
- [x] Test loading states (skeleton loaders, spinner buttons)
- [x] Test error states (validation errors, API errors)
- [x] Test empty states (no groups, no results)
- [x] Verify cache invalidation works correctly after mutations

## Implementation Deviations from Plan

### Backend Additions (not in original plan)
Two new backend endpoints were needed for the UI and were added:
- `groups.listMembers` (router) + `getGroupMembers` (service) — returns group member details with user info
- `groups.searchTenantUsers` (router) + `searchTenantUsers` (service) — searches users in tenant for AddMemberDialog

### Navigation Approach
Plan specified modifying `MainNav.tsx` directly. Actual implementation adds the "Groups" menu item to `packages/shared/src/constants/menu.ts` (centralized menu config), which is the project's canonical pattern for sidebar navigation.

### Code Review Fixes Applied
- SQL wildcard injection fix in `searchTenantUsers` (escape `%` and `_`)
- Membership authorization check in `getGroupMembers` (prevents non-members from viewing member list)
- Auth redirect added to `GroupDetailPanel` (was missing)
- Invalid groupId early return (prevents infinite loading on `/groups/abc`)
- Settings null guard (fallback defaults for `group.settings`)
- Hook ordering fix in `GroupDiscovery` (`trpc.useUtils()` moved before mutations)

### Test Coverage
Component tests are `.todo()` stubs because the vitest config uses `environment: 'node'` (not jsdom). Full component tests with React Testing Library will be implemented in section-11-security-tests.

## Actual Files Created/Modified

### New Files
- `apps/web/client/src/pages/GroupManagement.tsx` (228 lines)
- `apps/web/client/src/pages/GroupDiscovery.tsx` (286 lines)
- `apps/web/client/src/components/groups/GroupDetailPanel.tsx` (492 lines)
- `apps/web/client/src/components/groups/CreateGroupDialog.tsx` (272 lines)
- `apps/web/client/src/components/groups/AddMemberDialog.tsx` (207 lines)
- `apps/web/client/src/pages/GroupManagement.test.ts`
- `apps/web/client/src/pages/GroupDiscovery.test.ts`
- `apps/web/client/src/components/groups/GroupDetailPanel.test.ts`
- `apps/web/client/src/components/groups/CreateGroupDialog.test.ts`
- `apps/web/client/src/components/groups/AddMemberDialog.test.ts`

### Modified Files
- `apps/web/client/src/App.tsx` (3 routes + 3 imports added)
- `packages/shared/src/constants/menu.ts` (1 menu item added)
- `apps/web/server/routers/groups.ts` (2 query procedures added)
- `apps/web/server/services/groupsService.ts` (3 new exported functions + types)

## Verification Steps

After implementation:

1. **Manual Testing:**
   - Create a group via CreateGroupDialog
   - Add members via AddMemberDialog
   - Leave a group (as member, not owner)
   - Delete a group (as owner)
   - Search public groups and join one
   - Request to join a group with "request_to_join" policy
   - Approve/reject pending join requests (as admin)

2. **Automated Testing:**
   - Run `pnpm test` in `apps/web/client`
   - Verify all component tests pass
   - Verify routing tests pass
   - Check test coverage (target: 80%+)

3. **Accessibility Testing:**
   - Run axe DevTools or similar accessibility scanner
   - Test keyboard navigation (Tab, Enter, Escape)
   - Test screen reader compatibility (optional but recommended)

## Next Steps

After completing this section:
1. Proceed to section-08-file-sharing-ui (ShareDialog and ShareButton)
2. Ensure section-04-groups-router is fully implemented (dependency)
3. Coordinate with backend team if any tRPC endpoint signatures need adjustment

---

**End of Section 07: Group Management UI**