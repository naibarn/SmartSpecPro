## Code Review: Section 07 - Phase 5 Frontend Settings

### Summary

The implementation delivers two functional frontend surfaces — the `NotificationPreferencesPanel` settings tab and the `AdminAlertRules` admin page — that closely match the spec. Core security requirement S7 (operator allowlist enforced as a Zod enum + Radix Select) is correctly implemented. React patterns for optimistic updates, mutation error handling, and accessibility are mostly solid. The main concerns are: (1) the feature flag gate specified by the plan is entirely absent; (2) the `AlertRuleFormDialog` does not reset form state between open/close cycles, causing stale data in the create dialog after a previous edit; (3) the escalation-policies test block is nearly vacuous — three of five tests never render the component against real query data; and (4) several plan-required tests are missing, particularly around the edit dialog pre-fill and form validation paths. An out-of-scope `runEngine` change is bundled into the diff.

---

### Findings

---

**[HIGH] Feature flag gate entirely absent — NotificationPreferencesPanel**

The spec (section 2.1, last paragraph) requires the entire panel content to be wrapped in a check for `NOTIFICATION_PREFERENCES_ENABLED`. If the flag is false the user should see an informational message. The implementation omits this check entirely: `NotificationPreferencesPanel.tsx` renders the full grid unconditionally. Given that section-05 found that the backend reads `process.env.NOTIFICATION_PREFERENCES_ENABLED` directly without going through the tenant feature flag system, the frontend also bypassing the flag means there is no coordinated gate at any layer when the feature is partially deployed.

- Recommendation: Query the tenant feature flags or system settings (whichever pattern the codebase uses for other feature flags) and conditionally render the grid vs. a "not enabled" message. Coordinate with the section-05 fix that gates the backend delivery to also use the tenant feature flag system.

---

**[HIGH] `AlertRuleFormDialog` does not reset form state on reopen**

`AlertRuleFormDialog` calls `useForm` once at the top of the component. When the dialog is opened for "Create" after the user previously opened "Edit", React does not re-mount the component (it is kept in the tree as `{isCreateOpen && ...}` — actually both dialogs are always mounted because they are rendered unconditionally below the table). The `defaultValues` object passed to `useForm` is only read at initial mount; changing `defaultValues` between renders does not reset the form. Concretely: if an admin opens "Edit Rule #1" (pre-filled with `name: "High Error Rate"`), closes it, then opens "Create", the create dialog will still display `"High Error Rate"` in the name field.

- Recommendation: Add `useEffect(() => { form.reset(computedDefaults); }, [open])` inside `AlertRuleFormDialog`, or use the `key` prop on the dialog (`key={editingRule?.id ?? "create"}`) to force a clean remount when the target changes.

---

**[HIGH] Escalation-policies test block is nearly vacuous — 3 of 5 tests never exercise the component**

The `describe("Escalation Policies tab")` block contains:
1. A tab-trigger existence check (renders but never clicks to the tab — the tab content is therefore never visible).
2. `"has correct mock data available"` — asserts directly on the mock function, not on the rendered DOM. Passes trivially even if `EscalationPoliciesTab` is broken.
3. `"verifies escalation policy delete mutation works"` — calls `mockDeletePolicy({ id: 1 })` directly in test body without rendering the component at all. This is not a component test; it is a mock-assertion exercise.

The spec requires: rendering the policy table, column assertions, add-policy dialog, edit pre-fill, and delete confirmation. None of these are exercised for the escalation tab.

- Recommendation: Add tests that click the `Escalation Policies` tab trigger, wait for the table to render, then interact with add/edit/delete flows.

---

**[MEDIUM] Missing plan-required tests for `NotificationPreferencesPanel`**

The spec (section 1.1) lists 11 required tests. The following are absent:

- `"shows error toast when upsertPreference mutation fails"` — the mock always calls `onSettled` with success; no test exercises the `onError` path that calls `toast.error`.
- `"disables toggles while a mutation is in-flight"` — the mock sets `isPending: false` unconditionally; no test verifies the `disabled={isMutating}` branch.

Both of these cover non-trivial code paths: the optimistic rollback in `onError` and the per-category disabling logic.

- Recommendation: Add a mock variant that triggers the `onError` callback, assert `toast.error` is called and the previous cache state is restored. Add a separate mock with `isPending: true`, assert the switch is `disabled`.

---

**[MEDIUM] Missing plan-required tests for `AdminAlertRules`**

The spec (section 1.2) lists the following tests that are absent or inadequate:

- `"opens edit dialog pre-filled with existing rule data on row edit click"` — no test clicks an edit button and asserts form field values are pre-populated.
- `"calls createRule mutation on form submit with valid data"` — create-form submission is not tested (the dialog is opened but no form values are filled and no submit is triggered).
- `"shows validation error when required fields are empty"` — no test asserts error messages when submitting a blank form.
- `"create form operator dropdown only shows allowlisted values"` — the test at line 852 asserts only that the `[data-testid="operator-select"]` element exists. It never opens the dropdown and does not assert that exactly 5 options appear (and no others). This is not meaningful coverage for S7.

- Recommendation: Fill in missing test cases; for the operator dropdown test, open the select and assert the rendered option labels match exactly `["> (gt)", "< (lt)", ">= (gte)", "<= (lte)", "= (eq)"]`.

---

**[MEDIUM] `form.watch("channels")` called inside `CHANNELS.map()` — renders-per-key performance issue**

In `AlertRuleFormDialog` (and the equivalent in `EscalationPolicyFormDialog`), the channels checkbox renders call `form.watch("channels")` inside the `.map()` callback (lines 1446, 1918). `form.watch` registers a subscription each time it is called. Because it is called inside a loop iteration rather than once before the map, React Hook Form will create one subscription per channel per render, which compounds with rerenders. Identical issue in the escalation form.

- Recommendation: Hoist the `watch` call above the `map`:
  ```ts
  const channelValues = form.watch("channels") ?? [];
  {CHANNELS.map((ch) => { /* use channelValues */ })}
  ```
  (The diff shows this at line 1446 inside the map lambda, not hoisted outside it.)

---

**[MEDIUM] `Settings.tsx` tab is inserted at the wrong position**

The spec (section 2.2) states: "Insert the notifications tab after 'preferences' and before 'automation'." The diff adds `{ id: 'notifications', label: 'Notifications', icon: Bell }` after `preferences` and before `automation` in the tabs array at line 2089 — this is correct. However, the `TabsContent` is rendered at line 2098 between the "Automation" conditional and "Personas" conditional, not immediately after the Preferences content block. This does not affect functionality but breaks the logical ordering of tab content sections, making the code harder to maintain.

- Recommendation: Place the `{activeTab === 'notifications' && <NotificationPreferencesPanel />}` block immediately after the Preferences content block, mirroring the sidebar tab order.

---

**[MEDIUM] Scope creep — `runEngine.ts` and `runEngine.bridgeRemoval.test.ts` bundled into section-07**

The diff includes modifications to `apps/web/server/services/runEngine.ts` (token usage field renames: `turnResponse.tokenUsage.inputTokens` → `turnResponse.inputTokens`) and a new `runEngine.bridgeRemoval.test.ts` file. These changes are unrelated to Phase 5 frontend settings. If these changes are needed for section-07 to work (e.g., a runtime dependency), that dependency is not documented. If they are from a different spec or section, they should be extracted to their own PR.

- Recommendation: Move `runEngine.ts` and `runEngine.bridgeRemoval.test.ts` changes to the appropriate section or ticket. If they are load-bearing prerequisites, document the dependency explicitly.

---

**[LOW] `useForm` `defaultValues` uses `""` (empty string) for `targetUserId` — type mismatch**

Both dialogs initialize `targetUserId: ""` (line 1297, 1798) rather than `undefined`. The Zod schema declares `targetUserId: z.coerce.number().int().optional().or(z.literal(""))`, so the `z.literal("")` branch is intentionally present. However, when the form is submitted with an empty string, `z.coerce.number()` on `""` produces `NaN`, which will fail `z.number().int()`. The `or(z.literal(""))` prevents a validation error, but the caller then applies `typeof data.targetUserId === "number"` to strip it — passing `""` through to the check, where `""` fails `typeof === "number"` and becomes `undefined`. This works by accident. A more explicit schema would be `z.union([z.number().int().positive(), z.literal("")]).optional()` with the post-submit coercion kept.

- Recommendation: Use `targetUserId: undefined` as the default value and remove the `z.literal("")` branch; accept that the number input will present an empty field via `placeholder`. This removes the accidental-correctness dependency.

---

**[LOW] `handleToggle` sends only one field to `upsertPreference` — partial update risk**

`handleToggle` calls `upsertMutation.mutate({ category, [field]: value })` with only the changed field. This relies on the backend's `upsertPreference` performing a partial column update (SQL `ON CONFLICT DO UPDATE SET ... [field] = EXCLUDED.[field]`). If the backend implementation replaces all fields (i.e., re-inserts the full row with defaults for omitted fields), toggling email ON would also reset telegram and inApp to their server-side defaults, silently discarding local state. The optimistic update correctly merges the partial payload over the existing cache entry, which would mask this data loss until the invalidation completes.

- Recommendation: Verify the section-05 `upsertPreference` backend implementation uses a partial-field update, not a full row replace. If it is a full replace, the frontend must read the current preference row and spread it before mutating.

---

**[LOW] `formatMutedUntil` uses `toLocaleString()` without locale or timezone arguments**

`formatMutedUntil` at line 335 calls `new Date(mutedUntil).toLocaleString()`. In a multi-locale (Thai/English) product, `toLocaleString()` with no arguments renders the browser's default locale, producing inconsistent date formats. Given the codebase has a locale-toggle component, this will show Thai date formats to Thai-locale users even in the English UI, and vice versa.

- Recommendation: Pass an explicit locale and timezone: `d.toLocaleString("en-GB", { timeZone: "Asia/Bangkok" })` or, preferably, use the app's active locale from the i18n context.

---

**[LOW] No i18n — all UI strings are hardcoded English**

The spec (section 5) lists 30+ required i18n keys and explicitly notes that if section-13 has not added them, this section should add them as part of development. The implementation uses hardcoded English strings throughout both components (`"Notification Preferences"`, `"System Health"`, `"Mute"`, `"Unmute"`, etc.) and does not call `t(...)` anywhere. This is marked LOW because the spec says section-13 is authoritative, but the fallback instruction ("use English strings as placeholder values") means `t("notifications.preferences.title")` with a hard-coded `en.ts` value would have the same visual output while being i18n-ready.

- Recommendation: Add i18n key calls with the English strings as values in `locales/en.ts` and `locales/th.ts`. At minimum, category labels should be localised as `t(\`notifications.category.${category}\`)` rather than the static `CATEGORY_META` map, which cannot be translated without code changes.

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| S7 — Operator dropdown only shows allowlisted values (gt/lt/gte/lte/eq) | PASS | `OPERATORS` const tuple → `z.enum(OPERATORS)` → Radix Select renders only those 5 items. No free-text path exists. |
| S7 — No operator free-text input | PASS | `SelectTrigger` / `SelectContent` pattern; no `Input type="text"` for operator field. |
| tRPC router names match section-05 contract | PASS | `trpc.notificationPreferences.getPreferences`, `upsertPreference`, `snoozeCategory`, `trpc.alertRules.listRules`, `createRule`, `updateRule`, `deleteRule`, `listEscalationPolicies`, `createEscalationPolicy`, `updateEscalationPolicy`, `deleteEscalationPolicy` — all match section-05 registrations. |
| `RequireAdmin` guard on `/admin/alert-rules` route | PASS | `<RequireAdmin><AdminAlertRules /></RequireAdmin>` in `App.tsx`. |
| Optimistic updates with rollback on error | PASS | `onMutate` caches previous data, `onError` restores it, `onSettled` invalidates. |
| Aria-labels on all Switch toggles | PASS | All Switch elements in `NotificationPreferencesPanel` have `aria-label="Enable {channel} notifications for {label}"`. Alert rule and policy toggles have `aria-label="Toggle {name}"`. |
| Feature flag gate (`NOTIFICATION_PREFERENCES_ENABLED`) | FAIL | Not implemented in the component. |
| i18n key usage | FAIL | All strings hardcoded; no `t(...)` calls. |
| Form reset between dialog open/close cycles | FAIL | `useForm` defaults are fixed at mount; reopening with different data shows stale values. |
| Escalation policies tab: meaningful test coverage | FAIL | 3 of 5 tests do not render the component at all. |

---

### Verdict: APPROVE_WITH_FIXES

Two HIGH findings must be resolved before merge: the missing feature flag gate and the stale-form-state bug in the create dialog. The escalation-policies test block is superficially present but does not exercise the component, which is a HIGH test-quality failure. The MEDIUM findings (missing required tests, `form.watch` inside loop, Settings tab ordering) should be addressed in the same PR. The LOW findings may be deferred to section-13 cleanup where i18n is formally owned.
