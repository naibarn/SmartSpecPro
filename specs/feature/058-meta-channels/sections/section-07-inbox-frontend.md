# Section 07 — Inbox Frontend

## Section ID
`section-07-inbox-frontend`

## Dependencies
- **section-02-feature-flag-menu** -- `META_CHANNELS_ENABLED` feature flag, `/social/inbox` route registration in `App.tsx`
- **section-06-inbox-backend** -- `socialInbox` tRPC router providing `listConversations`, `getConversation`, `listMessages`, `sendReply`, `generateDraft`, `updateConversationStatus`

## Overview

This section implements the `SocialInbox.tsx` page: a two-panel inbox layout for managing Messenger conversations. The left panel displays a filterable, cursor-paginated conversation list with unread badges; the right panel displays the message thread for the selected conversation along with a reply composer and AI draft button.

All data fetching uses TanStack Query via tRPC hooks. Real-time updates use polling (`refetchInterval: 10000`) as a first iteration, with WebSocket upgrade deferred to a future section.

## File Inventory

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/client/src/pages/SocialInbox.tsx` | **Create** | Main inbox page component |
| `apps/web/client/src/components/social/ConversationList.tsx` | **Create** | Left panel: filtered conversation list |
| `apps/web/client/src/components/social/MessageThread.tsx` | **Create** | Right panel: message bubbles + composer |
| `apps/web/client/src/components/social/ReplyComposer.tsx` | **Create** | Text input + AI Draft + Send buttons |
| `apps/web/client/src/components/social/ConversationListItem.tsx` | **Create** | Single row in conversation list |
| `apps/web/client/src/hooks/useSocialInbox.ts` | **Create** | Custom hook encapsulating tRPC queries and state |
| `apps/web/client/src/pages/__tests__/SocialInbox.test.tsx` | **Create** | Component tests |

## Tests (TDD)

### Test File: `apps/web/client/src/pages/__tests__/SocialInbox.test.tsx`

Tests use Vitest + `@testing-library/react`. Mock the tRPC layer using `vi.hoisted()` and `vi.mock("@/lib/trpc", ...)` following the established pattern in `MemoryPanel.test.tsx`.

```
# Test: renders two-panel layout with conversation list and empty thread placeholder
# Test: fetches listConversations on mount with default status filter "open"
# Test: renders conversation items with customer name, last message preview, and timestamp
# Test: shows unread badge when conversation.unreadCount > 0
# Test: clicking a conversation item calls getConversation and displays messages
# Test: renders inbound messages on left and outbound messages on right
# Test: displays sender type indicator (customer / agent / AI) on each message bubble
# Test: filter tabs (All, Open, Pending, Resolved) update the status query parameter
# Test: page filter dropdown calls listConversations with selected pageId
# Test: infinite scroll triggers next page fetch when scrolled to bottom (cursor pagination)
# Test: ReplyComposer sends message via sendReply mutation on form submit
# Test: ReplyComposer disables send button when input is empty
# Test: ReplyComposer shows loading spinner while sendReply is pending
# Test: AI Draft button calls generateDraft and populates composer input with returned text
# Test: AI Draft button shows confidence badge next to populated text
# Test: Mark Resolved button calls updateConversationStatus with status "resolved"
# Test: Mark Pending button calls updateConversationStatus with status "pending"
# Test: refetchInterval is set to 10000ms on listConversations query
# Test: conversation list shows "No conversations" empty state when data is empty
# Test: message thread shows "Select a conversation" placeholder when none selected
```

### Test File: `apps/web/client/src/hooks/__tests__/useSocialInbox.test.ts`

```
# Test: hook returns conversations, selectedConversation, messages, filters, and actions
# Test: setStatusFilter updates the status parameter and refetches
# Test: setPageFilter updates the pageId parameter and refetches
# Test: selectConversation sets selectedConversationId and triggers getConversation query
# Test: sendReply calls mutation and invalidates conversation queries on success
# Test: generateDraft calls mutation and returns draft text + confidence
```

## Implementation Guidance

### 1. `useSocialInbox` Hook

**File:** `apps/web/client/src/hooks/useSocialInbox.ts`

This hook encapsulates all tRPC queries and mutations for the inbox page. It manages:

- **State:** `selectedConversationId`, `statusFilter` (default `"open"`), `pageFilter` (optional), `cursor`
- **Queries:**
  - `trpc.socialInbox.listConversations.useQuery({ status: statusFilter, pageId: pageFilter, cursor, limit: 30 }, { refetchInterval: 10000, refetchIntervalInBackground: false })`
  - `trpc.socialInbox.getConversation.useQuery({ conversationId: selectedConversationId }, { enabled: !!selectedConversationId })`
  - `trpc.socialInbox.listMessages.useQuery({ conversationId: selectedConversationId, limit: 50 }, { enabled: !!selectedConversationId, refetchInterval: 10000 })`
- **Mutations:**
  - `trpc.socialInbox.sendReply.useMutation({ onSuccess: () => invalidate listMessages + listConversations })`
  - `trpc.socialInbox.generateDraft.useMutation()`
  - `trpc.socialInbox.updateConversationStatus.useMutation({ onSuccess: () => invalidate listConversations })`
- **Return shape:** `{ conversations, selectedConversation, messages, isLoading, statusFilter, setStatusFilter, pageFilter, setPageFilter, selectConversation, sendReply, generateDraft, updateStatus, hasNextPage, fetchNextPage }`

The hook should use `trpc.useUtils()` to access invalidation methods, matching the pattern used in `MemoryPanel.tsx`.

### 2. `SocialInbox.tsx` Page

**File:** `apps/web/client/src/pages/SocialInbox.tsx`

Top-level page component. Layout structure:

```
<div className="flex h-full">
  <ConversationList />    {/* left panel, w-80 or w-96 */}
  <MessageThread />       {/* right panel, flex-1 */}
</div>
```

- Import and use `useSocialInbox()` hook
- Pass relevant props down to child components
- Header bar with page title "Social Inbox" and page filter dropdown (using `Select` from `@/components/ui/select`)
- Use `MessageCircle` icon from `lucide-react` (matching menu item)
- Wrap in `RequireAuth` via the route definition in `App.tsx` (already configured in section-02)

### 3. `ConversationList.tsx`

**File:** `apps/web/client/src/components/social/ConversationList.tsx`

Props interface:

```typescript
interface ConversationListProps {
  conversations: Conversation[];
  selectedId: number | null;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  onSelect: (conversationId: number) => void;
  isLoading: boolean;
  hasNextPage: boolean;
  onLoadMore: () => void;
}
```

Key elements:

- **Filter tabs** at top: "All" | "Open" | "Pending" | "Resolved" using `Button` with `variant="ghost"` or `variant="outline"` for active state. Map to `statusFilter` values: `undefined`, `"open"`, `"pending"`, `"resolved"`.
- **Conversation items** rendered via `ConversationListItem`
- **Infinite scroll**: Attach an `IntersectionObserver` to a sentinel `<div>` at the bottom of the list. When visible and `hasNextPage` is true, call `onLoadMore()`.
- **Empty state**: Centered text "No conversations" with `MessageCircle` icon when list is empty.
- **Loading state**: Skeleton loader or `Loader2` spinner.

### 4. `ConversationListItem.tsx`

**File:** `apps/web/client/src/components/social/ConversationListItem.tsx`

Props interface:

```typescript
interface ConversationListItemProps {
  conversation: {
    id: number;
    customerDisplayName: string | null;
    lastMessagePreview: string | null;
    lastMessageAt: string | null;
    unreadCount: number;
    status: string;
    channelType: string;
  };
  isSelected: boolean;
  onClick: () => void;
}
```

Key elements:

- Customer display name (fallback to `"Unknown"` if null)
- Last message preview text, truncated to ~60 chars with ellipsis
- Relative timestamp (e.g., "2m ago", "1h ago") using a simple formatter or `date-fns/formatDistanceToNow`
- Unread count badge: `Badge` component from `@/components/ui/badge` shown only when `unreadCount > 0`
- Selected state: highlight background with `bg-accent` or similar Tailwind class
- Status indicator dot (green for open, yellow for pending, gray for resolved)

### 5. `MessageThread.tsx`

**File:** `apps/web/client/src/components/social/MessageThread.tsx`

Props interface:

```typescript
interface MessageThreadProps {
  conversation: Conversation | null;
  messages: Message[];
  isLoading: boolean;
  onSendReply: (body: string) => void;
  onGenerateDraft: () => Promise<{ draft: string; confidence: number }>;
  onUpdateStatus: (status: string) => void;
  isSending: boolean;
}
```

Key elements:

- **Empty state**: When `conversation` is null, show centered placeholder "Select a conversation to view messages"
- **Status bar**: At top, show conversation customer name, page name, status badge, and quick action buttons ("Mark Resolved", "Mark Pending")
- **Message list**: Scrollable container with `overflow-y-auto`. Messages rendered as chat bubbles:
  - Inbound (`direction === "inbound"`): aligned left, neutral background (`bg-muted`)
  - Outbound (`direction === "outbound"`): aligned right, primary background (`bg-primary text-primary-foreground`)
  - Sender type badge below each bubble: "Customer", "Agent", "AI" (use `Badge` with `variant="outline"`)
  - Timestamp below each bubble
- **Auto-scroll**: Scroll to bottom when new messages arrive. Use a `useEffect` + `ref.scrollIntoView()` pattern.
- **Reply composer**: `ReplyComposer` component at the bottom.

### 6. `ReplyComposer.tsx`

**File:** `apps/web/client/src/components/social/ReplyComposer.tsx`

Props interface:

```typescript
interface ReplyComposerProps {
  onSend: (body: string) => void;
  onGenerateDraft: () => Promise<{ draft: string; confidence: number }>;
  isSending: boolean;
  disabled?: boolean;
}
```

Key elements:

- **Text input**: `Textarea` component from `@/components/ui/textarea` with `rows={2}`, auto-expanding up to 6 rows
- **AI Draft button**: `Button` with `variant="outline"` and `Wand2` icon. On click:
  1. Set local loading state
  2. Call `onGenerateDraft()`
  3. Populate textarea with returned draft text
  4. Show confidence as a small `Badge` next to the textarea (e.g., "95% confident")
  5. User can edit text before sending
- **Send button**: `Button` with `Send` icon from lucide-react. Disabled when textarea is empty or `isSending` is true. Shows `Loader2` spinner when `isSending`.
- **Keyboard shortcut**: `Ctrl+Enter` or `Cmd+Enter` to send (match existing chat pattern)
- **After send**: Clear textarea and confidence badge
- **Error handling**: Use `toast.error()` from Sonner on send failure

### 7. Styling and Layout

Follow existing Tailwind patterns in the codebase:

- Use `cn()` from `@/lib/utils` for conditional class merging
- Use Radix UI primitives via `@/components/ui/` (Button, Badge, Select, Textarea, Separator)
- Two-panel layout uses `flex` with fixed-width left panel and `flex-1` right panel
- Border between panels: `border-r` on left panel
- Responsive: On mobile (`md:` breakpoint), consider showing only conversation list or thread based on selection state (optional for MVP, can use a simple conditional render)

### 8. Data Types

The component expects these shapes from the tRPC router (defined in section-06):

```typescript
// Conversation shape (from listConversations / getConversation)
interface Conversation {
  id: number;
  customerDisplayName: string | null;
  customerExternalId: string;
  channelType: string;
  status: string; // "open" | "pending" | "resolved" | "archived"
  unreadCount: number;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  pageId: number;
  pageName?: string;
}

// Message shape (from listMessages)
interface Message {
  id: number;
  direction: "inbound" | "outbound";
  senderType: "customer" | "agent" | "ai" | "system";
  body: string | null;
  messageType: string;
  sentAt: string | null;
  receivedAt: string | null;
  deliveryStatus: string;
  createdAt: string;
}

// GenerateDraft response
interface DraftResult {
  draft: string;
  confidence: number;
}
```

These types should be defined in a shared file `apps/web/client/src/types/social.ts` or inferred from the tRPC router return types using `RouterOutputs`.

### 9. Integration with App.tsx Route

The route is registered in section-02-feature-flag-menu:

```typescript
// In App.tsx — already configured by section-02
const SocialInbox = lazy(() => import("@/pages/SocialInbox"));
// Route: /social/inbox → <SocialInbox /> wrapped in RequireAuth
```

The page export should be a default export to support `React.lazy()`:

```typescript
export default function SocialInbox() { ... }
```

### 10. tRPC Router Reference

All tRPC procedures used by this section are defined in section-06 (`apps/web/server/routers/socialInbox.ts`):

| Procedure | Type | Used By |
|-----------|------|---------|
| `socialInbox.listConversations` | query | `ConversationList` via `useSocialInbox` |
| `socialInbox.getConversation` | query | `MessageThread` via `useSocialInbox` |
| `socialInbox.listMessages` | query | `MessageThread` via `useSocialInbox` |
| `socialInbox.sendReply` | mutation | `ReplyComposer` via `useSocialInbox` |
| `socialInbox.generateDraft` | mutation | `ReplyComposer` via `useSocialInbox` |
| `socialInbox.updateConversationStatus` | mutation | `MessageThread` status buttons |

### 11. Error Handling

- **Network errors**: TanStack Query default retry (3 attempts). Show toast on final failure.
- **Feature disabled**: If `META_CHANNELS_ENABLED` is false, the tRPC middleware returns an error. The route should not be accessible (menu hidden by section-02), but if accessed directly, the query error should be caught and displayed as an alert.
- **Send failure**: `sendReply` mutation `onError` shows `toast.error("Failed to send message")`.
- **Draft failure**: `generateDraft` mutation `onError` shows `toast.error("Failed to generate AI draft")`.
- **Cross-tenant**: Backend rejects cross-tenant access; frontend displays generic error.

### 12. Accessibility

- Conversation list items are `<button>` or have `role="option"` with `aria-selected`
- Message thread is a `role="log"` container with `aria-live="polite"` for new messages
- Reply composer textarea has `aria-label="Reply message"`
- Send button has `aria-label="Send reply"`
- AI Draft button has `aria-label="Generate AI draft reply"`
- Filter tabs have `role="tablist"` / `role="tab"` / `aria-selected`

## Verification Checklist

1. All 19 component tests in `SocialInbox.test.tsx` pass
2. All 6 hook tests in `useSocialInbox.test.ts` pass
3. `pnpm check` (TypeScript) passes with no errors in new files
4. Page renders correctly at `/social/inbox` route
5. Two-panel layout is visible with conversation list and thread
6. Clicking a conversation populates the right panel with messages
7. Sending a reply creates an outbound message and clears the composer
8. AI Draft populates the composer with generated text and confidence badge
9. Filter tabs correctly filter the conversation list by status
10. Unread badges display and disappear after selecting a conversation