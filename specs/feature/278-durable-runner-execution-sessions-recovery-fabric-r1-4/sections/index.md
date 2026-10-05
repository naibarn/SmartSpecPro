<!-- PROJECT_CONFIG
runtime: rust-cargo
test_command: cargo test --manifest-path apps/runner-app/Cargo.toml
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-canonical-contracts-and-dark-projection
section-02-local-session-host-and-registry
section-03-recovery-reconciliation-and-authority-fencing
section-04-ordered-command-lane-stream-and-upgrade
section-05-resource-v2-and-two-phase-placement
section-06-structured-drivers-and-checkpoint-integrity
section-07-cloudflare-container-and-sandbox-drivers
section-08-execution-stream-separation
section-09-task-control-session-projection
section-10-commercial-grants-and-metering-evidence
section-11-certification-integration-and-rollout
END_MANIFEST -->

# Section Index — Spec 278 R1.4

| Section | Scope | Dependencies | Primary acceptance |
|---|---|---|---|
| 01 | Contracts, additive persistence, dark projection, transition API | — | INV-001..010; AC-12, AC-14, AC-15, AC-40 |
| 02 | Rust local Session Host, registry, process/PTY, receipts | 01 | AC-01, AC-09..11, AC-18, AC-20, AC-29, AC-33 |
| 03 | Inventory recovery, CAS, signed authority and canonical reconcile | 01, 02 | AC-02..04, AC-07..08, AC-16..17, AC-24, AC-26..28, AC-31..32 |
| 04 | Ordered commands/input/output/update compatibility | 01..03 | AC-05..06, AC-19, AC-21..22, AC-35..36, AC-38, AC-40 |
| 05 | Resource snapshots, reservation, enforcement | 01, 03 | AC-23, AC-37 |
| 06 | ACP/external adapters, driver trust and checkpoints | 01, 03 | AC-25, AC-34, AC-39 |
| 07 | Cloudflare replacement/reconstruction adapters | 06 | AC-13, AC-25 |
| 08 | Reconnectable data stream and backpressure | 02, 04 | AC-30, AC-36 |
| 09 | Safe Task Control projection | 01, 03, 04 | AC-14, AC-26 |
| 10 | Optional commercial binding, grant, usage evidence | 01, 03, 04 | R1.4 AC 1..15 |
| 11 | Integrated fault matrix, traceability, rollout gates | 01..10 | AC-01..40, Tier A..E |

## Implementation status (2026-10-05)

| Section | Status | Evidence / blocker |
|---|---|---|
| 01 | Partial | Feature-gated projection creation, M0 external-agent binding through Runner command validation, and receipt-driven state projection; migration application, full protocol negotiation, production shadow sample, and schema-baseline proof remain open |
| 02 | Partial | Linux separate Session Host/PTY/UDS, protected attach descriptor, process identity, escalation, registry registration API and real-process reconnect tests; canonical Worker start/recovery caller and Windows/macOS support remain open |
| 03 | Partial | Authenticated WSS/HTTP observer plus Linux startup producer over verified host+child registry identities, bounded 64-record batches, canonical fence/revision checks; registry writer is callable but not integrated into canonical Worker start/recovery, adoption/issuance and PG race proof remain open |
| 04 | Partial | Durable command lane plus Linux Host-local sequence/payload dedupe and PTY bridge; canonical Session Manager/server/upgrade integration remains open |
| 05 | Partial | Local reservation ledger with idempotent terminal states; no server placement/OS enforcement |
| 06 | Partial | Deployment-pinned driver/checkpoint contracts, local durable checkpoint store with integrity/scope tests, and recomputed lineage; provider adapters, driver trust registry, and revocation remain open |
| 07 | Deferred | No approved session driver boundary or live provider certification |
| 08 | Partial | Bounded local spool and critical receipts; no reconnect transport |
| 09 | Partial | Safe authenticated API projection and bilingual unknown-state notice; no location/recovery-phase/liveness proof or browser matrix |
| 10 | Blocked | Spec 280 grant/evidence owner integration not available |
| 11 | Blocked | Certification tiers require missing runtime/provider/production evidence |

Implementation order follows dependencies. Each section file owns its requirement-to-file/test matrix and records the actual completion state. External certification remains explicit and cannot be closed by local mocks.
