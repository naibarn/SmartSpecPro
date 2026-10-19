<!-- PROJECT_CONFIG
runtime: typescript-pnpm-python
test_command: pnpm --filter @smartspec/web exec vitest run server/__tests__/auth-cookies.test.ts
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-cookie-session
section-02-origin-transport
section-03-config-authority
section-04-provision-release
section-05-acceptance
END_MANIFEST -->

# Execution order

01 is independently useful; its bounded Worker-cookie fix is already integrated. 02 and 03 can develop independently with explicit ownership. 04 requires the integrated contracts from 02/03 plus actual external IAM/origin release authority. 05 unit/fixture preparation can start earlier; live acceptance requires 04. No subagents are required by this plan.

Keep progress and confirmed SHAs in the existing parent HANDOFF; this index is a section graph, not a second status ledger. Remain on latest canonical source for each slice. Completed code/CI does not authorize provider writes or certify production readiness.
