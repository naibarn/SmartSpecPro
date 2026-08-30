# Admin Feedback Hub Entry Design

## Goal

Make the existing `/admin/feedback-hub` page easy to reach from the floating
Feedback button while keeping the entry visible only to users whose role is
exactly `admin`.

## Current context

- The Feedback Hub page and route already exist at `/admin/feedback-hub`.
- The client route is wrapped by `RequireAdmin`, which accepts only
  `user.role === "admin"`.
- The Feedback tRPC list/detail/mutation procedures use `adminProcedure`, so
  direct URL access and API access remain protected independently of the new
  menu entry.
- The floating Feedback button is rendered globally and already has a link to
  `/my-feedback`.

## Chosen approach

Add a second link in the existing Feedback dialog, labelled for administration,
guarded by the authenticated user's exact role:

```ts
user?.role === "admin"
```

The link navigates to `/admin/feedback-hub` and closes the dialog. No new route,
API procedure, schema, migration, or permission abstraction is needed.

### Alternatives considered

1. Add a new item to the main admin sidebar: more discoverable for admins, but
   requires finding and maintaining another navigation surface and is outside
   the requested lightweight entry point.
2. Show the link to `domain_admin` or `system_agent`: rejected because the
   request says Admin only and the existing Feedback Hub route is exact-admin
   on the client.
3. Add a dedicated admin endpoint or duplicate page: rejected because the
   current route and backend contract already provide the required page.

## Behavior and security

- Admin sees the Feedback Hub link inside the floating Feedback dialog.
- Non-admin authenticated users do not receive the link in the rendered UI.
- Unauthenticated users do not receive the link.
- A non-admin who manually requests `/admin/feedback-hub` is redirected by the
  existing route guard; the server-side `adminProcedure` remains the final
  authorization boundary.

## Failure handling

No new network request is introduced. If auth is still loading, the existing
Feedback button behavior remains unchanged; the admin-only link appears only
after the authenticated user is known to be an exact admin.

## Validation

- Add focused component tests for admin visibility and non-admin invisibility.
- Run the focused FeedbackButton test file with the repository's web workspace
  test command.
- Run `git diff --check` and inspect the final diff for unrelated changes.
