# Feature 147 self-review 1

## Findings

1. **Metadata-only false readiness:** Feature 146 can advertise PRM only with verifier configuration, but the new zero-config goal requires an actual authorization server and token issuer. Resolution: separate AS/PRM flags and require discovery, signing keys, token, login, consent, revoke, migration, and health readiness before advertising.
2. **Claude compatibility risk:** Current Anthropic remote MCP documentation requires DCR and documents a hosted callback. Resolution: DCR is a first-class implementation unit and Claude live proof is a hard gate.
3. **Codex behavior uncertainty:** Server code cannot guarantee how every Codex release handles DCR/CIMD/callbacks. Resolution: Codex has a separate live matrix and cannot be marked PASS from server tests or generic Codex login evidence.
4. **Token-class confusion:** Existing device and pairing flows use HS256/internal semantics. Resolution: public MCP OAuth uses asymmetric signing and JWKS; pairing remains a separate fallback.
5. **Tenant confusion at browser consent:** A browser account may access multiple tenants. Resolution: consent explicitly selects/binds a tenant and token claims are authoritative; client headers never select tenant.
6. **Redirect/registration abuse:** Open DCR would become an open redirect/client impersonation surface. Resolution: exact redirects, PKCE, hosted HTTPS/loopback policy, bounded metadata, CIMD/DCR SSRF controls, rate limits, and client identity on consent.
7. **Refresh replay:** Long-lived refresh tokens create a takeover path. Resolution: opaque hashed refresh families, atomic rotation, reuse detection, family revoke, device/grant binding, and audit alert.
8. **ACL widening:** OAuth authentication could accidentally expose all tools/files. Resolution: registry scope filtering plus service-level current tenant/object ACL checks remain mandatory.
9. **Revocation delay:** JWT access tokens are stateless. Resolution: short access TTL plus durable grant/device/JTI revocation checks and explicit documented propagation bound.
10. **User control-plane leakage:** Existing settings must not become a cross-user device browser. Resolution: reuse owner-scoped connected-device query/revoke contract and add ownership tests.

## Review decision

The plan is internally consistent with Features 145/146 and is implementation-ready only after Wave 0 confirms issuer/key ownership and live client test accounts. No production OAuth flag should be enabled before G0–G6 and the applicable client gate pass.
