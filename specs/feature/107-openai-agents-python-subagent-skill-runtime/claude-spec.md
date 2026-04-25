# Synthesized Specification

## Feature Name

OpenAI Agents Python Subagent Skill Runtime

## Objective

Extend SmartSpecPro Feature 106 from a native OpenAI Agents Python skill bundle into a complete subagent-aware runtime. The system must support:

- creating new skills that declare specialist subagents
- improving existing skills so they can become subagent-aware when useful
- running subagent-aware skills from every supported product entrypoint
- maintaining and migrating legacy skills toward the same contract
- exposing subagent lineage, status, and failure reasons in admin and monitoring views

## Key Product Decisions

- OpenAI Agents Python is the primary runtime target.
- The orchestrator remains in control by default.
- Specialists should first be used as tools and only use handoffs when ownership should transfer.
- Subagent support is optional, explicit, and compatible with single-agent bundles.
- The bundle contract must be machine-readable so runtime and maintenance layers do not have to infer behavior from prose alone.

## Required Bundle Shape

Subagent-aware bundles should remain compatible with Feature 106 while adding:

- `SKILL.md`
- `skill.lock.json`
- `scripts/run.sh`
- `scripts/verify.sh`
- `references/input_contract.md`
- `references/output_contract.md`
- `references/maintenance.md`
- `references/subagents.md`
- `agents/orchestrator.md`
- `agents/specialists/*.md`
- `subagents.json`
- `MODEL_COMPATIBILITY.md`
- `skill.md` as a compatibility mirror during migration

## Required Contract Data

The machine-readable manifest should declare:

- orchestrator metadata
- subagent name, role, mode, entrypoint, tool boundary, handoff policy
- checkpoint policy
- verification policy
- fallback policy
- routing rules

The manifest must be rejected if it disagrees with `SKILL.md`, `skill.lock.json`, or the bundle path layout.

## Runtime Requirements

- The runtime must load the bundle, inspect the manifest, and discover subagents before execution.
- The runtime must support both agent-as-tool and handoff routing.
- The runtime must keep parent and child runs checkpointed and resumable.
- The runtime must persist lineage and verification state for each execution unit.
- The runtime must reject bundles that declare subagents without valid entrypoints or policies.

## Maintenance and Migration Requirements

- ISC create flows must be able to generate subagent-aware bundles.
- ISC improve flows must upgrade legacy skills toward subagent awareness only when it materially improves the workflow.
- Maintenance must detect missing manifests, invalid routing, scope widening, and other contract drift.
- Migration must preserve stable slugs and compatibility mirrors while generating subagent scaffolds.

## Security Requirements

- No subagent may access undeclared host paths.
- No subagent may widen the parent contract's tool, filesystem, or network scope.
- No secret material should be persisted in runtime state or bundle artifacts.
- The implementation must reject contract/path mismatches before subagent code executes.
- Bundle loading should be allowlisted and deterministic wherever possible.

## Testing Requirements

- Python backend: pytest with async support and coverage enforcement.
- Web backend: vitest with jsdom for client views and node for service tests.
- Tests must cover:
  - manifest validation
  - runtime loading and routing
  - parent/child lineage persistence
  - maintenance drift detection and repair
  - admin UI trace visibility
