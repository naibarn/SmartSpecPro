# ADR — Build the new SmartSIHub using the existing SmartAIHub Autonomous Platform

**Status:** proposed, binding owner direction | **Date:** 2026-11-01 | **SPEC:** 312, 317, 324.

## Decision

Use the actual authenticated `smartaihub.app` Autonomous Implements and Autonomous Mini App Creator as the exclusive normal development **control entry point**. Existing SPEC-224 jobs, Runner and executable Debian harnesses perform all steps. Target artifacts go to isolated new-platform workspace on Debian (`aimarkethubs.com`); new production is `smartsihub.com` on Cloudflare. The Core is written new and only the App/Core identity and ledger contract continues from `smartspec`. `smartaihub.app` is kept functional until the new Autonomous Implements is proven and selectively handed development authority.

## Why

- The migration itself becomes real end-to-end acceptance for old autonomy, Runner, workspace, job, credit, build/deploy and UAT.
- Avoids replacing an already owned orchestrator with ad hoc Codex sessions, cron wrappers or a second job ledger.
- Core can be built and tested without the new tool needing to exist first; no circular dependency.
- Users can report real defects as child tasks and observe progress and previews in the same interface.

## Distinct authorities

1. **Current orchestration**: old SPEC-224; the development Goal's active master until explicit transfer. It never claims Core product ownership just because it builds it.
2. **New app/runtime**: modular Hono Core, Chat, Creator; separate source and release authority. May execute test/sandbox Runs but cannot race the old owner on the same real Goal.
3. **New autonomous orchestration**: implements existing contracts and ultimately takes over only selected Goal scopes by recorded state transition with fencing/drain and rollback.
4. **Provider/release/security**: existing credentials, financial contracts, job/approval authorities remain where assigned by canonical specs; this ADR introduces none.

## Exit strategy

Retain the old entry point for users and rollback while selected autonomous Goals are observed on the new platform; migrate Goal creation to the new UI once it proves real task completion, fault recovery, deterministic selected deployment and consistent user/credit rights. Retiring a Legacy UI or module is independent from enabling a new Core or Chat beta.

## Emergency escape hatch

If old UI/login/Runner is inaccessible, a narrowly scoped direct Debian fix through existing authorized credentials is permitted to restore the command path. It must be documented and retro-linked to canonical task/source/deploy evidence. This is not an alternative permanent development workflow.
