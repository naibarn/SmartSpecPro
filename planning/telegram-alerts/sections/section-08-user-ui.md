# Section 08: User UI -- Telegram Notifications Settings

## Overview

This section adds a "Telegram Notifications" section to the existing user Settings page at `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Settings.tsx`. The section supports a full lifecycle: linking a Telegram account via deep link, polling for verification, choosing notification levels, viewing linked status, and unlinking.

## Dependencies

- **section-01-schema-migration** -- The `users` table must have `telegramChatId`, `telegramUsername`, `telegramVerified`, `telegramVerifiedAt` columns and the extended `userPreferences` JSON type with `telegramNotifyLevel` and `telegramDeliveryFailing`.
- **section-06-user-backend** -- The tRPC router must expose these procedures under `telegram.*`:
  - `generateTelegramLink` (mutation) -- returns `{ code, deepLink, expiresIn }`
  - `checkTelegramStatus` (query) -- returns `{ linked, username?, verifiedAt?, notifyLevel, deliveryFailing }`
  - `unlinkTelegram` (mutation)
  - `updateTelegramPreferences` (mutation) -- input `{ notifyLevel: "all" | "high_critical" | "critical_only" | "off" }`

The `telegram` router must be registered in the `appRouter` at `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts` so the tRPC client can access `trpc.telegram.*`.

## Tests

There are no automated unit tests specified for the User UI section (this is a frontend React component). Verification is manual:

- Verify the "Telegram Notifications" section renders in the "Preferences" tab of the Settings page.
- Verify clicking "Link Telegram Account" calls `generateTelegramLink` and displays the deep link.
- Verify polling starts at 3-second intervals using `refetchInterval` and stops when `linked === true`.
- Verify polling auto-stops after 5 minutes (code expiry).
- Verify that once linked, the UI transitions to show the connected username, notification level selector, and unlink button.
- Verify the "Just Linked" state shows the notification level selector with "High + Critical" pre-selected.
- Verify changing notification level calls `updateTelegramPreferences` with the correct value.
- Verify the unlink button shows a confirmation dialog and calls `unlinkTelegram`.
- Verify the `deliveryFailing` warning banner appears when `deliveryFailing === true`.
- Verify the Cancel button during linking-in-progress stops polling and clears UI state.

## File to Modify

`/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Settings.tsx`

## Implementation Details

### 1. Add a `TelegramNotificationsSection` Component

Create a new function component `TelegramNotificationsSection` within `Settings.tsx` (following the same pattern as the existing `TwoFactorSection` component defined at the top of the same file). This component is self-contained and manages its own state and tRPC hooks.

**State machine** -- the section tracks one of four UI states:

| State | Display |
|-------|---------|
| `idle` (not linked) | Description text + "Link Telegram Account" button |
| `linking` | Deep link URL, instructions, spinner, cancel button, polling active |
| `just_linked` | Success message with username, notification level selector (pre-selected to `high_critical`), save button |
| `linked` | Connected status with green check, notification level dropdown, unlink button, optional delivery failure warning |

### 2. tRPC Hooks Used

All hooks use the `trpc` import from `@/lib/trpc`:

```typescript
// Generate a link (called on button click)
const generateLinkMut = trpc.telegram.generateTelegramLink.useMutation({...});

// Poll for verification status (refetchInterval: 3000ms when linking)
const statusQuery = trpc.telegram.checkTelegramStatus.useQuery(undefined, {
  enabled: isAuthenticated,
  refetchInterval: (query) => {
    // Only poll when in "linking" state, stop once linked or after 5 min
    if (linkingState !== 'linking') return false;
    if (query.state.data?.linked) return false;
    if (Date.now() - linkStartedAt > 300_000) return false;
    return 3000;
  },
});

// Unlink mutation
const unlinkMut = trpc.telegram.unlinkTelegram.useMutation({...});

// Update notification preferences
const updatePrefsMut = trpc.telegram.updateTelegramPreferences.useMutation({...});
```

### 3. Component State

```typescript
type TelegramLinkingState = 'idle' | 'linking' | 'just_linked' | 'linked';

// Key state variables:
const [linkingState, setLinkingState] = useState<TelegramLinkingState>('idle');
const [deepLink, setDeepLink] = useState<string>('');
const [linkStartedAt, setLinkStartedAt] = useState<number>(0);
const [selectedLevel, setSelectedLevel] = useState<string>('high_critical');
const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
```

Use a `useEffect` to transition from `linking` to `just_linked` when `statusQuery.data?.linked` becomes `true` for the first time. Use another `useEffect` to initialize `linkingState` to `linked` on mount if `statusQuery.data?.linked` is already `true`.

### 4. Notification Level Options

Present as a `<select>` dropdown (using the same native `<select>` styling pattern seen in the Translation preferences section of the same file):

| Value | Display Label |
|-------|--------------|
| `all` | All Notifications |
| `high_critical` | High + Critical Only |
| `critical_only` | Critical Only |
| `off` | Off |

When in `just_linked` state, default the selection to `high_critical` so the user gets immediate value.

### 5. UI Layout and Styling

Place the `TelegramNotificationsSection` inside the **Preferences tab** (`activeTab === 'preferences'`), after the existing "Notifications" subsection (the email/push toggles) and before the "Appearance" subsection. This is around line 991 in the current file (after the push notifications toggle closes its parent `div`).

Follow the existing visual patterns:

- Section heading: `<h3 className="font-semibold text-gray-900 mb-4">` with a Telegram-appropriate icon (use the `Send` icon from lucide-react, which resembles the Telegram paper plane).
- Status cards: `<div className="p-4 bg-gray-50 rounded-xl">` for idle state, `<div className="p-4 bg-green-50 border border-green-200 rounded-xl">` for linked state.
- Buttons: same `Button` component from `@/components/ui/button`, same variants (`outline`, `destructive`, default gradient).
- Loading spinner: `<Loader2 className="w-4 h-4 animate-spin" />`.
- Warning banner: `<div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">`.

### 6. Imports to Add

At the top of `Settings.tsx`, add `Send` to the lucide-react import list (for the Telegram section icon). The `Send` icon from lucide-react provides a paper-plane glyph appropriate for messaging.

The file already imports: `Button`, `Input`, `Badge`, `Dialog`/`DialogContent`/etc., `Loader2`, `Check`, `X`, `AlertCircle`, `Trash2`, `toast` from sonner, `trpc` from `@/lib/trpc`, and `useAuth`. All of these are reused.

### 7. Detailed State-by-State Rendering

**State: Not Linked (`idle`, `statusQuery.data?.linked !== true`)**

Render a card with:
- Icon: `Send` (lucide) in a blue-tinted icon box
- Title: "Telegram Notifications"
- Subtitle: "Link your Telegram account to receive instant notifications"
- Button: "Link Telegram Account" -- calls `generateLinkMut.mutate()`, on success sets `deepLink`, `linkStartedAt`, and transitions to `linking` state

**State: Linking In Progress (`linking`)**

Render:
- The deep link as a clickable `<a>` tag styled as a code block, opening in a new tab
- Instruction text: "Click the link above to open Telegram, then press Start in the bot chat"
- A small spinner with "Waiting for verification..."
- A cancel button that resets state to `idle`, clears `deepLink`, stops polling

**State: Just Linked (`just_linked`)**

Render:
- Success banner (green background): "Connected to @{username}!"
- Notification level selector with label "Choose which notifications to receive on Telegram"
- Pre-selected to "High + Critical"
- Save button that calls `updatePrefsMut.mutate({ notifyLevel: selectedLevel })` and then transitions to `linked` state

**State: Linked (returning, `linked`)**

Render:
- Green status card: "Connected to Telegram as @{username}" with green Check icon
- Notification level dropdown (current value from `statusQuery.data?.notifyLevel || 'off'`)
- Changing the dropdown immediately calls `updatePrefsMut.mutate({ notifyLevel: newValue })`
- Unlink button (outline variant, red text) with confirmation dialog
- If `statusQuery.data?.deliveryFailing` is true: amber warning banner "Recent Telegram notifications failed to deliver. Please make sure you haven't blocked the bot."

### 8. Unlink Confirmation Dialog

Use the existing `Dialog` component (already imported in `Settings.tsx`). The dialog should:
- Title: "Unlink Telegram"
- Description: "This will disconnect your Telegram account. You will stop receiving notifications on Telegram."
- Cancel button and a destructive "Unlink" button that calls `unlinkMut.mutate()`
- On success: show toast, reset state to `idle`, refetch status query

### 9. Polling Timeout Handling

When `linkStartedAt` is set and 5 minutes elapse without verification succeeding:
- Stop polling (the `refetchInterval` function returns `false`)
- Show a message: "Verification link expired. Please try again."
- Transition back to `idle` state

Implement this via the `refetchInterval` callback function on the `useQuery` options, which TanStack Query supports. The callback receives the query object and returns either `false` (to stop) or a number (interval in ms).

### 10. Component Placement

The `TelegramNotificationsSection` component should be rendered as a standalone sub-component call (like `<TwoFactorSection />` is called in the Security tab). Place it inside the Preferences tab content. Specifically, insert it between the existing notification toggles section and the Appearance section:

```
{/* Existing: Email Notifications toggle */}
{/* Existing: Push Notifications toggle */}
{/* Close existing notifications div */}

<TelegramNotificationsSection />

{/* Existing: Appearance section */}
```

### 11. Edge Cases

- If the Telegram feature is not enabled at the system level, `generateTelegramLink` will return an error. Display the error via toast and stay in `idle` state.
- If `statusQuery` is loading on first render, show a small inline skeleton or nothing until data arrives, then determine initial state.
- The `checkTelegramStatus` endpoint returns `linked: boolean` based on `telegramVerified === true` (the canonical signal), not just the presence of `telegramChatId`.
- Handle the case where `statusQuery.data?.username` is `undefined` (Telegram user without a public username) -- display "Connected to Telegram" without the `@username` suffix.
