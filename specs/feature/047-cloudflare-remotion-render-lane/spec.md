# Feature 047: Cloudflare Remotion Render Lane with Opt-in Credit Billing

**Status:** Proposed  
**Revision:** 2.0  
**Target repository:** `naibarn/SmartSpecPro`  
**Primary scope:** Remotion `job-render` / `remotion_render_video`  
**Design principle:** Add a cloud render lane without removing or degrading the existing Windows Worker lane  
**Date:** 2026-08-15  

---

# 1. Problem Statement

SmartSpecPro currently supports desktop/Windows-side execution for render workloads. This works well for users who have a Windows machine available, but it creates a usability gap for users who:

- only have an iPad or Android tablet;
- use a Chromebook;
- use SmartSpecPro from a browser-only environment;
- have a Windows machine that is offline;
- do not want to keep a local Worker running.

The system must support server-side Remotion rendering without requiring the user to install or keep a Windows Worker online.

At the same time, the existing Windows Worker must remain fully supported because it provides value for:

- local execution;
- local files;
- local ComfyUI/GPU workflows;
- users who prefer not to spend Cloud Render credits;
- fallback and operational redundancy;
- workflows that require access to resources on the user's machine.

The new design adds Cloudflare as an optional Remotion render execution lane.

Cloud rendering must be explicitly enabled by the user or tenant policy. Cloud rendering must never silently consume credits for a user who has not opted in.

---

# 2. Core Product Model

SmartSpecPro will support two parallel Remotion render lanes:

```text
                    SmartSpecPro Render Queue
                              │
                 ┌────────────┴────────────┐
                 │                         │
                 ▼                         ▼
          Windows Worker          Cloud Render Runtime
                 │                         │
        local / existing          Cloudflare Worker
          behavior                       │
                                         ▼
                              Cloudflare Container
                                         │
                            Remotion + Chromium
                              FFmpeg + FFprobe
                                         │
                                         ▼
                                        R2
```

The Windows Worker is preserved.

The Cloud lane is additive.

The user-facing final artifact behavior remains the same regardless of which runtime executes the job:

```text
Render Job
   │
   ▼
Completed
   │
   ▼
Final Video Artifact
   │
   ▼
R2-backed download/playback link
```

The UI must not require a separate cloud-specific artifact experience.

---

# 3. Goals

## G-1 — Preserve Windows Worker

The existing Windows Worker path remains fully supported.

No existing Windows Worker capability is removed.

When Cloud Render is disabled, SmartSpecPro must behave exactly as before this feature.

---

## G-2 — Support tablet/browser-only users

A user with no Windows Worker online must still be able to render a Remotion video by allowing Cloud Render.

The user device only:

- creates the render job;
- uploads required assets;
- monitors progress;
- receives the final artifact link.

The user device does not perform the render.

---

## G-3 — Add Cloudflare Render Dispatcher

A Cloudflare Worker acts as the Cloud Render Dispatcher.

Responsibilities:

- consume cloud-render-eligible queue messages;
- request an atomic claim from the SmartSpecPro control plane;
- start/address a Cloudflare Container;
- deliver a signed render envelope;
- monitor dispatch health;
- report orchestration errors;
- trigger/coordinate cleanup and billing reconciliation.

The Cloudflare Worker itself does **not** execute Chromium/Remotion/FFmpeg rendering.

The renderer runs inside a Cloudflare Container.

---

## G-4 — User-controlled cloud eligibility

Cloud rendering requires all of:

1. tenant policy allows Cloud Render;
2. the user has enabled Cloud Render or selected it for the current job;
3. the user has accepted Cloud Render credit billing;
4. a credit hold has succeeded;
5. the Cloud runtime atomically claims the job.

Each job persists an immutable snapshot of these decisions.

---

## G-5 — Fully-loaded attributable cost + 20%

The final Cloud Render charge must cover the full attributable platform cost of the render, not merely Container CPU.

The billing model is:

```text
fullyLoadedAttributableCostUsd
=
    measuredDirectInfrastructureCostUsd
  + allocatedSharedInfrastructureCostUsd
  + guaranteedArtifactRetentionCostUsd
```

Then:

```text
billableCostUsd
=
fullyLoadedAttributableCostUsd × 1.20
```

Then:

```text
finalChargeCredits
=
convertUsdToCredits(billableCostUsd)
```

The 20% is the SmartSpecPro Cloud Render service margin.

The margin is configurable by Admin but defaults to:

```text
20%
```

---

## G-6 — Deterministic artifact lifecycle

After a successful cloud render:

- final artifact must be uploaded to R2;
- R2 artifact must be verified;
- SmartSpecPro artifact record must be committed;
- user may see/download the completed artifact;
- all per-job temporary files must be deleted;
- Container workspace must be deleted;
- temporary R2 render objects must be deleted;
- Container must be stopped.

Original project assets must never be deleted by the render cleanup process.

---

## G-7 — No double execution

A job must never render simultaneously on both:

- Windows Worker;
- Cloudflare Container.

Both runtimes must share one atomic assignment/lease model.

---

## G-8 — Recoverable and auditable billing

Every cloud render must be traceable from:

```text
render job
→ assignment attempt
→ cloud container instance
→ measured usage
→ allocated shared cost
→ artifact retention reserve
→ 20% markup
→ credit settlement
```

Billing must be idempotent.

---

# 4. Non-Goals

This feature does not:

- remove Windows Worker;
- migrate ComfyUI/CUDA workloads to Cloudflare Containers;
- require every render to use cloud;
- render inside a Cloudflare Worker isolate;
- replace the existing Remotion core pipeline;
- replace SmartSpecPro's existing credit ledger;
- make Cloudflare the only future render provider;
- permanently store job temporary files;
- treat original project assets as disposable job files.

---

# 5. Current Repository Integration Assumptions

Implementation should reuse the repository's current foundations wherever possible.

## 5.1 Remotion core

Use:

```text
packages/remotion-render
```

as the canonical render pipeline.

The Cloud runtime must provide environment adapters rather than fork render logic.

---

## 5.2 Windows Worker

Existing Windows Worker behavior remains intact.

Relevant areas may include:

```text
apps/worker-app
apps/tauri-shell
desktop worker executor / Remotion sidecar
```

No Windows runtime behavior should be removed merely because a Cloud lane exists.

---

## 5.3 Worker Runtime contracts

Reuse or extend current contracts in:

```text
apps/web/shared/workerRuntime.ts
```

for:

- job identity;
- claim;
- assignment attempt;
- lease ownership;
- progress;
- artifacts;
- execution runtime type.

---

## 5.4 Delegation/control plane

Reuse or extend:

```text
apps/web/server/services/workerDelegationService.ts
```

for canonical job delegation and ownership.

Do not create an unrelated second source of truth.

---

## 5.5 Credits

Reuse:

```text
apps/web/server/services/creditService.ts
```

for:

- atomic deduction;
- idempotency;
- refunds;
- ledger transactions.

Long-running cloud render holds must not rely solely on a short-lived Redis reservation.

---

# 6. High-Level Architecture

```text
                         SmartSpecPro Web
                    Tablet / Browser / Desktop
                               │
                               │ create render job
                               ▼
                      SmartSpecPro Control Plane
                               │
                    Canonical Render Job Record
                               │
                  ┌────────────┴─────────────┐
                  │                          │
                  ▼                          ▼
         Windows-eligible            Cloud-eligible
                  │                          │
                  ▼                          ▼
        Existing Windows Worker      Cloud Render Queue
                  │                          │
                  │                          ▼
                  │               Cloudflare Dispatcher Worker
                  │                          │
                  │                 atomic claim request
                  │                          ▼
                  └──────────────► SmartSpecPro Server
                                             │
                                      claim granted?
                                             │
                                             ▼
                                  Cloudflare Container
                                  ┌──────────────────┐
                                  │ Node.js          │
                                  │ Remotion         │
                                  │ Chromium         │
                                  │ FFmpeg / ffprobe │
                                  │ required fonts   │
                                  └────────┬─────────┘
                                           │
                                           ▼
                                  Final Artifact Upload
                                           │
                                           ▼
                                          R2
                                           │
                                  verify + artifact DB
                                           │
                                           ▼
                                    User sees Complete
                                           │
                                           ▼
                                   cleanup temporary data
                                           │
                                           ▼
                                     stop Container
```

---

# 7. Execution Preferences

Add:

```ts
type RenderExecutionPreference =
  | "desktop_only"
  | "desktop_preferred"
  | "cloud_preferred"
  | "cloud_only";
```

---

## 7.1 `desktop_only`

- Windows Worker only.
- Cloud Dispatcher must not claim.
- No Cloud Render billing consent required.
- No Cloud Render credits charged.

This remains the backward-compatible default for existing users.

---

## 7.2 `desktop_preferred`

- Windows Worker gets priority.
- If no healthy eligible Windows Worker exists, cloud may become eligible immediately.
- If a healthy Windows Worker exists but does not claim within a grace period, cloud may become eligible.
- Requires Cloud Render opt-in and billing consent.

Initial recommendation:

```text
CLOUD_RENDER_DESKTOP_GRACE_SECONDS=15
```

---

## 7.3 `cloud_preferred`

- Cloud may claim immediately after authorization.
- Windows may be fallback if cloud dispatch/start fails and fallback policy allows.
- Requires credit hold.

---

## 7.4 `cloud_only`

- Only Cloud Render may claim.
- Intended for tablet/browser-only users.
- Requires credit hold.

---

# 8. Default Behavior

For existing users:

```text
defaultExecutionPreference = desktop_only
```

Cloud Render must be opt-in.

When a user explicitly enables Cloud Render, recommended default:

```text
desktop_preferred
```

For a user with no enrolled/healthy Windows Worker, UI may recommend:

```text
cloud_only
```

but must not silently enable paid rendering.

---

# 9. User Cloud Render Settings

Suggested structure:

```ts
interface UserCloudRenderSettings {
  cloudRenderEnabled: boolean;

  cloudRenderBillingConsentVersion: string | null;
  cloudRenderBillingConsentAt: string | null;

  defaultExecutionPreference:
    | "desktop_only"
    | "desktop_preferred"
    | "cloud_preferred"
    | "cloud_only";

  maxEstimatedCreditsPerJob: number | null;
  dailyCloudRenderCreditLimit: number | null;
}
```

Tenant policy:

```ts
interface TenantCloudRenderPolicy {
  enabled: boolean;
  allowUserOptIn: boolean;

  maxConcurrentCloudRendersPerUser: number;
  maxConcurrentCloudRendersPerTenant: number;

  maxEstimatedCreditsPerJob: number | null;
  dailyCreditLimitPerUser: number | null;
}
```

The stricter policy always wins.

---

# 10. Render Dialog UX

When user clicks **Render Final Video**, offer:

```text
Render using:

(•) Windows Worker only
    Does not use Cloud Render credits

( ) Windows Worker first, allow Cloud fallback
    Cloud fallback uses SmartSpec credits

( ) Cloud Render
    Works without a PC online
    Uses SmartSpec credits
```

For a cloud-capable option:

```text
Estimated Cloud Render:
~ 12–18 credits

Includes:
- render infrastructure
- allocated cloud platform overhead
- included final-video retention period

Final charge:
fully-loaded attributable cloud cost + 20%

[✓] I agree to use SmartSpec credits for Cloud Render.
```

The estimate is informational.

Final charge is based on measured/allocated cost under the job's versioned billing policy.

---

# 11. Per-Job Policy Snapshot

Persist:

```ts
interface RenderExecutionPolicySnapshot {
  executionPreference: RenderExecutionPreference;

  cloudRenderAllowed: boolean;
  cloudBillingAccepted: boolean;

  cloudBillingConsentVersion: string | null;
  cloudBillingConsentAt: string | null;

  desktopGraceSeconds: number;

  estimatedDirectInfrastructureCostUsd: number | null;
  estimatedSharedInfrastructureCostUsd: number | null;
  estimatedArtifactRetentionCostUsd: number | null;

  estimatedBillableCostUsd: number | null;
  estimatedChargeCredits: number | null;

  creditHoldAmount: number | null;
  creditHoldId: string | null;

  pricingPolicyVersion: string;
  sharedCostAllocationPolicyVersion: string;
  artifactRetentionPolicyVersion: string;
  creditConversionVersion: string;
}
```

Changing account settings later does not mutate an already-submitted job.

---

# 12. Job State Model

Render state:

```text
queued
waiting_desktop
cloud_authorizing
cloud_queued
claimed_desktop
claimed_cloud
cloud_starting
staging_assets
rendering
encoding
uploading
verifying_artifact
completed
failed
cancelled
```

Cleanup state is separate:

```text
not_required
pending
running
cleaned
retry_required
failed_terminal
```

Billing state is separate:

```text
not_applicable
pending_hold
held
metering_pending
reconciling
settled
refunded
billing_failed
```

A completed render may legitimately have:

```text
render_status  = completed
cleanup_status = pending
billing_status = metering_pending
```

This is intentional.

---

# 13. Canonical Job and Queue Design

## 13.1 PostgreSQL remains source of truth

The SmartSpecPro render job record is canonical.

Cloudflare Queue is a dispatch mechanism, not the authoritative job database.

---

## 13.2 Queue eligibility

Publish cloud queue message only when:

```text
cloudRenderAllowed == true
AND
cloudBillingAccepted == true
AND
creditHoldStatus == held
AND
job remains claimable
AND
tenant/user concurrency policy allows it
```

Message:

```ts
interface CloudRenderQueueMessage {
  renderJobId: string;
  tenantId: string;
  userId: number;
  assignmentAttempt: string;
  notBefore?: string;
  traceId: string;
}
```

Do not put:

- composition payload;
- prompts;
- permanent credentials;
- raw R2 secrets;

inside the queue message.

---

# 14. Cloudflare Dispatcher Worker

The Dispatcher:

1. consumes eligible queue message;
2. requests atomic cloud claim;
3. exits if claim is rejected;
4. starts/addresses Container instance;
5. sends signed render envelope;
6. acknowledges queue message;
7. relies on durable job state/watchdog for completion.

Pseudo-flow:

```ts
async function consume(message) {
  const claim = await smartspec.internalClaimCloudRender({
    renderJobId: message.renderJobId,
    assignmentAttempt: message.assignmentAttempt,
  });

  if (!claim.granted) {
    ack(message);
    return;
  }

  const container = getContainer(
    env.REMOTION_RENDER_CONTAINER,
    claim.containerInstanceName
  );

  await container.start();

  await container.fetch("/v1/render", {
    method: "POST",
    body: claim.signedRenderEnvelope
  });

  ack(message);
}
```

Queue delivery never equals ownership.

Only an atomic server-side claim grants ownership.

---

# 15. Atomic Claim and Lease Contract

Invariant:

```text
one renderJobId
+ one assignmentAttempt
= at most one active execution owner
```

Lease owner:

```ts
type RenderLeaseOwnerType =
  | "desktop_worker"
  | "cloudflare_container";
```

Conceptual atomic claim:

```sql
UPDATE render_jobs
SET
  lease_owner_type = 'cloudflare_container',
  lease_owner_id = :instanceId,
  lease_owner_token = :token,
  lease_expires_at = :expiry,
  status = 'claimed_cloud'
WHERE
  id = :jobId
  AND status IN ('queued', 'waiting_desktop', 'cloud_queued')
  AND (
    lease_expires_at IS NULL
    OR lease_expires_at < NOW()
  );
```

Zero updated rows means claim rejected.

Windows Worker must use equivalent ownership rules.

---

# 16. Desktop-Preferred Cloud Fallback

For:

```text
desktop_preferred
```

routing:

```text
job created
    │
    ├── no healthy eligible Windows Worker
    │       └── cloud eligible immediately
    │
    └── healthy eligible Windows Worker
            └── wait desktopGraceSeconds
                    │
                    ├── desktop claims → cloud cannot claim
                    └── no desktop claim → cloud eligible
```

Correctness must not depend on deleting already-enqueued cloud messages.

Atomic claim resolves races.

---

# 17. Cloudflare Container Runtime

## 17.1 Container contents

Container image should include:

```text
Linux
Node.js
SmartSpecPro Remotion package
Remotion
Chromium / Chrome Headless Shell
FFmpeg
FFprobe
required Thai/project fonts
artifact uploader
progress callback client
cleanup helper
metering correlation metadata
```

---

## 17.2 Reuse Remotion core

Do not fork render behavior.

Use:

```text
packages/remotion-render
```

with Cloud adapters for:

```text
storageRead / asset access
storagePut
emitEvent
stageAssets
ffmpeg
ffprobe
audit
cleanup
```

---

## 17.3 One active job per Container

Initial rule:

```text
1 active render job / Container instance
```

Benefits:

- isolates customer/job data;
- simplifies RAM management;
- simplifies usage attribution;
- simplifies cleanup;
- simplifies crash recovery;
- aligns with current per-process Remotion serialization.

---

## 17.4 Container identity

Recommended:

```text
smartspec-remotion-{renderJobId}-{assignmentAttempt}
```

Persist Cloudflare's real instance ID.

Labels may include non-sensitive correlation keys.

Never include:

- email;
- user name;
- prompt content;
- permanent token;
- asset URL containing secrets.

---

# 18. Job File Classification

Every file participating in a cloud render must belong to exactly one lifecycle class.

```ts
type RenderFileClass =
  | "project_asset"
  | "job_temporary"
  | "final_artifact";
```

---

## 18.1 Project Asset

Examples:

```text
shot01.mp4
shot02.mp4
voice.wav
music.mp3
logo.png
reference images
```

Characteristics:

- belongs to the project/library;
- may be reused by future renders;
- must not be deleted by job cleanup.

Suggested prefix:

```text
projects/{projectId}/assets/
```

---

## 18.2 Job Temporary

Examples:

```text
downloaded/staged assets
intermediate segments
temporary frames
FFmpeg temp files
temporary manifests
render chunks
temporary subtitles
temporary encoded streams
```

Characteristics:

- belongs only to one render attempt;
- must be deleted after artifact commit;
- must be deleted after terminal failure when safe;
- protected by lifecycle safety-net expiration.

Suggested R2 prefix:

```text
render-temp/{renderJobId}/{assignmentAttempt}/
```

Container local prefix:

```text
/work/jobs/{renderJobId}/{assignmentAttempt}/
```

---

## 18.3 Final Artifact

Examples:

```text
final.mp4
thumbnail.jpg
final subtitle sidecar if product requires it
```

Characteristics:

- becomes part of SmartSpecPro artifact/library system;
- stored in R2;
- visible through normal existing artifact UX;
- governed by artifact retention/storage policy, not render-temp policy.

Suggested prefix:

```text
artifacts/{tenantId}/{projectId}/{renderJobId}/
```

---

# 19. Artifact Commit Contract

A cloud render is not considered user-visible complete until all of:

```text
1. final output generated
2. final output uploaded to R2
3. R2 object verified
4. artifact metadata committed to SmartSpecPro DB
5. artifact access/download path is available
```

Verification should include as appropriate:

```text
HEAD/object metadata exists
non-zero size
expected MIME/type
expected object key
optional checksum/ETag validation
optional ffprobe verification before upload
```

Only after artifact commit succeeds:

```text
render_status = completed
```

User then sees the same artifact experience as a Desktop Worker job.

---

# 20. User-Facing Artifact Contract

Desktop and Cloud outputs converge into one existing artifact system.

```text
Desktop Worker
      │
      ├────────────┐
      │            ▼
      │     SmartSpec Artifact Service
      │            │
      │            ▼
      │            R2
      │            │
Cloud Container ───┘
```

The UI should show:

```text
Status: Completed
Output: final-video.mp4

[ Play ]
[ Download ]
```

Execution runtime may appear as diagnostic metadata, but not as a separate download system.

---

# 21. Cleanup Contract

Cleanup is mandatory for Cloud Render.

Primary rule:

```text
Artifact commit succeeds
        │
        ▼
render_status = completed
        │
        ▼
cleanup_status = pending
        │
        ▼
delete per-job temporary data
        │
        ▼
stop Container
```

---

## 21.1 Container local cleanup

Delete:

```text
/work/jobs/{renderJobId}/{assignmentAttempt}/
```

including:

- input staging copies;
- temporary render frames;
- intermediate video files;
- temp audio;
- temp subtitle files;
- FFmpeg scratch;
- generated manifests;
- sidecar temp state.

Use recursive removal only inside the job-scoped workspace.

Never delete outside the known job root.

---

## 21.2 Temporary R2 cleanup

Delete:

```text
render-temp/{renderJobId}/{assignmentAttempt}/*
```

after final artifact commit.

Do not delete:

```text
projects/.../assets/*
artifacts/.../*
```

---

## 21.3 Cleanup failure

Cleanup failure must not make a successfully produced final video appear failed.

Example:

```text
render_status  = completed
cleanup_status = retry_required
```

A watchdog retries cleanup.

---

## 21.4 Container stop

After:

```text
artifact commit
+
best-effort immediate cleanup
+
completion callback
```

call:

```text
container.stop()
```

Do not intentionally keep the Container alive until an inactivity timeout.

Stopping the Container is the cost-critical lifecycle action.

Deleting local files is required primarily for:

- privacy;
- isolation;
- correctness;
- deterministic lifecycle;

not as a substitute for stopping the Container.

---

# 22. R2 Lifecycle Safety Net

Explicit delete is the primary cleanup mechanism.

Add an R2 object lifecycle rule as a safety net:

```text
prefix:
render-temp/

expiration:
1 day
```

or the shortest operationally safe supported value.

Purpose:

- clean orphaned temp objects after crash;
- clean temp objects after callback loss;
- clean temp objects after cleanup worker failure.

Policy:

```text
Explicit delete = primary
R2 lifecycle expiration = safety net
```

Do not rely solely on lifecycle expiration.

---

# 23. Failure Cleanup

On terminal failure:

```text
job fails
   │
   ├── preserve diagnostic metadata
   ├── preserve only explicitly configured minimal logs
   ├── delete local temp workspace
   ├── delete render-temp R2 objects
   └── stop Container
```

Do not retain source assets copied into job temp storage longer than necessary.

Original project assets remain untouched.

---

# 24. Cancellation Cleanup

On user cancellation:

1. stop/interrupt render if possible;
2. flush final metering boundary;
3. do not publish incomplete media as final artifact;
4. delete job temp;
5. stop Container;
6. settle credits according to cancellation policy.

---

# 25. Cloud Render Cost Model

The final billing model must not use:

```text
Container cost only
```

as the meaning of "actual cost".

Use:

```text
fullyLoadedAttributableCostUsd
```

---

# 26. Cost Layers

## 26.1 Layer A — Measured Direct Infrastructure Cost

```text
measuredDirectInfrastructureCostUsd
```

may include attributable:

```text
Cloudflare Container CPU
Cloudflare Container provisioned RAM
Cloudflare Container provisioned disk
Container network egress
Cloudflare Worker execution
Durable Object execution/storage
Queue operations
Workflow steps/storage
R2 operations
temporary R2 storage
observability/logging if directly attributable
```

V1 may phase in categories where exact per-job allocation is available.

Each omission must be explicit in the pricing policy version.

---

## 26.2 Layer B — Allocated Shared Infrastructure Cost

Some platform costs are shared rather than directly attributable.

Examples:

```text
base Workers plan/account charge
shared scheduler runtime
shared monitoring
shared Durable Object overhead
shared control-plane cost
minimum platform spend
shared observability
```

Represent:

```text
allocatedSharedInfrastructureCostUsd
```

Allocation policy must be deterministic and versioned.

Possible models:

```text
fixed amount per cloud render
cost per active render minute
monthly shared pool / billable render units
hybrid allocation
```

Do not allocate based on which user happened to consume a provider free allowance first.

---

## 26.3 Layer C — Guaranteed Final Artifact Retention Cost

A one-time render cannot cover indefinite R2 storage.

Therefore Cloud Render billing may include only a defined guaranteed retention period.

Recommended initial policy:

```text
CLOUD_RENDER_INCLUDED_ARTIFACT_RETENTION_DAYS=30
```

Represent:

```text
guaranteedArtifactRetentionCostUsd
```

Estimate from:

```text
final artifact size
× storage unit price
× included retention period
```

The billing policy must document whether thumbnails/sidecars are included.

---

# 27. Fully-Loaded Cost Formula

```text
fullyLoadedAttributableCostUsd
=
    measuredDirectInfrastructureCostUsd
  + allocatedSharedInfrastructureCostUsd
  + guaranteedArtifactRetentionCostUsd
```

Then:

```text
serviceMarkupRate = 0.20
```

```text
billableCostUsd
=
fullyLoadedAttributableCostUsd × (1 + serviceMarkupRate)
```

Default:

```text
billableCostUsd
=
fullyLoadedAttributableCostUsd × 1.20
```

Then:

```text
finalChargeCredits
=
convertUsdToCredits(
  billableCostUsd,
  creditConversionSnapshot
)
```

---

# 28. Why the 20% Margin Must Apply After Full Cost

Incorrect:

```text
ContainerCost × 1.20
+ uncharged R2/shared costs
```

Correct:

```text
(
  direct infrastructure
  + shared allocated infrastructure
  + guaranteed artifact retention
)
× 1.20
```

This ensures the 20% service margin is applied after all included attributable cost components.

---

# 29. Shared Free/Included Cloud Allowances

Provider-level monthly included usage must not make per-user charges nondeterministic.

Do not do:

```text
first users this month = free because allowance remains
later users = charged because allowance exhausted
```

Instead:

```text
nominal versioned unit price
× measured attributable usage
```

for every user/job.

Provider free/included allowance is treated as platform margin benefit.

Finance/Admin may separately reconcile:

```text
internal nominal cost
vs
actual provider invoice
```

---

# 30. Long-Term Final Artifact Storage

Cloud Render charge includes only the configured guaranteed retention period.

After that, final artifacts are governed by SmartSpecPro's storage system.

Recommended product model:

```text
Render charge
= render + included 30-day final artifact retention

Long-term storage
= account/project storage quota or separate storage policy
```

Possible policies:

```text
Free: 2 GB
Pro: 50 GB
Business: 500 GB
```

or equivalent existing SmartSpecPro storage entitlements.

Do not promise indefinite R2 retention from a one-time Cloud Render charge.

---

# 31. Artifact Retention State

Suggested fields:

```ts
interface ArtifactRetentionPolicySnapshot {
  policyVersion: string;
  storageClass: "r2_standard";
  includedRetentionDays: number;
  retentionIncludedUntil: string;
  includedBytes: number;
  includedRetentionCostUsd: string;
}
```

After included retention:

- artifact may remain if account storage quota covers it;
- artifact may enter a storage-billing system;
- artifact may become eligible for deletion under product policy.

The user must not unexpectedly lose an artifact without the normal SmartSpec storage/retention UX and notifications.

---

# 32. R2 Storage Class

Use R2 Standard for newly rendered final videos unless a later storage policy deliberately migrates objects.

Reason:

- rendered videos are often downloaded soon after completion;
- retrieval behavior is simpler;
- no need to optimize prematurely for infrequent access.

Storage class must remain policy-driven, not hard-coded in render core.

---

# 33. R2 Download Path

Final video should be delivered via the existing SmartSpecPro artifact/access model.

Prefer:

```text
R2 signed URL
```

or:

```text
lightweight authorized Worker access
```

Avoid proxying large final video bytes through the primary SmartSpecPro application server unless required.

---

# 34. Cloudflare Container Usage Metering

Use provider usage telemetry to reconcile direct Container cost.

Correlate by:

```text
container instance ID
```

and/or unambiguous per-job labels.

Persist normalized usage such as:

```text
cpuTimeSec
allocatedMemoryByteSeconds
allocatedDiskByteSeconds
txBytes
region
```

Store enough raw/normalized telemetry to audit billing.

---

# 35. Pricing Snapshot

Never hard-code provider unit prices inside renderer code.

Suggested structure:

```ts
interface CloudRenderPricingSnapshot {
  version: string;
  effectiveAt: string;

  containerCpuUsdPerVcpuSecond: string;
  containerMemoryUsdPerGiBSecond: string;
  containerDiskUsdPerGbSecond: string;

  egressUsdPerGbByRegion: Record<string, string>;

  workerUnitPricing?: Record<string, string>;
  durableObjectUnitPricing?: Record<string, string>;
  queueUnitPricing?: Record<string, string>;
  workflowUnitPricing?: Record<string, string>;
  r2UnitPricing?: Record<string, string>;

  sharedCostAllocationPolicyVersion: string;

  includedArtifactRetentionDays: number;
  artifactStorageUsdPerGbMonth: string;

  serviceMarkupRate: string; // default 0.20

  creditsPerUsd: string;
}
```

Use decimal/string-safe financial representations.

---

# 36. Direct Cost Formula

Example normalized calculations:

```text
memoryGiBSeconds
=
allocatedMemoryByteSeconds / 1024^3
```

```text
diskGbSeconds
=
allocatedDiskByteSeconds / 1_000_000_000
```

```text
txGb
=
txBytes / 1_000_000_000
```

Then:

```text
containerCostUsd
=
    cpuTimeSec × cpuUsdPerVcpuSecond
  + memoryGiBSeconds × memoryUsdPerGiBSecond
  + diskGbSeconds × diskUsdPerGbSecond
  + txGb × regionEgressUsdPerGb
```

Then:

```text
measuredDirectInfrastructureCostUsd
=
    containerCostUsd
  + attributableWorkerCostUsd
  + attributableDurableObjectCostUsd
  + attributableQueueCostUsd
  + attributableWorkflowCostUsd
  + attributableR2OperationCostUsd
  + attributableTemporaryR2StorageCostUsd
  + attributableObservabilityCostUsd
```

---

# 37. Shared Cost Allocation

Add service:

```ts
allocateSharedCloudRenderCost(job): Decimal
```

Recommended V1:

```text
fixedSharedCostPerCloudRender
+
sharedCostPerRenderMinute × actualRenderWallMinutes
```

or another deterministic model based on real operating data.

The allocation method must be:

- versioned;
- configurable;
- auditable;
- stable for a submitted job.

Do not retroactively reprice completed jobs when Admin changes the policy.

---

# 38. Included Artifact Retention Cost Formula

For a final artifact:

```text
artifactSizeGb
=
finalArtifactBytes / 1_000_000_000
```

Approximate included storage cost:

```text
guaranteedArtifactRetentionCostUsd
=
artifactSizeGb
× r2StorageUsdPerGbMonth
× includedRetentionDays / billingMonthNormalizationDays
```

Use the billing policy's defined month normalization rule.

Do not round intermediate USD values.

---

# 39. Credit Conversion

If SmartSpecPro already has a canonical conversion service, reuse it.

Otherwise add:

```text
cloudRenderCreditsPerUsd
```

as an Admin-managed setting.

Example:

```text
fullyLoadedAttributableCostUsd = $0.050
markup 20%                    = $0.010
billableCostUsd               = $0.060

creditsPerUsd                 = 1000

final charge                  = 60 credits
```

Use deterministic rounding.

If credits are integer-only, recommended:

```text
ceil(finalChargeCredits)
```

---

# 40. Credit Pre-Authorization / Hold

The final cost is unknown before rendering.

Estimate:

```text
estimatedDirectInfrastructureCostUsd
estimatedSharedInfrastructureCostUsd
estimatedArtifactRetentionCostUsd
```

Then:

```text
estimatedFullyLoadedCostUsd
=
sum of estimates
```

```text
estimatedBillableCostUsd
=
estimatedFullyLoadedCostUsd × 1.20
```

Then hold with safety buffer:

```text
holdCredits
=
estimatedChargeCredits × CLOUD_RENDER_HOLD_SAFETY_FACTOR
```

Recommended:

```text
CLOUD_RENDER_HOLD_SAFETY_FACTOR=1.25
```

The 25% safety factor is **not revenue**.

Unused hold is returned.

---

# 41. Persistent Credit Hold

Do not rely on a short-lived Redis reservation as the sole accounting record.

Preferred:

```text
cloud_render_credit_holds
```

persistent DB-backed record.

Redis may be used for:

- locks;
- cache;
- fast availability checks;

but not as the only durable accounting record for a long render.

---

# 42. Credit Hold Lifecycle

```text
Render request
      │
      ▼
Estimate fully-loaded cost
      │
      ▼
Create credit hold
      │
      ├── insufficient credits → cloud render rejected
      │
      ▼
Cloud job eligible
      │
      ▼
Render
      │
      ▼
Artifact committed
      │
      ▼
Measure direct usage
      │
      ▼
Allocate shared cost
      │
      ▼
Calculate included retention cost
      │
      ▼
Apply 20% markup
      │
      ▼
Final credit settlement
      │
      ├── hold > final → refund difference
      ├── hold = final → settle
      └── hold < final → top-up/deduct difference
```

---

# 43. Hold Top-Up During Long Jobs

For long-running jobs, monitor projected charge.

If:

```text
projectedFinalChargeCredits
>= configurable threshold of held credits
```

attempt hold top-up.

Recommended threshold:

```text
85%
```

If top-up fails before the job is expected to exceed authorized credits:

- apply configured policy;
- recommended: request graceful cancellation before unauthorized spend grows materially.

---

# 44. Failure Billing Policy

## 44.1 Failure before paid Container starts

```text
charge = 0
refund = full hold
```

---

## 44.2 SmartSpec/Cloud infrastructure failure

Default:

```text
user charge = 0
refund = full hold
```

SmartSpecPro absorbs provider cost.

Examples:

- Container start failure;
- orchestration platform outage;
- internal packaging bug;
- callback infrastructure failure.

---

## 44.3 User-project invalidity

Recommended initial policy:

```text
charge = 0
```

unless a later product policy explicitly distinguishes user-caused repeated invalid workloads.

---

## 44.4 User cancellation after compute begins

Charge:

```text
fully-loaded attributable cost incurred up to cancellation
× 1.20
```

Do not include future artifact retention if no final artifact was successfully committed.

Refund unused hold.

---

## 44.5 Browser disconnect

Render continues.

Billing continues normally.

The browser session is not the execution owner.

---

# 45. Billing Idempotency

Use deterministic keys:

```text
cloud-render-hold:{renderJobId}:{assignmentAttempt}
cloud-render-topup:{renderJobId}:{assignmentAttempt}:{sequence}
cloud-render-settle:{renderJobId}:{assignmentAttempt}
cloud-render-refund:{renderJobId}:{assignmentAttempt}
```

Queue redelivery, callback retry, reconciliation retry, or Worker restart must not create duplicate credit transactions.

---

# 46. Proposed Database Additions

Exact names should match repository conventions.

---

## 46.1 Render job fields

```text
execution_preference
cloud_render_allowed
cloud_billing_accepted
cloud_billing_consent_version
cloud_billing_consent_at

cloud_dispatch_after

lease_owner_type
lease_owner_id
lease_owner_token
lease_expires_at
assignment_attempt

cloud_container_instance_id
cloud_container_application_id
cloud_container_region

credit_hold_id

estimated_direct_infra_cost_usd
estimated_shared_cost_usd
estimated_artifact_retention_cost_usd
estimated_billable_cost_usd
estimated_charge_credits

render_status
cleanup_status
billing_status

pricing_policy_version
shared_cost_policy_version
artifact_retention_policy_version
credit_conversion_version
```

Reuse equivalent existing fields where available.

---

## 46.2 `cloud_render_credit_holds`

```text
id
render_job_id
user_id
tenant_id

reserved_credits
topup_credits
settled_credits
refunded_credits

status

reservation_transaction_id
settlement_transaction_id
refund_transaction_id

created_at
updated_at
settled_at
```

---

## 46.3 `cloud_render_usage`

```text
id
render_job_id
assignment_attempt
container_instance_id

cpu_time_sec
allocated_memory_byte_seconds
allocated_disk_byte_seconds
tx_bytes
region

container_cost_usd
worker_cost_usd
durable_object_cost_usd
queue_cost_usd
workflow_cost_usd
r2_operation_cost_usd
temporary_r2_storage_cost_usd
observability_cost_usd

measured_direct_infrastructure_cost_usd
allocated_shared_infrastructure_cost_usd
guaranteed_artifact_retention_cost_usd

fully_loaded_attributable_cost_usd

markup_rate
markup_usd
billable_cost_usd

charged_credits

pricing_snapshot_json
shared_cost_snapshot_json
artifact_retention_snapshot_json
usage_snapshot_json

measurement_started_at
measurement_ended_at
reconciled_at
```

Financial columns must use decimal/numeric types.

---

## 46.4 `render_job_cleanup`

Suggested fields:

```text
id
render_job_id
assignment_attempt

local_workspace_deleted_at
r2_temp_deleted_at
container_stop_requested_at
container_stopped_at

cleanup_status
retry_count
last_error

created_at
updated_at
```

May be folded into existing job/audit model if repository conventions prefer.

---

# 47. Credit Source Type

Add canonical source type:

```text
cloud_render
```

Transaction metadata:

```json
{
  "renderJobId": "...",
  "assignmentAttempt": "...",
  "runtime": "cloudflare_container",
  "containerInstanceId": "...",

  "measuredDirectInfrastructureCostUsd": "0.0400",
  "allocatedSharedInfrastructureCostUsd": "0.0050",
  "guaranteedArtifactRetentionCostUsd": "0.0050",

  "fullyLoadedAttributableCostUsd": "0.0500",
  "markupRate": "0.20",
  "markupUsd": "0.0100",
  "billableCostUsd": "0.0600",

  "pricingPolicyVersion": "cf-render-2026-08-15-v2"
}
```

---

# 48. Runtime Type Extension

Add:

```text
cloudflare_remotion_container
```

or equivalent runtime identifier.

Conceptual registration:

```ts
cloudflare_remotion_container: {
  displayName: "Cloudflare Remotion Container",
  familyName: "Cloudflare Render",
  featureFlag: "cloudflareRemotionRender",
  registrationSupport: "managed",
  dispatchSupport: "feature_gated"
}
```

The Cloud runtime is SmartSpec-managed.

It is not a user-enrolled desktop device.

---

# 49. Internal APIs

Suggested endpoints or equivalent tRPC procedures.

## Control plane

```text
POST /internal/cloud-render/claim
POST /internal/cloud-render/jobs/:id/events
POST /internal/cloud-render/jobs/:id/artifacts
POST /internal/cloud-render/jobs/:id/complete
POST /internal/cloud-render/jobs/:id/fail
POST /internal/cloud-render/jobs/:id/renew-lease
POST /internal/cloud-render/jobs/:id/cleanup-complete
```

## Billing

```text
POST /internal/cloud-render/jobs/:id/meter
POST /internal/cloud-render/jobs/:id/reconcile
```

## User API

```text
GET  /api/cloud-render/settings
PUT  /api/cloud-render/settings

POST /api/render-jobs
GET  /api/render-jobs/:id
POST /api/render-jobs/:id/cancel
GET  /api/render-jobs/:id/cost
```

---

# 50. Security

## 50.1 Service authentication

Cloudflare Worker → SmartSpecPro must use dedicated service authentication.

Recommended:

- short-lived signed JWT/service token;
- timestamp;
- nonce/idempotency key;
- optionally mTLS where supported.

---

## 50.2 Signed render envelope

Container receives only its owned job.

Envelope includes:

```text
render job ID
assignment attempt
lease token
time-limited asset access
callback endpoint
trace ID
cleanup scope/root
```

Do not include permanent R2 credentials.

---

## 50.3 Asset access

Use:

- short-lived signed URLs;
- scoped bindings;
- job-scoped access grants.

---

## 50.4 Cleanup safety

Cleanup code must only operate inside:

```text
/work/jobs/{renderJobId}/{assignmentAttempt}/
```

and:

```text
render-temp/{renderJobId}/{assignmentAttempt}/
```

No wildcard deletion may target a parent project/account prefix.

---

# 51. Container Lifecycle

```text
claim granted
     │
     ▼
start Container
     │
     ▼
health/readiness
     │
     ▼
stage assets
     │
     ▼
render one job
     │
     ▼
upload final artifact
     │
     ▼
verify R2
     │
     ▼
commit artifact DB
     │
     ▼
mark render complete
     │
     ▼
cleanup job temp
     │
     ▼
report cleanup
     │
     ▼
stop Container
```

Do not keep a completed Container alive intentionally.

---

# 52. Retry Policy

Suggested:

```text
dispatch retries            = 5
container startup retries   = 3
render retries              = 1 or 2
cleanup retries             = durable / several
billing reconciliation      = durable / many
```

New render attempt requires new:

```text
assignmentAttempt
```

Each attempt has its own:

- lease;
- Container instance;
- temp prefix;
- usage boundary.

---

# 53. Usage Reconciliation Timing

Provider usage telemetry may lag behind artifact completion.

Therefore:

```text
render_status  = completed
billing_status = metering_pending
```

is valid.

User may access the final artifact once artifact commit succeeds, assuming a sufficient hold exists.

Billing reconciliation continues independently.

---

# 54. Cleanup Watchdog

Add a durable watchdog that finds:

```text
render_status = completed
AND
cleanup_status IN (pending, retry_required)
```

and retries:

- R2 temp deletion;
- Container local cleanup if still reachable;
- Container stop;
- orphan detection.

Also identify:

- Containers with no active canonical lease;
- expired cloud leases;
- jobs stuck in cleanup;
- temporary prefixes older than expected.

---

# 55. Billing Watchdog

Separate billing watchdog finds:

```text
billing_status IN (
  metering_pending,
  reconciling,
  billing_failed
)
```

Responsibilities:

- retry provider metric queries;
- calculate cost;
- settle/refund hold;
- detect stale unresolved holds;
- ensure one final ledger result.

---

# 56. Capacity and Concurrency

Initial production defaults:

```text
global max active cloud renders = 10
per tenant                      = 5
per user                        = 2
jobs per Container              = 1
minimum warm Containers         = 0
```

Admin-configurable.

Do not start one Container for every queued job if a configured ceiling is reached.

---

# 57. Container Size Selection

V1 may start with a benchmarked default such as:

```text
standard-3
2 vCPU
8 GiB RAM
16 GB disk
```

but must be configurable.

Future:

```text
remotion_economy
remotion_standard
remotion_heavy
```

Selected profile is persisted in the billing snapshot.

---

# 58. Cloud Render Cost Estimate Service

Add:

```ts
estimateCloudRenderCost(job): CloudRenderCostEstimate
```

Inputs:

```text
duration
resolution
FPS
layer count
video asset count/size
post-pass count
subtitle burn-in
historical render factor
instance profile
expected final artifact size
included retention days
shared allocation policy
```

Output:

```ts
interface CloudRenderCostEstimate {
  estimatedDirectInfrastructureCostUsd: string;
  estimatedSharedInfrastructureCostUsd: string;
  estimatedArtifactRetentionCostUsd: string;

  estimatedFullyLoadedCostUsd: string;
  estimatedBillableCostUsd: string;

  estimatedCredits: number;
  holdCredits: number;

  lowCredits: number;
  highCredits: number;

  modelVersion: string;
}
```

Show a range, not false precision.

---

# 59. Admin Settings

Add:

```text
cloudRender.enabled
cloudRender.dispatchEnabled

cloudRender.defaultInstanceType

cloudRender.globalConcurrency
cloudRender.perTenantConcurrency
cloudRender.perUserConcurrency

cloudRender.desktopGraceSeconds

cloudRender.markupRate = 0.20
cloudRender.holdSafetyFactor = 1.25
cloudRender.holdTopupThreshold = 0.85

cloudRender.creditsPerUsd

cloudRender.pricingPolicyVersion
cloudRender.sharedCostAllocationPolicyVersion
cloudRender.artifactRetentionPolicyVersion

cloudRender.includedArtifactRetentionDays = 30

cloudRender.maxJobRuntime
cloudRender.maxEstimatedCreditsPerJob

cloudRender.failureChargePolicy
cloudRender.userCancellationChargePolicy

cloudRender.tempR2LifecycleDays = 1
```

Emergency kill switch:

```text
cloudRender.dispatchEnabled = false
```

When disabled:

- no new cloud claims;
- existing Windows Worker still operates;
- active cloud jobs follow configured drain/cancel policy.

---

# 60. Observability

Metrics:

```text
cloud_render_jobs_queued
cloud_render_jobs_claimed
cloud_render_jobs_completed
cloud_render_jobs_failed
cloud_render_jobs_cancelled

cloud_render_active_containers
cloud_render_queue_wait_seconds
cloud_render_duration_seconds

cloud_render_cpu_seconds
cloud_render_memory_gib_seconds
cloud_render_disk_gb_seconds
cloud_render_egress_bytes

cloud_render_direct_cost_usd
cloud_render_shared_cost_usd
cloud_render_retention_cost_usd
cloud_render_fully_loaded_cost_usd
cloud_render_markup_usd
cloud_render_billable_cost_usd

cloud_render_credits_charged
cloud_render_credits_refunded
cloud_render_hold_topup_count

cloud_render_temp_bytes_deleted
cloud_render_cleanup_failures
cloud_render_orphan_containers

cloud_render_estimate_error_pct
```

Dashboards:

- cost per rendered minute;
- fully-loaded cost per rendered minute;
- markup realized;
- render-time/output-duration ratio;
- average credits/job;
- estimate accuracy;
- failure rate;
- cleanup backlog;
- orphan count;
- Cloud vs Desktop utilization.

---

# 61. Audit Events

```text
cloud_render_opt_in_changed
cloud_render_job_authorized
cloud_render_credit_hold_created
cloud_render_job_queued
cloud_render_job_claimed
cloud_render_container_started

cloud_render_artifact_uploaded
cloud_render_artifact_verified
cloud_render_artifact_committed

cloud_render_cleanup_started
cloud_render_temp_deleted
cloud_render_container_stop_requested
cloud_render_cleanup_completed
cloud_render_cleanup_failed

cloud_render_usage_measured
cloud_render_shared_cost_allocated
cloud_render_retention_cost_calculated

cloud_render_credit_settled
cloud_render_credit_refunded
cloud_render_credit_topup

cloud_render_job_failed
cloud_render_job_cancelled
```

Each carries correlation fields as allowed:

```text
traceId
renderJobId
tenantId
userId
assignmentAttempt
containerInstanceId
```

---

# 62. Feature Flags

Recommended:

```text
cloudflareRemotionRender
cloudflareRemotionDispatch
cloudRenderUserOptIn
cloudRenderUsageBilling
cloudRenderArtifactCleanup
cloudRenderRetentionBilling
```

Rollout:

1. Admin/internal;
2. selected tenant;
3. selected users;
4. general opt-in;
5. wider defaults only after operational maturity.

---

# 63. Backward Compatibility

Mandatory:

If:

```text
cloudflareRemotionRender = false
```

the application behaves as before.

No existing Desktop Worker registration, heartbeat, claim, render, artifact, or job protocol is removed.

Existing desktop-only queued jobs remain valid.

---

# 64. Suggested New Files

```text
apps/web/server/services/cloudRenderPolicyService.ts
apps/web/server/services/cloudRenderQueueService.ts
apps/web/server/services/cloudRenderBillingService.ts
apps/web/server/services/cloudRenderMeteringService.ts
apps/web/server/services/cloudRenderCostEstimator.ts
apps/web/server/services/cloudRenderCleanupService.ts
apps/web/server/services/cloudRenderRetentionService.ts
apps/web/server/services/cloudRenderSharedCostService.ts

apps/web/shared/cloudRender.ts

cloudflare/remotion-dispatcher/
  src/index.ts
  src/container.ts
  src/cleanup.ts
  wrangler.jsonc
  Dockerfile

packages/remotion-render-cloudflare/
  src/cloudflareRenderAdapter.ts
  src/cloudflareStorageAdapter.ts
  src/cloudflareProgressAdapter.ts
  src/cloudflareCleanupAdapter.ts
```

Prefer not to create `packages/remotion-render-cloudflare` if simple adapters can live cleanly elsewhere.

---

# 65. Likely Modified Files

Review:

```text
apps/web/shared/workerRuntime.ts
apps/web/server/services/workerDelegationService.ts
apps/web/server/services/creditService.ts
apps/web/drizzle/schema.ts

render job router/service
render queue service
artifact service
R2/storage service

user settings UI
render dialog UI
Admin settings UI

packages/remotion-render/*
```

Do not alter Windows Worker behavior except where necessary to share the unified lease contract.

---

# 66. Migration Strategy

## Phase 1 — Cloud Render MVP

Implement:

- execution preferences;
- explicit billing consent;
- persistent credit hold;
- atomic Cloud/Desktop claim;
- Cloudflare Queue dispatcher;
- Cloudflare Container;
- Remotion + Chromium + FFmpeg;
- R2 final artifact upload;
- artifact verification;
- unified artifact record;
- basic cleanup;
- Container stop;
- static/versioned pricing policy;
- fully-loaded billing components.

Admin-only initially.

---

## Phase 2 — Production Metering and Cleanup

Implement:

- provider usage ingestion;
- instance-level metering;
- shared cost allocation;
- retention cost calculation;
- cleanup watchdog;
- billing watchdog;
- orphan Container detection;
- R2 lifecycle safety net;
- cancellation settlement;
- Admin cost dashboard.

---

## Phase 3 — Smart Routing

Implement:

- desktop health-aware routing;
- desktop grace period;
- automatic Cloud fallback;
- adaptive instance sizing;
- historical estimate model;
- hold top-up prediction.

---

## Phase 4 — Tablet/Web General Rollout

Enable Cloud Render opt-in for users without Desktop Worker.

UI should make clear:

```text
No PC required
Cloud credits apply
```

---

# 67. Acceptance Criteria

## AC-1 — Windows Worker unchanged

Given Cloud Render is disabled, existing Windows Worker renders exactly as before.

---

## AC-2 — Tablet-only success

Given no Windows Worker exists and user selects/authorizes Cloud Render:

```text
browser/tablet
→ SmartSpecPro
→ Cloudflare Worker
→ Cloudflare Container
→ R2
```

produces a valid final MP4.

---

## AC-3 — Same artifact UX

Cloud-rendered final video appears through the same normal SmartSpecPro artifact/download experience as Desktop-rendered output.

---

## AC-4 — No billing consent, no paid cloud compute

If billing consent is missing, Cloud Dispatcher cannot obtain a claim/start paid compute.

---

## AC-5 — Insufficient credits

If credit hold fails, Cloud Container must not start.

---

## AC-6 — No duplicate render

Desktop and Cloud cannot simultaneously own the same assignment attempt.

---

## AC-7 — Artifact commit before complete

Job cannot become user-visible `completed` until final artifact:

- exists in R2;
- is verified;
- has a committed SmartSpecPro artifact record.

---

## AC-8 — Cleanup temp data

After successful final artifact commit:

```text
/work/jobs/{jobId}/{attempt}/
```

and:

```text
render-temp/{jobId}/{attempt}/
```

are removed.

Original project assets remain.

---

## AC-9 — Stop Container

Completed or terminally failed Cloud jobs do not leave an intentionally idle Container running.

---

## AC-10 — Cleanup failure does not hide valid artifact

A valid successful artifact remains available even if cleanup retries are required.

---

## AC-11 — R2 safety-net lifecycle

Orphaned `render-temp/` objects are eventually removed by R2 lifecycle policy.

---

## AC-12 — Fully-loaded billing

Successful job final charge equals:

```text
(
  measured direct attributable infrastructure
  + allocated shared infrastructure
  + guaranteed artifact retention
)
× 1.20
```

converted using the job's stored credit conversion snapshot.

---

## AC-13 — Unused hold refunded

Unused held credits are returned exactly once.

---

## AC-14 — Infrastructure failure refund

Default SmartSpec/Cloud infrastructure failure policy results in full user refund.

---

## AC-15 — Cancellation settlement

User cancellation after paid compute begins settles only incurred eligible cost under cancellation policy.

No final artifact retention charge is applied if no final artifact was committed.

---

## AC-16 — Browser disconnect independence

Closing the browser/tablet does not stop server-side rendering.

---

## AC-17 — Long-term storage separated

A one-time Cloud Render charge does not imply indefinite R2 artifact storage.

Artifact retention after included period follows SmartSpecPro storage policy.

---

## AC-18 — Billing auditability

Admin can trace:

```text
job
→ attempt
→ Container
→ usage
→ direct cost
→ shared cost
→ retention cost
→ markup
→ final credits
→ ledger transaction
```

---

# 68. Test Plan

## 68.1 Unit Tests

Test:

- cloud policy evaluation;
- execution preference;
- consent;
- atomic lease logic;
- file classification;
- allowed cleanup roots;
- direct cost formula;
- shared cost allocation;
- artifact retention calculation;
- fully-loaded cost;
- 20% markup;
- credit conversion;
- hold sizing;
- refund;
- top-up;
- idempotency;
- rounding.

---

## 68.2 Integration Tests

Test:

- Desktop claims before Cloud;
- Cloud claims before Desktop;
- duplicate queue message;
- expired lease;
- Container startup retry;
- progress callbacks;
- artifact upload;
- R2 verification;
- artifact DB commit;
- cleanup;
- Container stop;
- provider metrics delayed;
- billing reconciliation;
- hold top-up failure;
- cancellation;
- orphan Container watchdog.

---

## 68.3 Cleanup Tests

### Successful job

Expected:

```text
project assets              KEEP
final artifact              KEEP
render-temp prefix          DELETE
Container workspace         DELETE
Container                   STOP
```

### Failed job

Expected:

```text
project assets              KEEP
incomplete final artifact   NOT PUBLISHED
render-temp                 DELETE
Container workspace         DELETE
Container                   STOP
```

### Cleanup API failure

Expected:

```text
render remains completed
cleanup_status = retry_required
watchdog retries
```

### Cleanup process permanently misses R2 temp

Expected:

```text
R2 lifecycle rule expires temp objects
```

---

## 68.4 Billing Fixture Tests

Use exact Decimal fixtures for:

```text
cpuTimeSec
allocatedMemoryByteSeconds
allocatedDiskByteSeconds
txBytes

worker cost
DO cost
Queue cost
Workflow cost
R2 operation cost

shared allocation
artifact bytes
retention days

pricing snapshot
credits per USD
```

Assert exact final credits.

---

## 68.5 End-to-End Scenarios

### Scenario A — Windows only

```text
Windows online
desktop_only
```

Expected:

```text
Windows render
no Cloud Render charge
```

---

### Scenario B — Desktop preferred fallback

```text
Windows unavailable
desktop_preferred
cloud consent yes
```

Expected:

```text
Cloud Render
final R2 artifact
fully-loaded charge + 20%
```

---

### Scenario C — Tablet only

```text
no Windows Worker
cloud_only
```

Expected:

```text
successful final MP4
same artifact UX
no desktop dependency
```

---

### Scenario D — Duplicate cloud queue delivery

Expected:

```text
one active assignment
one Container execution
one credit settlement
```

---

### Scenario E — Container crash

Expected:

```text
retry/failure policy
no duplicate charge
cleanup attempted
orphan watchdog
correct refund
```

---

### Scenario F — Artifact upload succeeds, cleanup fails

Expected:

```text
user sees completed artifact
cleanup_status = retry_required
watchdog cleans later
```

---

### Scenario G — User closes tablet browser

Expected:

```text
render continues
artifact available when user returns
```

---

# 69. Operational Safety Rules

1. Never remove the Windows Worker lane as part of this feature.
2. Never start paid Cloud compute before credit authorization succeeds.
3. Never trust a Queue message as proof of ownership.
4. Never let Desktop and Cloud execute the same assignment attempt.
5. Never treat project assets as job temporary files.
6. Never mark user-visible completion before final R2 artifact verification and DB commit.
7. Never leave job temporary files as intentional long-term storage.
8. Never rely only on R2 lifecycle for normal cleanup.
9. Never keep a completed Container alive unnecessarily.
10. Never charge final billing from the estimate.
11. Never define "actual cost" as Container CPU only.
12. Never imply one render fee covers indefinite artifact storage.
13. Never use provider monthly free allowance to randomly change per-user pricing.
14. Never rely solely on an expiring Redis hold for long renders.
15. Never allow retries to duplicate credit charges/refunds.
16. Always keep an Admin dispatch kill switch.
17. Always retain billing policy snapshots for audit.

---

# 70. Recommended Initial Configuration

```text
cloudRender.enabled=true
cloudRender.dispatchEnabled=false

cloudRender.defaultInstanceType=standard-3

cloudRender.globalConcurrency=10
cloudRender.perTenantConcurrency=5
cloudRender.perUserConcurrency=2

cloudRender.desktopGraceSeconds=15

cloudRender.markupRate=0.20
cloudRender.holdSafetyFactor=1.25
cloudRender.holdTopupThreshold=0.85

cloudRender.includedArtifactRetentionDays=30
cloudRender.tempR2LifecycleDays=1

cloudRender.failureChargePolicy=refund_full
cloudRender.userCancellationChargePolicy=incurred_fully_loaded_cost_plus_markup
```

`creditsPerUsd` must come from SmartSpecPro's commercial credit policy.

Shared-cost allocation parameters must be configured from observed production spend.

---

# 71. Key Design Decision Summary

## Windows

```text
Windows Worker
= preserved
= existing/local execution lane
= no forced Cloud billing
```

## Cloudflare Worker

```text
Cloudflare Worker
= queue consumer / dispatcher
= policy/claim coordinator
= not the renderer
```

## Cloudflare Container

```text
Cloudflare Container
= Remotion + Chromium + FFmpeg execution plane
```

## R2

```text
R2
= project assets
= final artifacts
= temporary job objects with short lifecycle
```

with strict namespace/lifecycle separation.

## SmartSpecPro Control Plane

```text
SmartSpecPro
= canonical job state
= execution policy
= atomic lease
= credit hold
= billing settlement
= artifact record
= cleanup/billing watchdog
```

---

# 72. Final Cloud Job Eligibility Rule

A Cloud job is allowed only when:

```text
tenant allows cloud
AND
user/job allows cloud
AND
billing consent exists
AND
credit hold succeeds
AND
concurrency/budget policy allows it
AND
atomic cloud claim succeeds
```

---

# 73. Final Artifact Lifecycle

```text
render
  ↓
final.mp4
  ↓
upload to R2
  ↓
verify R2
  ↓
commit SmartSpec artifact
  ↓
render_status = completed
  ↓
user sees normal R2-backed download/playback
  ↓
delete job temp
  ↓
stop Container
```

Only:

```text
project assets
+
committed final artifacts
```

remain.

---

# 74. Final Billing Lifecycle

```text
measured direct attributable infrastructure
        +
allocated shared infrastructure
        +
included final-artifact retention
        ↓
fullyLoadedAttributableCostUsd
        ↓
× 1.20
        ↓
billableCostUsd
        ↓
convert to credits
        ↓
settle persistent hold
        ↓
refund or top-up difference
```

This replaces the earlier simplified:

```text
Container cost × 1.20
```

model.

---

# 75. Definition of Done

The feature is complete when:

- a tablet-only user can render and receive a final Remotion MP4 without Windows Worker;
- the existing Windows Worker still works unchanged;
- Cloud rendering is explicit opt-in;
- paid compute cannot start without authorization;
- Desktop and Cloud cannot execute the same attempt;
- Cloud output uses the same R2-backed artifact UX as Desktop output;
- final artifact is verified before completion;
- per-job temporary files are deleted after artifact commit;
- original project assets are never deleted by render cleanup;
- completed Containers are stopped;
- orphan temp data has a lifecycle safety net;
- Cloud billing uses fully-loaded attributable cost +20%;
- long-term artifact storage is not silently subsidized by one-time render billing;
- billing is idempotent and auditable;
- Admin can stop new Cloud dispatch instantly without disabling Windows rendering.
