# Section 05: Tests, Observability, and Browser Proof

## Objective

Prove the complete flow and make failures diagnosable without exposing private
creative content.

## Owned paths

- focused tests adjacent to shared/service/router/UI modules
- Playwright spec under the existing web browser-test location
- telemetry additions in prompt expansion service/executor boundary only

## Implementation contract

Add unit tests for schema/parser/quality, service/router integration tests for
skill preflight/strict routing/retry/credit/persistence/CAS, component tests for
the state matrix, and Playwright tests for success/failure/stale/edit/apply
flows. Use
representative Thai and English fixtures, including 2,000-character boundary
cases and long unbroken text.

Telemetry fields may include trace/run ID, skill slug/version/hash, execution
mode, provider/model/request ID, model family,
attempt number, parser result, quality outcome, final status, latency, and
bounded error code. Include an explicit real-run/mock marker and fail closed if
the successful result lacks evidence. Never log raw prompt, raw model response,
private source content, or secrets. Tests must assert no sensitive content enters
telemetry.

Add one separately labelled non-mocked integration smoke command/test using a
configured test provider. It must verify the resolved skill is `llm-only`, the
provider receives the request, a provider/request ID and model are returned,
the response is not a fixture/mock, and the v2 schema/quality gate passes.

Run focused commands through the web workspace, with jsdom for browser-facing
Vitest. Run `git diff --check` and changed-file diagnostics. Full repository
typecheck and deployment/live-provider proof are separate and must be reported
as such.

## TDD stubs

Mirror all stubs from `claude-plan-tdd.md`. Add browser checks at 390x844,
768x1024, and 1440x900, keyboard-only operation, no page overflow, visible
retry/cancel/error labels, and successful treatment/Draft distinction.

## Completion gate

Focused suites pass, browser evidence covers all required transitions and
breakpoints, telemetry is privacy-safe, and any baseline-wide failures are
isolated rather than conflated with this feature's proof.
