# Feature 199 implementation evidence

## Section status

- section-01-contracts-and-persistence: implemented provider-neutral schema/grant/execution contracts mapped to the existing MCP persistence boundary.
- section-02-discovery-auth-and-quarantine: implemented schema canonicalization, risk classification and grant-state checks; remote discovery/OAuth lifecycle remains an integration gate.
- section-03-policy-and-execution: implemented effect-time grant/approval checks and durable Job-definition construction; no direct upstream call is exposed.
- section-04-api-and-observability: existing MCP APIs remain authoritative; new management/activity projection wiring requires endpoint-specific integration evidence.
- section-05-ui: existing MCP settings/admin surfaces remain the management entry points, and the inline Task Control tab in the global `AI Chat & Feedback` surface shows user-scoped MCP connection readiness without opening a new URL. The catalog/quarantine workflow still needs browser/provider evidence.
- section-06-migration-tests-and-acceptance: no migration added because existing MCP tables were not proven insufficient; release requirements are documented.

## Evidence

Focused MCP governance suite: 3 tests passed. Credential-like fields are
rejected from schemas/arguments and high-risk calls require command approval.

Focused UI evidence: the inline Task Control tab renders connected MCP account
state, degraded/error state, and the Settings access destination without
exposing credentials. Browser smoke passes at 390×844, 768×1024 and 1440×900
for the user-scoped MCP projection; admin catalog/quarantine, live upstream
discovery/OAuth and revoke flows still require their environment integration
evidence. The single `AI Chat & Feedback` dialog embeds the same Task Control
Center, so MCP status is not duplicated in a separate feedback execution path.

## 2026-09-18 implementation audit corrections

- MCP execution requests now normalize bounded identifiers, require a plain
  arguments object and reject malformed grant expiry values before creating a
  canonical Job definition.
- Effect-time grant/revision/approval checks remain mandatory; remote
  discovery/OAuth, endpoint observability and catalog UI integration are still
  release gates.
