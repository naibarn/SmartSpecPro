# Feature 146 synthesized specification

SmartAIHub must expose one secure MCP endpoint that supports modern MCP
2026-07-28-style stateless requests while retaining the existing legacy
sessionful behavior for compatible clients. The endpoint must provide truthful
discovery, tools, documentation resources, scoped media/file tools, and Hermes
Remotion operations without duplicating existing job, credit, worker, storage,
or device authorities.

## Required outcomes

1. `/v1/mcp` distinguishes modern and legacy protocol eras before execution.
2. Modern requests are horizontally routable and do not require a Redis session.
3. Legacy initialize/session/list/call behavior remains compatible and isolated.
4. Discovery, catalog, tools, and resources agree on one capability snapshot.
5. The registry supports canonical names plus safe aliases, schemas, annotations,
   cache policy, scopes, idempotency metadata, and sanitized results/errors.
6. Documentation resources are allowlisted; user file/media access remains
   owner/tenant ACL checked through existing tools and download brokers.
7. Auth supports bearer/API-key/pairing lineages, device revoke, scope checks,
   origin/host protections, OAuth metadata only when configured, and no leakage.
8. Existing media, Remotion, Worker App, credits, uploads, history, and durable
   idempotency contracts remain authoritative.
9. Audit, trace, rate, quota, retry, timeout, concurrency, failure, and rollout
   behavior are observable and bounded.
10. Automated evidence is complete before tenant enablement; native Windows 11
    and macOS evidence remains a separate mandatory release gate.

## Non-goals

- Replacing Worker App or Feature 145's executor protocol.
- Building a new job/credit/storage database authority.
- Arbitrary filesystem MCP resources or public pre-signed URLs.
- Enabling Dynamic Client Registration or inbound OAuth without a real issuer,
  token validation, audience, and scope configuration.
- Implementing Tasks, subscriptions, prompts, MCP Apps, or requestState/MRTR in
  the first compatibility release.

## Acceptance boundary

Implementation is complete only when section tests pass, cross-section contracts
are verified, current baseline MCP security failures are resolved or explicitly
owned with a safe disposition, and the evidence identifies which native gates
still require physical Windows/macOS machines.
