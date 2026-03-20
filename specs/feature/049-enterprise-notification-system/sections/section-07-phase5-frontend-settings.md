# Section 07: Phase 5 -- Frontend Settings (Notification Preferences and Admin Alert Rules)

## Section ID
`section-07-phase5-frontend-settings`

## Prerequisites
| Section | What It Provides |
|---------|-----------------|
| section-04-phase5-schema-preferences | `notificationPreferences`, `alertRules`, `escalationPolicies` tables in `drizzle/schema.ts` |
| section-05-phase5-preference-delivery | `notificationPreferencesRouter` (getPreferences, upsertPreference, snoozeCategory) and `alertRulesRouter` (listRules, createRule, updateRule, deleteRule, listEscalationPolicies, createEscalationPolicy, updateEscalationPolicy, deleteEscalationPolicy) registered in `routers.ts` |

This section does NOT depend on section-06 (escalation job) and can be implemented in parallel with it.

## Overview

This section builds two frontend pages:

1. **User Notification Preferences** -- a new `notifications` tab in the existing `/settings` page, presenting a per-category preference grid with in-app/email/telegram toggles, minimum severity, and mute/snooze controls.
2. **Admin Alert Rules** -- a new `/admin/alert-rules` page with two sections: alert rule CRUD and escalation policy management.

Both pages consume tRPC routers defined in section-05.

## Files Created

| File | Purpose |
|------|---------|
| `apps/web/client/src/components/settings/NotificationPreferencesPanel.tsx` | Per-category preference grid component with feature flag gate |
| `apps/web/client/src/components/settings/NotificationPreferencesPanel.test.tsx` | 9 tests for preferences panel |
| `apps/web/client/src/pages/AdminAlertRules.tsx` | Admin page for alert rules and escalation policies (Tabs + CRUD dialogs) |
| `apps/web/client/src/pages/AdminAlertRules.test.tsx` | 11 tests for admin alert rules page |

## Files Modified

| File | Change |
|------|--------|
| `apps/web/client/src/pages/Settings.tsx` | Added `'notifications'` to `SettingsTab` union; added Bell tab trigger; renders `NotificationPreferencesPanel` |
| `apps/web/client/src/App.tsx` | Added lazy import and route `/admin/alert-rules` with `RequireAdmin` guard |
| `packages/shared/src/constants/menu.ts` | **Skipped — section-13 owns all menu entries and route registrations.** |

## Implementation Deviations

- **Feature flag gate**: Added `useNotificationPreferencesEnabled()` hook that queries `/api/tenant/current` feature flags. Defaults to `true` (enabled) since formal flag not yet in `TenantFeatureFlags` type. Section-13 will formalize.
- **Form dialog remount**: Used conditional rendering + `key` props on `AlertRuleFormDialog` and `EscalationPolicyFormDialog` to force clean form state on reopen (code review fix).
- **Route in App.tsx**: Added route here since section-13 has not yet been implemented. Section-13 may adjust.
- **i18n**: Used hardcoded English strings. Section-13 will add proper i18n key integration.

---

## 1. Tests First (TDD)

### 1.1 NotificationPreferencesPanel Tests

**File**: `apps/web/client/src/components/settings/NotificationPreferencesPanel.test.tsx`

Tests use Vitest + React Testing Library. Mock `trpc` query/mutation hooks.

```
describe("NotificationPreferencesPanel", () => {
  it("renders a row for each of the 10 notification categories")
  it("displays category labels from i18n translations")
  it("renders In-App, Email, and Telegram toggle columns for each row")
  it("renders a Min Severity dropdown with options: all, low, normal, high, critical")
  it("renders a Mute/Snooze button per category row")
  it("populates toggles from getPreferences query data")
  it("defaults to inApp=true, email=false, telegram=false when no preference row exists")
  it("calls upsertPreference mutation when a toggle is changed")
  it("calls snoozeCategory mutation with correct duration when mute button clicked")
  it("shows loading skeleton while getPreferences is fetching")
  it("shows error toast when upsertPreference mutation fails")
  it("disables toggles while a mutation is in-flight")
end
```

### 1.2 AdminAlertRules Page Tests

**File**: `apps/web/client/src/pages/AdminAlertRules.test.tsx`

```
describe("AdminAlertRules", () => {
  describe("Alert Rules tab", () => {
    it("renders a table of alert rules from listRules query")
    it("shows columns: name, metric, operator, threshold, cooldown, enabled toggle")
    it("opens create dialog when 'Add Rule' button clicked")
    it("create form operator dropdown only shows allowlisted values: gt, lt, gte, lte, eq")
    it("calls createRule mutation on form submit with valid data")
    it("shows validation error when required fields are empty")
    it("opens edit dialog pre-filled with existing rule data on row edit click")
    it("calls updateRule mutation on edit form submit")
    it("calls deleteRule mutation on delete confirmation")
    it("shows enabled/disabled toggle that calls updateRule with isEnabled toggled")
  end

  describe("Escalation Policies tab", () => {
    it("renders a table of escalation policies from listEscalationPolicies query")
    it("shows columns: name, trigger severity, trigger minutes, escalate to, enabled")
    it("opens create dialog when 'Add Policy' button clicked")
    it("calls createEscalationPolicy mutation on form submit")
    it("opens edit dialog pre-filled with existing policy on row edit click")
    it("calls deleteEscalationPolicy mutation on delete confirmation")
  end
end
```

---

## 2. Implementation Guidance

### 2.1 NotificationPreferencesPanel Component

**File**: `apps/web/client/src/components/settings/NotificationPreferencesPanel.tsx`

**Pattern**: Follow existing settings panels (`PersonasPanel.tsx`, `UserLlmKeysPanel.tsx`) -- self-contained components imported into `Settings.tsx`.

**Data flow**:
- Query: `trpc.notificationPreferences.getPreferences.useQuery()` -- returns `NotificationPreference[]` (one per category the user has configured; missing categories use defaults).
- Mutations:
  - `trpc.notificationPreferences.upsertPreference.useMutation()` -- called on toggle change or severity change
  - `trpc.notificationPreferences.snoozeCategory.useMutation()` -- called on mute button click

**Category list** (hardcoded constant, 10 categories):
```typescript
const NOTIFICATION_CATEGORIES = [
  "system_health", "media_jobs", "workflow", "skill",
  "feedback", "agency", "follow", "scheduled",
  "security", "business",
] as const;
```

**UI layout** -- a responsive grid/table:
- Each row: category label (from i18n, e.g., `t("notifications.category.system_health")`), three `Switch` toggles (inApp, email, telegram), a `Select` for minSeverity (options: "all" maps to null, "low", "normal", "high", "critical"), and a Mute button.
- The Mute button opens a small popover or dropdown offering durations: 1 hour, 4 hours, 24 hours, 1 week, or a custom date picker. On selection, call `snoozeCategory({ category, mutedUntil: computed ISO string })`.
- If a category row has `mutedUntil` in the future, show a "Muted until {date}" badge and an "Unmute" button (calls snoozeCategory with `mutedUntil: null`).
- Use `Sonner` toast for success/error feedback.
- Use `Card`, `CardHeader`, `CardTitle`, `CardContent` from `@/components/ui/card`.

**Optimistic updates**: Use TanStack Query's `onMutate` for toggle switches to provide instant feedback. Revert on error via `onError` callback.

**Feature flag gate**: Wrap the entire panel content in a check for `NOTIFICATION_PREFERENCES_ENABLED` feature flag. If disabled, show an informational message ("Notification preferences are not yet enabled for your organization."). The feature flag check should use the existing pattern from the codebase (tenant feature flags from auth context or system settings query).

### 2.2 Settings.tsx Modifications

**File**: `apps/web/client/src/pages/Settings.tsx`

Changes:
1. Add `'notifications'` to the `SettingsTab` type union.
2. Import `NotificationPreferencesPanel` from `@/components/settings/NotificationPreferencesPanel`.
3. Add a tab trigger in the sidebar/tab list with Bell icon and label "Notifications" (i18n: `t("settings.tab.notifications")`).
4. Add a `TabsContent` that renders `<NotificationPreferencesPanel />`.

Placement: Insert the notifications tab after "preferences" and before "automation" in the tab order, as notification preferences are a natural extension of user preferences.

### 2.3 AdminAlertRules Page

**File**: `apps/web/client/src/pages/AdminAlertRules.tsx`

**Pattern**: Follow existing admin pages like `AdminAuditLogs.tsx` and `AdminSettings.tsx` -- Radix `Tabs` for section switching, `Card` components, `Table` for data display, `Dialog` for create/edit modals.

**Structure**:
- Page title: "Alert Rules & Escalation" with back-to-admin link (ChevronLeft icon).
- Two tabs via Radix `Tabs`: "Alert Rules" and "Escalation Policies".

**Alert Rules tab**:
- Query: `trpc.alertRules.listRules.useQuery()` (admin procedure, returns paginated list)
- Table columns: Name, Metric Name, Operator (displayed as symbol: gt -> ">", lt -> "<", etc.), Threshold, Window (minutes), Severity (badge), Cooldown, Enabled (Switch), Actions (Edit/Delete).
- "Add Rule" button above table opens a Dialog with a form.
- Form fields (Zod-validated via React Hook Form):
  - `name` (required, varchar 100)
  - `description` (optional, text)
  - `metricName` (required, varchar 100)
  - `operator` (required, Select from allowlist: `gt`, `lt`, `gte`, `lte`, `eq`)
  - `threshold` (required, number)
  - `windowMinutes` (required, integer, default 5)
  - `severity` (required, Select: low/normal/high/critical)
  - `channels` (multi-select or checkbox group: in_app, email, telegram)
  - `targetRole` (optional, Select: user/admin/domain_admin)
  - `targetUserId` (optional, integer -- for specific user targeting)
  - `cooldownMinutes` (required, integer, default 10)
  - `isEnabled` (boolean, default true)
- Mutations: `createRule`, `updateRule`, `deleteRule`
- Delete uses `AlertDialog` confirmation pattern.

**Escalation Policies tab**:
- Query: `trpc.alertRules.listEscalationPolicies.useQuery()`
- Table columns: Name, Trigger Severity (badge), Trigger Minutes, Escalate To (role or user), Channels, Enabled (Switch), Actions.
- "Add Policy" button opens Dialog with form.
- Form fields:
  - `name` (required)
  - `triggerSeverity` (required, Select: low/normal/high/critical)
  - `triggerMinutes` (required, integer)
  - `escalateToRole` (optional, Select: admin/domain_admin)
  - `escalateToUserId` (optional, integer)
  - `escalateChannels` (multi-select: in_app, email, telegram)
  - `escalateMessage` (optional, text)
  - `isEnabled` (boolean, default true)
- Mutations: `createEscalationPolicy`, `updateEscalationPolicy`, `deleteEscalationPolicy`

**Security (S7)**: The operator dropdown MUST only offer the 5 allowlisted values (`gt`, `lt`, `gte`, `lte`, `eq`). No free-text input for operator. The backend Zod validation in section-05 is the enforcement layer, but the frontend should never present non-allowlisted options.

### 2.4 Route Registration

**File**: `apps/web/client/src/main.tsx` (or `App.tsx`, wherever routes are defined)

Add route:
```
<Route path="/admin/alert-rules" component={AdminAlertRules} />
```

Use lazy import for code splitting:
```typescript
const AdminAlertRules = lazy(() => import("@/pages/AdminAlertRules"));
```

### 2.5 Menu Entry

**File**: `packages/shared/src/constants/menu.ts`

Add to admin group (this may be handled by section-13-feature-flags-i18n; if so, coordinate -- but if implementing independently, add):

```typescript
{
  id: 'admin-alert-rules',
  label: 'Alert Rules',
  labelTh: 'กฎการแจ้งเตือน',
  icon: 'BellRing',
  path: '/admin/alert-rules',
  platforms: ['web', 'desktop'],
  roles: ['admin'],
  group: 'admin',
  sortOrder: 21.85,
  requiresFeature: 'NOTIFICATION_ESCALATION_ENABLED',
}
```

Note: `sortOrder: 21.85` places it after audit logs (21.75) and before orchestration logs (21.8). Adjust if needed to avoid collisions.

---

## 3. Component Dependencies

### UI Components Used (all from `@/components/ui/` or `@smartspec/ui`):
- `Card`, `CardContent`, `CardHeader`, `CardTitle`, `CardDescription`
- `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger`
- `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow`
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`
- `AlertDialog`, `AlertDialogAction`, `AlertDialogCancel`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`
- `Switch`
- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`
- `Button`, `Input`, `Label`, `Textarea`, `Badge`

### Lucide Icons Used:
- `Bell`, `BellRing`, `Plus`, `Pencil`, `Trash2`, `ChevronLeft`, `Loader2`, `Save`, `Shield`, `AlertTriangle`, `VolumeX` (mute), `Volume2` (unmute)

### Libraries:
- `react-hook-form` + `@hookform/resolvers/zod` for form handling
- `zod` for client-side validation schemas
- `sonner` for toast notifications
- `@tanstack/react-query` (via tRPC hooks)

---

## 4. Zod Schemas (Client-Side)

Define these in the page/component files or in a shared location if reused:

**Alert Rule form schema** (mirrors the backend Zod from section-05):
```typescript
const alertRuleFormSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  metricName: z.string().min(1).max(100),
  operator: z.enum(["gt", "lt", "gte", "lte", "eq"]),
  threshold: z.number(),
  windowMinutes: z.number().int().min(1).default(5),
  severity: z.enum(["low", "normal", "high", "critical"]),
  channels: z.array(z.string()).min(1),
  targetRole: z.string().optional(),
  targetUserId: z.number().int().optional(),
  cooldownMinutes: z.number().int().min(1).default(10),
  isEnabled: z.boolean().default(true),
});
```

**Escalation Policy form schema**:
```typescript
const escalationPolicyFormSchema = z.object({
  name: z.string().min(1).max(100),
  triggerSeverity: z.enum(["low", "normal", "high", "critical"]),
  triggerMinutes: z.number().int().min(1),
  escalateToRole: z.string().optional(),
  escalateToUserId: z.number().int().optional(),
  escalateChannels: z.array(z.string()).min(1),
  escalateMessage: z.string().max(500).optional(),
  isEnabled: z.boolean().default(true),
});
```

---

## 5. i18n Keys Required

These keys must exist in `locales/en.ts` and `locales/th.ts` (added by section-13-feature-flags-i18n, but listed here for completeness):

```
settings.tab.notifications
notifications.preferences.title
notifications.preferences.description
notifications.category.system_health
notifications.category.media_jobs
notifications.category.workflow
notifications.category.skill
notifications.category.feedback
notifications.category.agency
notifications.category.follow
notifications.category.scheduled
notifications.category.security
notifications.category.business
notifications.preferences.inApp
notifications.preferences.email
notifications.preferences.telegram
notifications.preferences.minSeverity
notifications.preferences.mute
notifications.preferences.mutedUntil
notifications.preferences.unmute
notifications.preferences.snooze.1h
notifications.preferences.snooze.4h
notifications.preferences.snooze.24h
notifications.preferences.snooze.1w
notifications.alertRules.title
notifications.alertRules.createRule
notifications.alertRules.editRule
notifications.alertRules.deleteConfirm
notifications.escalation.title
notifications.escalation.createPolicy
notifications.escalation.editPolicy
notifications.escalation.deleteConfirm
```

If section-13 has not yet added these keys, the implementer should add them as part of this section to unblock development. Use English strings as placeholder values for Thai translations if Thai text is not yet available.

---

## 6. Accessibility Notes

- All `Switch` toggles must have associated `Label` elements or `aria-label` attributes describing the toggle purpose (e.g., `aria-label="Enable in-app notifications for media jobs"`).
- Table rows should use semantic `<tr>` via Radix Table components.
- Dialog modals must trap focus and support Escape to close (handled by Radix Dialog).
- Operator dropdown and severity dropdown must be keyboard-navigable (handled by Radix Select).

---

## 7. Edge Cases

- **No preferences stored yet**: When `getPreferences` returns an empty array, render all categories with default values (inApp=true, email=false, telegram=false, minSeverity=null, mutedUntil=null). The first toggle change creates the preference row via `upsertPreference`.
- **Mute expiry**: If `mutedUntil` is in the past, treat the category as unmuted (do not show mute badge).
- **Empty rule list**: Show an empty state message with a prominent "Create your first alert rule" call-to-action.
- **Concurrent admin edits**: TanStack Query's `staleTime` should be short (30s) for the admin pages to surface changes from other admins promptly. Use `invalidateQueries` after mutations.
- **Feature flag disabled**: If `NOTIFICATION_PREFERENCES_ENABLED` is false, the Settings notifications tab should still appear but show a disabled state or info message. If `NOTIFICATION_ESCALATION_ENABLED` is false, the admin alert-rules page should show an info banner.