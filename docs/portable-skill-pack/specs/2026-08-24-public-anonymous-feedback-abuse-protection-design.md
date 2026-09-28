# SmartAIHub Public Anonymous Feedback Abuse Protection

## Goal

Allow visitors who have not signed up or signed in to send public contact
messages while applying production-grade anti-abuse controls only to that
anonymous path. Authenticated feedback keeps its existing behavior.

## Design

Anonymous submissions pass through these server-authoritative layers before a
feedback ticket is created:

1. Cloudflare Turnstile token validation through the Siteverify API. The server
   validates the `public_contact` action and an allow-listed hostname. Missing
   production configuration, invalid tokens, expired tokens, and provider
   failures fail closed.
2. Redis distributed sliding-window limits keyed by a hash of the client IP and
   a hash of the normalized email address. Redis failure also fails closed.
3. A Redis single-use fingerprint key prevents replay of the same normalized
   email, subject, and message combination.
4. A server-side honeypot, minimum form dwell time, payload size limits, and
   conservative content checks reject obvious automation without trying to
   classify legitimate business messages with an opaque model.

The server derives whether the caller is anonymous from the authenticated
request context. Client-provided flags are never trusted for bypass decisions.
Authenticated callers bypass the anonymous Turnstile and anonymous abuse
guard, but remain subject to the existing authenticated feedback controls.

## Configuration

Production requires the following Turnstile values, which can now be entered
through Admin Settings → Contact Protection:

- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `TURNSTILE_ALLOWED_HOSTNAMES` (comma-separated hostnames)

The UI explains how to create a Turnstile widget in Cloudflare, which
hostnames to add, and why the Secret Key is never shown after saving. Values
entered through the UI are stored in `system_settings`; the secret is encrypted
with the application's existing `LLM_ENCRYPTION_KEY`. The existing environment
variables remain supported as a deployment fallback for backward compatibility.
Redis cache configuration remains an infrastructure dependency already used by
the application and is not moved into browser-facing settings.

The public config query exposes only the site key and whether the widget is
usable. It never exposes the secret. Admin Settings exposes only a masked
configured state for the secret and source indicators (database/environment).
Development and test environments may run without Turnstile so local tests
remain deterministic; production never does.

## Failure and privacy behavior

Rejected anonymous requests do not create feedback tickets or Admin
notifications. Rate-limit and replay keys use one-way hashes; raw IP addresses
are not persisted by this feature. The client receives only a generic rejection
message; the server keeps the detailed reason internal.

## Verification

Tests cover valid and invalid Turnstile responses, hostname/action checks,
Redis failure, honeypot and dwell-time rejection, rate limits, replay
suppression, authenticated bypass, and the existing public contact ticket
mapping. The production build and a local route smoke test pass without
creating a ticket. Browser rendering of the external Turnstile widget remains
an environment-dependent check because the local Vite dev process had an
unrelated source-transform failure; no real production submission was made.
