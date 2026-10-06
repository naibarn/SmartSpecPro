# Spec 286 R1.7 — Work Packages & SLO

Normative implementation sequencing/profile contract.

# 160. Normalized Implementation Work Breakdown

The earlier P0–P7 phases remain product-level milestones. Implementation SHALL decompose them into
bounded work packages.

## 160.1 Dependency graph

```text
WP0 Reconciliation
  ↓
WP1 Core Contracts / State / Events
  ↓
WP2 Media Capability Adapters
  ↓
WP3 Evidence + Deterministic QC
  ↓
WP4 Creative Director + Critic
  ↓
WP5 Targeted Repair / Partial Render
  ↓
WP6 Generated Motion Sandbox
  ↓
WP7 Motion Studio UX Integration
  ↓
WP8 Film / Creator / Editor Interop
  ↓
WP9 Delivery / Archive / Marketplace Readiness
```

## 160.2 Bounded packages

| Package | Deliverable | Depends | Exit evidence |
|---|---|---|---|
| `WP0.1` | canonical spec/registry/source inventory | — | signed reconciliation report |
| `WP0.2` | Spec 133 conformance matrix | WP0.1 | source-linked matrix |
| `WP0.3` | logical→physical mapping | WP0.1 | Section 159 complete |
| `WP0.4` | baseline golden renders + metrics | WP0.2 | immutable baseline pack |
| `WP1.1` | core R1.7 schemas/types | WP0 | schema tests |
| `WP1.2` | production state projection | WP1.1 | transition tests |
| `WP1.3` | actions/events/errors | WP1.1 | contract tests |
| `WP1.4` | manifest/receipt persistence adapters | WP0.3, WP1.1 | DB/R2 integration tests |
| `WP2.1` | probe/media execution normalized adapter | WP1 | provider conformance |
| `WP2.2` | caption/audio/reframe/export capabilities | WP2.1 | golden media fixtures |
| `WP2.3` | beat/timebase/color/delivery profiles | WP2.1 | deterministic fixtures |
| `WP3.1` | preview evidence extraction | WP2 | contact-sheet/frame tests |
| `WP3.2` | deterministic QC | WP3.1 | QC fixtures |
| `WP3.3` | semantic/accessibility/continuity gates | WP3.1 | domain fixtures |
| `WP4.1` | Director Brief + style intelligence | WP1, WP3 | plan fixtures |
| `WP4.2` | multimodal Creative Critic | WP3 | calibrated eval set |
| `WP4.3` | score/confidence/escalation | WP4.2 | holdout tests |
| `WP5.1` | issue ledger | WP3, WP4 | issue contract tests |
| `WP5.2` | repair planner + impact plan | WP5.1 | invalidation tests |
| `WP5.3` | partial rerender + seam QC | WP5.2 | boundary golden tests |
| `WP5.4` | keep-best/regression gate | WP5.3 | candidate comparison tests |
| `WP6.1` | sandbox isolation | WP1 | security tests |
| `WP6.2` | generated component compile/render | WP6.1, WP3 | fixture render |
| `WP6.3` | ephemeral use/promotion candidate | WP6.2 | governance tests |
| `WP7.1` | Direction UI | WP4 | mobile/desktop UX tests |
| `WP7.2` | Review/Repair UI | WP5 | stale-action tests |
| `WP7.3` | compare/locks/Editor handoff | WP5 | round-trip tests |
| `WP8.1` | Film scoped adapter | WP5 | Spec 252/258 fixtures |
| `WP8.2` | Creator/localization adapter | WP5 | locale fixtures |
| `WP8.3` | timeline/editor conformance | WP7.3 | interchange tests |
| `WP9.1` | final package + approval/delivery gates | WP3–WP8 | package tests |
| `WP9.2` | archive/restore | WP9.1 | restore tests |
| `WP9.3` | Skill promotion/commerce adapter | WP6.3 | Spec 280 tests |

A coding session SHOULD own one bounded package or a clearly defined sub-slice, not "implement P3"
as a single unbounded task.

---

# 161. SLO / Capacity Profile Contract

Performance requirements vary by hardware/provider/project class. Spec 286 SHALL therefore define a
mandatory **measured SLO profile** rather than hardcode one universal latency promise.

```ts
interface VideoRuntimeSloProfileV1 {
  profileId: string;
  environmentClass:
    | 'BROWSER_ONLY'
    | 'STANDARD_RUNNER'
    | 'HIGH_MEMORY_RUNNER'
    | 'CLOUD_CPU'
    | 'CLOUD_GPU'
    | 'EXTERNAL_PROVIDER'
    | 'CUSTOM';

  actionAdmissionP95Ms: number;
  statusReadP95Ms: number;
  manifestReadP95Ms: number;

  maxConcurrentPreviewJobs: number;
  maxConcurrentFinalJobs: number;

  maxManifestBytes: number;
  maxScenesPerProduction: number;
  maxActiveArtifactsPerProduction: number;

  minimumMemoryHeadroomPctBeforeAdmission: number;
  minimumDiskHeadroomPctBeforeAdmission: number;

  previewQueueTargetMs?: number;
  criticQueueTargetMs?: number;

  recoveryObjectiveSeconds?: number;
}
```

## 161.1 Mandatory P0 benchmark

Before production enablement, each supported environment class SHALL have:

```text
measured hardware/runtime identity
measured baseline
declared SLO profile
load-test evidence
OOM/resource-pressure test
admission/backpressure test
```

## 161.2 Non-negotiable service constraints

Regardless of environment-specific numeric targets:

- action admission/status APIs SHALL remain responsive while renders are busy;
- no host may intentionally accept render concurrency beyond advertised resource fitness;
- Task Control progress SHALL not depend on holding the render process HTTP request open;
- resource pressure SHALL queue/reject placement before catastrophic OOM where detectable;
- SLO miss is operational evidence, not permission to corrupt output or bypass QC;
- SLO profiles are versioned and observable.

---

