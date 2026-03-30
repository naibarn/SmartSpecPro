I now have all the context needed to write the complete section. Let me produce the full content:

---

# Section 05 — `SocialPlatformPicker` + `SocialAccountPicker` Components

## Overview

This section implements two focused presentation components that together handle the social destination sub-flow within Step 4 (Destination) of the Article Composer wizard. The components are consumed by `DestinationStep` (section-06) but are implemented as a standalone, independently testable pair.

**Depends on:** section-02 (`ComposerState` / `ComposerAction` types from `composerReducer.ts`)
**Blocks:** section-06 (wizard steps — `DestinationStep` imports both components)

The two components work in sequence:

1. `SocialPlatformPicker` — renders four platform icon pills (YouTube, Facebook, TikTok, Upload-Post); consults existing tRPC queries to know which platforms have connected accounts; disables platforms with no accounts.
2. `SocialAccountPicker` — receives a `platform` prop; filters the `listPages` result to accounts matching the platform's `provider` value; renders account cards with `publishingReady` badges and `publishingIssueCode` descriptions.

---

## Files to Create

| File | Purpose |
|---|---|
| `apps/web/client/src/components/media/composer/SocialPlatformPicker.tsx` | Platform pill selector |
| `apps/web/client/src/components/media/composer/SocialAccountPicker.tsx` | Account list filtered by platform |
| `apps/web/client/src/components/media/composer/__tests__/SocialPlatformPicker.test.tsx` | Tests for both components |

---

## Background: State Contract from Section 02

The `composerReducer` (section-02) owns these fields that these components read and mutate:

```typescript
// Fields read from ComposerState
socialPlatform: "youtube" | "facebook" | "tiktok" | "upload_post" | null;
socialTargetId: number | null;
```

Actions dispatched by these components (must match the action union in `composerReducer.ts`):

```typescript
{ type: "SET_SOCIAL_PLATFORM"; payload: "youtube" | "facebook" | "tiktok" | "upload_post" | null }
{ type: "SET_SOCIAL_TARGET"; payload: number | null }
```

Import the action type as:

```typescript
import type { ComposerAction } from "../composerReducer";
```

---

## Platform-to-Provider Mapping

The existing `socialPages` rows use a `provider` string that differs from the user-visible platform names. The components must translate between the two:

| User-visible platform | `provider` field in `SocialPublishingPageOption` |
|---|---|
| `"youtube"` | `"youtube"` |
| `"facebook"` | `"meta"` |
| `"tiktok"` | `"tiktok"` |
| `"upload_post"` | handled separately via `uploadPost.getConnection` |

Define this mapping as a module-level constant:

```typescript
// In SocialPlatformPicker.tsx and shared by SocialAccountPicker.tsx
export const PLATFORM_TO_PROVIDER: Record<
  "youtube" | "facebook" | "tiktok",
  string
> = {
  youtube: "youtube",
  facebook: "meta",
  tiktok: "tiktok",
};
```

`"upload_post"` is intentionally excluded from this map — its availability is checked via `trpc.uploadPost.getConnection` rather than `listPages`.

---

## Component 1: `SocialPlatformPicker`

**File:** `apps/web/client/src/components/media/composer/SocialPlatformPicker.tsx`

### Props Interface

```typescript
export interface SocialPlatformPickerProps {
  /** Currently selected platform from composer state */
  selectedPlatform: "youtube" | "facebook" | "tiktok" | "upload_post" | null;
  /** Dispatch from useReducer in ContentComposerPanel */
  dispatch: React.Dispatch<ComposerAction>;
  /** Optional class name for outer wrapper */
  className?: string;
}
```

### Data Dependencies

The component calls two tRPC queries internally:

```typescript
// 1. Social pages list — determines which non-upload-post platforms have connected accounts
const { data: pagesData, isLoading: pagesLoading } =
  trpc.socialPublishing.listPages.useQuery();

// 2. Upload-Post connection — determines whether upload_post is available
const { data: uploadPostConnection, isLoading: uploadPostLoading } =
  trpc.uploadPost.getConnection.useQuery();
```

Both queries are already used in `SocialPublishing.tsx` and `apps/web/client/src/pages/__tests__/SocialPublishing.test.tsx`. No new tRPC procedures are needed.

### Platform Availability Logic

Compute per-platform availability from the query results:

```typescript
const platformAvailability = useMemo(() => {
  const pages = pagesData ?? [];
  return {
    youtube: pages.some((p) => p.provider === PLATFORM_TO_PROVIDER.youtube),
    facebook: pages.some((p) => p.provider === PLATFORM_TO_PROVIDER.facebook),
    tiktok: pages.some((p) => p.provider === PLATFORM_TO_PROVIDER.tiktok),
    upload_post: Boolean(uploadPostConnection?.connected),
  };
}, [pagesData, uploadPostConnection]);
```

`uploadPostConnection` shape: check against `uploadPostConnection?.connected` — the `getConnection` query returns an object with at minimum a `connected: boolean` field. If the shape differs, adapt: a non-null `uploadPostConnection` with any truthy `apiKeyConfigured` or `connectionId` also indicates connected state. The implementer should read `apps/web/server/routers/uploadPost.ts` `getConnection` return type and adapt this check accordingly.

### Platform Definitions

Define the four pills as a static array:

```typescript
const PLATFORMS: Array<{
  id: "youtube" | "facebook" | "tiktok" | "upload_post";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "youtube",      label: "YouTube",      icon: YoutubeIcon },
  { id: "facebook",     label: "Facebook",     icon: FacebookIcon },
  { id: "tiktok",       label: "TikTok",       icon: TiktokIcon },
  { id: "upload_post",  label: "Upload-Post",  icon: UploadIcon },
];
```

Use icons from `lucide-react` where available (e.g., `Youtube`, `Upload`). For Facebook and TikTok, check whether `lucide-react` exports these; if not, use the `Share2` or `Globe` fallback icons. Alternatively, use text abbreviations inside styled pills (e.g., `"FB"`, `"TT"`). The implementer should check the version of `lucide-react` installed in `apps/web/package.json` and use whatever social icons are available.

### Render Structure

Each platform is a button-like pill. Disabled pills (no connected account) show a tooltip: "Connect {Platform} first".

```
<div className="flex flex-wrap gap-2">
  {PLATFORMS.map(({ id, label, icon: Icon }) => {
    const isAvailable = platformAvailability[id];
    const isSelected = selectedPlatform === id;
    const isDisabled = !isAvailable || loading;

    return (
      <Tooltip content={!isAvailable ? `Connect ${label} first` : undefined}>
        <button
          key={id}
          disabled={isDisabled}
          aria-pressed={isSelected}
          onClick={() => dispatch({ type: "SET_SOCIAL_PLATFORM", payload: id })}
          className={cn(
            "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
            isSelected && "border-primary bg-primary/10 text-primary",
            !isSelected && isAvailable && "border-border hover:bg-muted",
            isDisabled && "cursor-not-allowed opacity-40",
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      </Tooltip>
    );
  })}
</div>
```

Use the existing `Tooltip` component from `@/components/ui/tooltip` (Radix-based). If no Tooltip component exists, use an HTML `title` attribute as a fallback.

Use `cn()` from `@/lib/utils` for conditional class merging.

### Loading State

While `pagesLoading || uploadPostLoading`, render a skeleton placeholder (4 pill-shaped divs with `animate-pulse`). Do not render the interactive pills while loading.

---

## Component 2: `SocialAccountPicker`

**File:** `apps/web/client/src/components/media/composer/SocialAccountPicker.tsx`

### Props Interface

```typescript
export interface SocialAccountPickerProps {
  /** The platform selected in SocialPlatformPicker */
  platform: "youtube" | "facebook" | "tiktok" | "upload_post";
  /** Currently selected account/page ID from composer state */
  selectedAccountId: number | null;
  /** Dispatch from useReducer in ContentComposerPanel */
  dispatch: React.Dispatch<ComposerAction>;
  /** Optional class name for outer wrapper */
  className?: string;
}
```

### Data Dependencies

`SocialAccountPicker` does NOT make its own tRPC calls for `"youtube"`, `"facebook"`, or `"tiktok"` platforms. Instead, the parent `DestinationStep` (section-06) passes the already-fetched `pagesData` down as a prop — OR the component calls `listPages` itself via `useQuery` (which is cached and will not result in a second network call due to TanStack Query deduplication). Either approach is valid. The component-local approach (calling `useQuery` itself) is simpler and preferred:

```typescript
const { data: pagesData } = trpc.socialPublishing.listPages.useQuery();

// For upload_post: fetch Upload-Post profiles
const { data: profilesData } = trpc.uploadPost.listProfiles.useQuery(
  undefined,
  { enabled: platform === "upload_post" },
);
```

### Account Filtering

For non-upload-post platforms:

```typescript
const accounts = useMemo(() => {
  if (platform === "upload_post") return [];
  const providerKey = PLATFORM_TO_PROVIDER[platform];
  return (pagesData ?? []).filter((p) => p.provider === providerKey);
}, [pagesData, platform]);
```

For `"upload_post"`, render profiles from `profilesData` (the `listProfiles` result from the `uploadPostRouter`). Each Upload-Post profile has at minimum `id` and `name` fields. Check `apps/web/server/routers/uploadPost.ts` `listProfiles` return shape before implementing — adapt field names accordingly.

### Render Structure

Each account is rendered as a card with:
- Account/page name (bold)
- Provider indicator (small badge or muted text)
- `publishingReady` status badge using `formatPublishingReadiness()` and `getPublishingReadinessTone()` from `@/types/social`

Accounts with `publishingReady === false` are shown but not selectable (button is disabled, shows the issue description). They must still render so the user knows what accounts exist and what is wrong.

```
<div className="space-y-2">
  {accounts.length === 0 && (
    <EmptyState message="No connected {Platform} accounts found." />
  )}
  {accounts.map((account) => {
    const isReady = account.publishingReady !== false;
    const isSelected = selectedAccountId === account.id;

    return (
      <button
        key={account.id}
        disabled={!isReady}
        onClick={() =>
          dispatch({ type: "SET_SOCIAL_TARGET", payload: account.id })
        }
        className={cn(
          "w-full rounded-lg border p-3 text-left transition-colors",
          isSelected && "border-primary bg-primary/5",
          !isSelected && isReady && "hover:bg-muted",
          !isReady && "cursor-not-allowed opacity-60",
        )}
      >
        <div className="flex items-center justify-between">
          <span className="font-medium">{account.pageName ?? account.label}</span>
          <Badge className={getPublishingReadinessTone(account.publishingIssueCode)}>
            {formatPublishingReadiness(account.publishingIssueCode)}
          </Badge>
        </div>
        {!isReady && account.publishingIssue && (
          <p className="mt-1 text-xs text-muted-foreground">{account.publishingIssue}</p>
        )}
      </button>
    );
  })}
</div>
```

### Upload-Post Rendering

For `platform === "upload_post"`, profiles do not have `publishingReady`/`publishingIssueCode` in the same shape. Render them as simple selectable cards with a name. All profiles are assumed ready. The `SET_SOCIAL_TARGET` action is dispatched with the profile `id` (integer).

### Empty State

If no accounts match the filtered platform, show:

```
<p className="text-sm text-muted-foreground">
  No connected {platformLabel} accounts found. 
  <a href="/social/channels" className="text-primary underline ml-1">
    Connect an account
  </a>
</p>
```

The link navigates to `/social/channels` using a standard `<a>` tag (not `<Link>` from Wouter — to allow for full-page navigation in case the user needs to OAuth).

---

## Tests

**File:** `apps/web/client/src/components/media/composer/__tests__/SocialPlatformPicker.test.tsx`

The test file covers both `SocialPlatformPicker` and `SocialAccountPicker` in a single file for co-location of related tests.

### Test Framework

Vitest + `@testing-library/react` + jsdom. Match the patterns used in `apps/web/client/src/pages/__tests__/SocialPublishing.test.tsx`.

### Mock Setup

Mock `@/lib/trpc` at the top of the file:

```typescript
import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// --- Mock tRPC ---
const mockListPagesQuery = vi.fn();
const mockGetConnectionQuery = vi.fn();
const mockListProfilesQuery = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    socialPublishing: {
      listPages: { useQuery: mockListPagesQuery },
    },
    uploadPost: {
      getConnection: { useQuery: mockGetConnectionQuery },
      listProfiles: { useQuery: mockListProfilesQuery },
    },
  },
}));
```

Define reusable fixture data:

```typescript
const META_PAGE = {
  id: 10,
  label: "My Facebook Page",
  status: "active",
  provider: "meta",
  pageName: "My Facebook Page",
  pageCategory: "Business",
  providerPageId: "page-10",
  publishingReady: true,
  publishingIssueCode: "ready" as const,
  publishingIssue: null,
};

const YOUTUBE_PAGE = {
  id: 11,
  label: "My YouTube Channel",
  status: "active",
  provider: "youtube",
  pageName: "My YouTube Channel",
  pageCategory: null,
  providerPageId: "channel-11",
  publishingReady: true,
  publishingIssueCode: "ready" as const,
  publishingIssue: null,
};

const UNREADY_TIKTOK_PAGE = {
  id: 12,
  label: "TikTok Account",
  status: "active",
  provider: "tiktok",
  pageName: "TikTok Account",
  pageCategory: null,
  providerPageId: "tt-12",
  publishingReady: false,
  publishingIssueCode: "missing_page_access" as const,
  publishingIssue: "Page access token is missing",
};

const UPLOAD_POST_CONNECTION = { connected: true, connectionId: 99 };
const UPLOAD_POST_PROFILE = { id: 20, name: "My Upload-Post Profile" };
```

Use a `beforeEach` block to set default mock return values:

```typescript
beforeEach(() => {
  mockListPagesQuery.mockReturnValue({
    data: [META_PAGE, YOUTUBE_PAGE, UNREADY_TIKTOK_PAGE],
    isLoading: false,
  });
  mockGetConnectionQuery.mockReturnValue({
    data: UPLOAD_POST_CONNECTION,
    isLoading: false,
  });
  mockListProfilesQuery.mockReturnValue({
    data: [UPLOAD_POST_PROFILE],
    isLoading: false,
  });
});
```

### SocialPlatformPicker Tests

**Rendering:**

```typescript
// Test: renders all 4 platform options (YouTube, Facebook, TikTok, Upload-Post)
// Test: platforms with connected accounts are enabled (not disabled)
// Test: platforms with no connected accounts are disabled
// Test: disabled platform shows "Connect {platform} first" tooltip/title
// Test: selected platform has aria-pressed="true"
// Test: non-selected platforms have aria-pressed="false"
// Test: shows loading skeleton when pagesLoading is true
// Test: shows loading skeleton when uploadPostLoading is true
```

**Interactions:**

```typescript
// Test: clicking an enabled platform dispatches SET_SOCIAL_PLATFORM with the platform id
// Test: clicking an already-selected platform dispatches SET_SOCIAL_PLATFORM again (re-select is allowed)
// Test: clicking a disabled platform does NOT dispatch any action
```

**Availability logic:**

```typescript
// Test: Facebook pill is enabled when a "meta" provider page exists in listPages
// Test: YouTube pill is enabled when a "youtube" provider page exists in listPages
// Test: TikTok pill is enabled when a "tiktok" provider page exists in listPages
// Test: Upload-Post pill is enabled when uploadPost.getConnection returns connected = true
// Test: Facebook pill is disabled when no "meta" provider page exists
// Test: Upload-Post pill is disabled when getConnection returns connected = false or null data
```

### SocialAccountPicker Tests

**Facebook platform (provider = "meta"):**

```typescript
// Test: shows only accounts with provider === "meta" when platform is "facebook"
// Test: "My YouTube Channel" (provider "youtube") is NOT shown when platform is "facebook"
// Test: account with publishingReady = true shows "Ready to publish" badge
// Test: account with publishingReady = true is not disabled
// Test: clicking a ready account dispatches SET_SOCIAL_TARGET with the account's id
// Test: selected account has visible selection indicator (e.g., border-primary class or aria-pressed)
```

**TikTok platform with unready account:**

```typescript
// Test: unready account (publishingReady = false) is shown but disabled
// Test: unready account shows the publishingIssueCode description via formatPublishingReadiness
// Test: clicking a disabled (unready) account does NOT dispatch SET_SOCIAL_TARGET
```

**Empty state:**

```typescript
// Test: when no accounts match the platform, shows empty state message with "Connect an account" link
// Test: "Connect an account" link href is "/social/channels"
```

**Upload-Post platform:**

```typescript
// Test: upload_post platform renders profiles from listProfiles query
// Test: clicking a profile dispatches SET_SOCIAL_TARGET with the profile id
// Test: listProfiles useQuery is called with enabled = true when platform is "upload_post"
// Test: listProfiles useQuery is called with enabled = false when platform is not "upload_post"
```

---

## i18n Keys

All user-visible strings in these components must use the `useI18n()` hook. Add the following keys to `apps/web/client/src/lib/i18n/locales/en.ts` and `th.ts` under the `mediaStudio.articleComposer` namespace (following the existing nesting pattern in those files):

```typescript
// en.ts additions under mediaStudio.articleComposer
socialPlatformPicker: {
  connectFirst: "Connect {platform} first",
  loading: "Loading platforms…",
},
socialAccountPicker: {
  emptyState: "No connected {platform} accounts found.",
  connectLink: "Connect an account",
  readyBadge: "Ready",
},
```

Use `t("mediaStudio.articleComposer.socialPlatformPicker.connectFirst", { platform: label })` syntax matching whatever interpolation pattern `useI18n()` supports in this codebase. Check how interpolation is done in other components (e.g., search for `t(` with `{` in `apps/web/client/src/pages/` to find the pattern).

---

## Dependencies

- `@/lib/trpc` — `trpc.socialPublishing.listPages.useQuery()`, `trpc.uploadPost.getConnection.useQuery()`, `trpc.uploadPost.listProfiles.useQuery()`
- `@/types/social` — `SocialPublishingPageOption`, `formatPublishingReadiness`, `getPublishingReadinessTone`
- `@/components/ui/badge` — Badge primitive
- `@/components/ui/tooltip` — Tooltip wrapper (for disabled pill tooltips)
- `@/lib/utils` — `cn()` for class merging
- `composerReducer` — `ComposerAction` type import (section-02)
- `lucide-react` — platform icons

No new npm packages are required for this section.

---

## What This Section Does NOT Cover

- The parent `DestinationStep` component that renders these pickers — that is section-06.
- The `generateSocialCaption` tRPC call triggered after account selection — called by `DestinationStep` (section-06) in response to `SET_SOCIAL_TARGET` dispatch.
- The Upload-Post connection setup UI — that lives in `TenantSettings.tsx` and `UploadPostGatewayPanel.tsx` (already implemented).
- The `ComposerState` shape and action definitions — defined in section-02.
- Social caption textarea and character counter — section-06.

---

## Implementation Checklist

- [ ] Create `SocialPlatformPicker.tsx` with platform availability logic, disabled-pill rendering, and `SET_SOCIAL_PLATFORM` dispatch
- [ ] Create `SocialAccountPicker.tsx` with `provider`-filtered account list, `publishingReady` badge rendering, disabled-but-visible unready accounts, and empty state
- [ ] Add `PLATFORM_TO_PROVIDER` map to `SocialPlatformPicker.tsx` and export it for use in `SocialAccountPicker.tsx`
- [ ] Create `__tests__/SocialPlatformPicker.test.tsx` with all test stubs listed above (stubs fail initially — fill in implementations after components are written)
- [ ] Add i18n keys to `en.ts` and `th.ts` under `mediaStudio.articleComposer.socialPlatformPicker` and `mediaStudio.articleComposer.socialAccountPicker`
- [ ] Verify `trpc.uploadPost.listProfiles` is accessible from the client (check `apps/web/server/routers.ts` — `uploadPostRouter` must be registered; it already is based on the existing SocialPublishing page imports)
- [ ] Run `pnpm test -- --testPathPattern="SocialPlatformPicker"` to confirm test collection

---

## Consistency Notes for Neighboring Sections

- **section-06 (`DestinationStep`):** Renders `<SocialPlatformPicker>` first; when `selectedPlatform` is non-null, renders `<SocialAccountPicker platform={selectedPlatform}>` below it. The `DestinationStep` owns the `dispatch` reference passed down from `ContentComposerPanel` and threads it through as a prop.
- **section-07 (`ContentComposerPanel`):** The `socialPlatform` and `socialTargetId` fields in `ComposerState` are set by actions dispatched from these components. The panel reads `socialTargetId` state changes in a `useEffect` to trigger `generateSocialCaption` mutation.
- **section-09 (`publish`):** The server-side publish procedure reads `socialPlatform` and `socialTargetId` from the saved draft. `socialTargetId` is always a `socialPages.id` (integer) for native platforms or an Upload-Post profile ID for the upload_post platform. The section-09 implementer must handle both cases.
- **section-02 (`composerReducer`):** `SET_SOCIAL_PLATFORM` action resets `socialTargetId` to `null` to avoid stale cross-platform account references. Add this side effect to the `SET_SOCIAL_PLATFORM` reducer case: when the platform changes, clear `socialTargetId: null` and `socialCaption: ""`, reset `captionIsManuallyEdited: false`.