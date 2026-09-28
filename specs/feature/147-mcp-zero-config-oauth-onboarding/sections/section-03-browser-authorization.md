# Section 03 — Browser authorization and consent

## Objective

Let a client open SmartAIHub in the browser, reuse the existing login, display a clear consent page, and return a one-time authorization code without copy/paste.

## Ownership

- new `/oauth/authorize` route/service
- existing login continuation helpers
- real consent page, locales, accessibility/browser tests

## Flow

Validate client, redirect, response type, resource, scopes, state, and PKCE before creating a short-lived server-side transaction. If not logged in, redirect through existing login using a signed/bound continuation. If the user has multiple tenants, require explicit tenant selection and bind it to the transaction. Show client/origin, scopes, tenant, lifetime, and risk-sensitive operations. Approve only requested/allowed scopes; deny redirects only to the validated registered callback.

## Security acceptance

- login CSRF, OAuth state, PKCE, and exact redirect tests pass;
- wrong user/tenant/client cannot complete a transaction;
- code expires, is one-time, and cannot be replayed or exchanged for another resource;
- consent never displays token material;
- UI covers loading, denial, expiry, revoked, inaccessible, and backend errors;
- browser approval/revoke actions enforce trusted origin and CSRF policy.
