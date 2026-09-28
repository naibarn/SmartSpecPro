# Hard Cutover TDD Plan

Each section follows red-test, implementation, focused-test, completeness
review, and integration-test steps. Tests use Vitest for web and pytest for the
Python bridge. Repository-wide typecheck is intentionally omitted.

## Section 01

- gateway rejects unregistered job type and client adapter
- gateway passes server tenant/actor and creates exactly one canonical job
- duplicate definition returns same ID; changed definition conflicts
- registry resolves handler and rejects unsupported version

## Section 02

- publisher drains a bounded batch
- one poison row is quarantined without blocking another row
- publish is not attempted without a committed outbox row
- runner stop prevents new claims and permits current publication settlement

## Section 03

- generic wrapper claims once under duplicate delivery
- unsupported version rejects before claim
- handler success/failure reports with complete lease context
- stale completion is fenced and cancellation wins

## Section 04

- each migrated producer writes a canonical job before transport observation
- legacy handler receives a canonical correlation reference
- duplicate delivery does not repeat the domain operation
- manifest and inventory report the wave as active only when flag is enabled

## Section 05

- Python gateway sends server-derived context and canonical ID
- thin Celery task does not increment business attempt on broker retry
- duplicate Celery delivery converges on the same attempt
- unsupported contract is safely rejected

## Section 06

- inventory allowlist excludes only adapter-owned calls
- migrated direct calls fail structural audit
- manifest counts match findings
- verification output clearly separates local proof from external Cloudflare proof
