<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web exec vitest run <targeted-files>
END_PROJECT_CONFIG -->
<!-- SECTION_MANIFEST
section-01-target-inventory
section-02-backup-restore
section-03-writer-fence-snapshots
section-04-state-reconciliation
section-05-keyring-security-validation
section-06-reopen-spec245-crosswalk
END_MANIFEST -->

# Implementation Sections Index

This plan is an evidence-gated Production recovery design, not authorization to make external changes. Keep the service mask in place until the system owner approves the reopen gate.

| Order | Section | Depends on | Main outcome |
|---:|---|---|---|
| 01 | Target inventory | — | Verified Production target, all instances/origins/writers, owners and stop list. |
| 02 | Backup and restore | 01 | Approved encrypted backup with an isolated, schema-verified restore proof. |
| 03 | Writer fence and snapshots | 01, 02 | Approved maintenance fence plus fresh per-family auth snapshots and dry-runs. |
| 04 | State reconciliation | 03 | Guarded, idempotent JTI/login reconciliation and verified device/pairing drain. |
| 05 | Keyring and security validation | 04 | All-instance keyring/bridge parity and complete fail-closed/security smoke evidence. |
| 06 | Reopen and Spec 245 crosswalk | 05 | Owner-approved service reopen, monitoring checkpoint and bounded update to existing Spec 245. |

The future G2 Durable Objects promotion is explicitly deferred to a separate implementation wave after recovery. It does not authorize a Redis-only rollback or replace PostgreSQL's current recovery authority.
