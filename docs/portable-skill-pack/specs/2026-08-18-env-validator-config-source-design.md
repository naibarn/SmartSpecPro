# Source-Aware Environment Validator

## Problem

The deploy environment validator currently treats every assignment in the first
`.env.example` it finds as a required production environment variable. In
SmartSpecPro this produces false blockers because the repository is a
multi-service application and configuration can be sourced from:

- a service-specific environment file needed before database access;
- encrypted settings managed through the Admin UI and database;
- safe runtime defaults;
- machine-local runtime discovery or overrides; or
- deprecated compatibility variables.

Running the validator at the repository root therefore inspects the wrong
`.env` file and labels optional settings and non-secret runtime overrides as
missing production secrets.

## Decision

Add an optional `.env-validator.json` manifest. When present, the validator uses
the manifest instead of inferring requirements from `.env.example`.

The manifest defines independent service targets. Each target declares its own
environment files and explicit required variables. A requirement may define a
minimum length, an exact value, forbidden values, or forbidden credential
prefixes. Optional checks validate a value only when it is configured. Variables managed outside
the process environment are classified separately as `managed`, `defaulted`,
`machine_local`, or `deprecated`; they are reported as policy metadata and do
not block environment readiness.

Repositories without a manifest retain the existing heuristic behavior for
backward compatibility, but the output identifies that mode as heuristic.

## SmartSpecPro Policy

The SmartSpecPro manifest validates only bootstrap configuration that must be
available before the application can read or decrypt UI-managed settings:

- Web: `DATABASE_URL`, `JWT_SECRET`, and `LLM_ENCRYPTION_KEY`.
- Python backend: `DATABASE_URL`, `SECRET_KEY`, `JWT_SECRET`,
  `ENCRYPTION_MASTER_KEY`, `ENVIRONMENT=production`, `DEBUG=false`, and a
  non-debug `LOG_LEVEL`.

Optional Python Stripe credentials are checked when configured so test-mode
credentials cannot pass a production preflight.

UI/DB-backed infrastructure, MCP, Vector DB, and desktop-release settings are
not treated as environment requirements. Provider-level environment keys remain
optional compatibility inputs because provider availability is feature-dependent
and the primary web routing path uses encrypted provider records. HyperFrames
paths and timeouts are machine-local or defaulted. Marketplace extension token
TTL is defaulted, while extension authorization is enforced by pairing, bearer
scope, origin binding, and device binding.

The validator does not connect to the application database or expose secret
values. UI/database readiness remains the responsibility of application
readiness and smoke checks.

## Failure Handling

- Missing or invalid manifest fields fail closed with a validator error.
- Missing target environment files produce a target-scoped critical finding.
- Findings expose variable names and policy failures only, never values.
- `deploy_ready` is true only when every manifest target passes.
- The CLI continues to emit JSON so existing deploy-skill consumers remain
  compatible.

## Verification

Use Node's built-in test runner with temporary fixture directories. Tests cover:

1. legacy heuristic behavior when no manifest exists;
2. manifest targets reading separate service environment files;
3. managed/defaulted/machine-local variables not becoming blockers;
4. missing, short, forbidden, and unexpected-value failures;
5. SmartSpecPro's former 18-finding root scenario no longer producing those
   false blockers while real bootstrap gaps remain visible.

## Trade-offs

The manifest adds one explicit policy file that must be maintained when a new
bootstrap variable is introduced. This is preferable to comment parsing or
SmartSpecPro-specific hard-coded exceptions because the policy is reviewable,
testable, and reusable by other multi-service repositories.
