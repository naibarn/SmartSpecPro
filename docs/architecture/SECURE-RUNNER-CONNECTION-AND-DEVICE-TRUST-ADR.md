# ADR — Secure Runner Connection and Device Trust

**Date:** 2026-11-02
**Status:** Proposed R1.5 device-security ADR. Repository and supplied R1.4 ZIP searches found no earlier canonical file with this name or V3 revision; this is the first checked-in ADR at this path.
**Scope:** New Modular SaaS device Core Connector and on-demand Windows/Linux Executor.
**Related owners:** SPEC-208 Computer Use, SPEC-224 autonomous development, SPEC-318 durable execution and SPEC-325 security architecture.

## Decision

Treat a remote Runner as a high-risk endpoint and effect boundary. Protect transport, device identity, messages, local permissions, update integrity and business effects independently. A connected device is not a user session, tenant administrator or unrestricted executor.

A minimal OS service starts at boot after explicit install/enrollment and reconnects without a user click while its grant remains valid. It runs no model, browser or general Executor at idle. A workload-specific Executor starts only for a server-authorized lease.

## Connection and identity

1. Install registers a Windows Service or Linux systemd unit under a dedicated least-privilege identity. Service boot startup is distinct from starting the Companion UI at user login.
2. Pairing occurs once in an authenticated user flow. A one-use pairing ID expires within five minutes, binds the verified user/tenant and requested capability, and requires device proof of possession of a new key.
3. Keep the private key in TPM/OS-protected storage where available. Without hardware-backed keys, use restricted OS key storage and label the lower assurance. Never export it or silently reuse a Legacy Runner key.
4. Authenticate server TLS and sign device requests binding device, tenant, environment, audience, nonce/counter, policy epoch, grant, message type and expiry. Optional Access mTLS is defense in depth only.
5. Issue short-lived device sessions after fresh proof and current revocation checks. Key rotation is an authenticated rebind; revoke increments the policy epoch. A wiped, cloned or revoked device cannot silently re-pair.
6. Use WSS presence with heartbeat, bounded exponential reconnect with jitter, proof renewal, replay prevention and cursor replay. The service reconnects after boot, sleep/wake, service restart, network, IP or DNS changes without UI.
7. A signed job offer binds job, attempt, lease, Goal, tenant, device, capabilities, effect digest and deadline. Device ack is idempotent. Both sides verify lease fencing and current policy before dispatch and effect.
8. The device never receives tenant BYOK or personal browser cookies. Receipts are signed and reconcile to canonical job authority.

## WebSocket and Access constraints

Current Cloudflare Worker docs state Worker-level Access policies reject WebSocket upgrades with 403. Where Access protects WSS, use a hostname-based Access application. Access context is invocation-scoped and is not automatically forwarded through Service Bindings. The application gateway validates device signatures and downstream services verify scoped signed assertions independently. Cloudflare Access mTLS has account-plan constraints and remains optional.

## Connection sequence and transport fallback

1. Owner-authenticated enrollment creates a one-use pairing challenge; device generates and retains its own private key and confirms the verified tenant and requested capability.
2. The boot service opens outbound WSS over TLS 1.3, validates the server hostname and certificate chain, answers a fresh server nonce with device-key proof-of-possession and receives a short-lived audience-bound device session.
3. Gateway checks current enrollment, tenant/environment binding, policy epoch, grant and device posture. It offers a signed, canonical job envelope bound to job, attempt, lease, workspace, effect digest, timebox and capability.
4. Connector verifies signature, nonce, lease fencing and local policy before acknowledging. A separate low-privilege Executor runs only the scoped task. No unsigned follow-on command is accepted.
5. Connector returns a signed/redacted receipt and cursor. The server reconciles it with canonical job authority before settlement or retry. Session renewal repeats proof and revoke checks; revoke blocks renewal and the next effect.

Primary transport is device-initiated WSS with heartbeat/backpressure and bounded reconnect. HTTPS polling is an outage fallback with identical device proof and replay controls. No public inbound device port is opened. A Cloudflare Tunnel may route one specific private workload, but does not replace device identity, job signatures or per-effect authorization. Service Tokens may be used only as bounded bootstrap/perimeter controls, never as a permanent shared fleet credential. Optional application-layer E2EE for sensitive payloads must bind tenant/device/job/sequence and use reviewed primitives; the Gateway cannot inspect opaque payload while also claiming server-side payload authorization. TLS protects the hop to Cloudflare Edge and does not promise Edge-blind confidentiality.

## OS and interactive-session boundary

- Windows: Service Control Manager auto-start/recovery under a noninteractive least-privilege identity. Session 0 service cannot draw UI, unlock desktop or impersonate the user. Companion runs in that user's desktop session.
- Linux: restricted systemd service starts at boot. Companion runs in the user session; GUI work needs an available supported session.
- Headless tasks run before login only if that exact grant and local policy allow them. GUI/browser-profile tasks wait when no valid interactive session exists.
- Pause, disable, unpair and remote revoke are distinct. Auto-renew extends an existing valid device identity; it never performs first-time pairing.

## Signed envelope and failure behavior

The common versioned envelope binds protocolVersion, messageId/type, issuer, subject/device, audience, environment, tenant, Goal/job/attempt/lease, grantId, policyEpoch, nonce/counter, issuedAt/expiresAt, capability list, effectDigest, key thumbprint and signature. SPEC-325 defines the message contracts. Reject unknown versions, invalid signature, wrong tenant/audience, stale epoch, expired window, replay, wrong digest, stale lease and unsupported client.

Connectivity loss reports OFFLINE and preserves durable server job state. A job without an eligible executor waits; it is not forged as complete or running in Cloud. Reconnect reconciles canonical job state before resume. Revocation blocks the next action and fences active work; uncertain external effects are reconciled before retry.

## Future acceptance

Test boot before user login, closed UI, sleep/wake, network change, service crash/recovery, stale/replayed signature, stolen bearer, cloned device, cross-tenant reuse, epoch revoke, locked screen, invalid TLS, signed update failure, wrong user session, no cookie access and no duplicate settlement. These tests are specified only and have not been run.

## Official references checked 2026-11-02

- [Windows automatically starting services](https://learn.microsoft.com/en-us/windows/win32/services/automatically-starting-services)
- [Windows Interactive Services / Session 0](https://learn.microsoft.com/en-us/windows/desktop/Services/interactive-services)
- [Windows service recovery guidance](https://learn.microsoft.com/en-us/windows/win32/rstmgr/guidelines-for-services)
- [Durable Object WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Cloudflare Access Worker WebSocket limitation](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Cloudflare Access mTLS Service Auth](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/mutual-tls-authentication/)
- [Cloudflare Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)

This ADR is subordinate to SPEC-325, SPEC-208 and SPEC-224 for security, Computer Use and autonomous-development authority. It does not provision a tunnel, certificate, device or service.
