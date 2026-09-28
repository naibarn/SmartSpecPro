# Vertical Drama storage-capacity error handling

## Goal

Classify `ENOSPC`/disk-quota failures during Vertical Drama video assembly as
storage-capacity failures rather than application bugs. Tell the user which
render filesystem is full when the runtime can determine it, and avoid the
automatic Admin Feedback workflow for this expected operational condition.

## Design

Use a small shared, machine-readable error contract with the stable code
`storage_capacity_exhausted`. Server-side render paths enrich that code with a
safe mount label, capacity kind (bytes/inodes/unknown), and best-effort
available capacity from the path that failed. Absolute filesystem paths are
not sent to the user; only a mount/drive label such as `/tmp`, `/`, or `C:\\`
is exposed.

The contract is applied at all assembly boundaries in scope:

1. Remotion preflight asset staging, including failure to create its temp
   directory.
2. The asynchronous ffmpeg assembly job, including failure to create its temp
   directory, stage assets, run ffmpeg, or write the final artifact.
3. Remotion worker terminal failures reconciled back into the episode state.

The persisted `compiledVideo.error` retains the machine-readable code and
diagnostic fields so a later page load can render the same user-facing copy.
The client-side system error monitor recognizes the same code, shows a
storage-specific toast without a report action, and does not add the event to
the feedback diagnostics ring. The compiled-video panel uses the same pure
formatter for durable failures.

## UI/UX contract

### Target user / JTBD

- Role: Vertical Drama creator.
- Goal: Understand why video assembly failed and what to fix.
- Entry point: episode assembly action or the persisted compiled-video panel.
- Success outcome: the creator sees the affected render storage label and can
  retry after space is freed, without being asked to report an infrastructure
  condition as a product bug.

### Existing pattern reference

- Search: targeted `rg` for `systemErrorMonitor`, `compiledVideoFailed`, and
  existing Vertical Drama error states.
- Found: `apps/web/client/src/lib/systemErrorMonitor.ts` and the failed-state
  branch in `VerticalDramaStoryboardPanel.tsx`.
- Decision: reuse their existing toast and durable failed-state interaction;
  diverge only in storage-specific copy and removal of the report action.

### Surface inventory

| Surface | File/route | Change |
| --- | --- | --- |
| Global error toast | `systemErrorMonitor.ts` | Storage-specific Thai copy; no report action/ring entry |
| Compiled-video failed state | `VerticalDramaStoryboardPanel.tsx` | Format persisted storage error and keep retry |

### Component map

| Component | File | Owns | Consumes |
| --- | --- | --- |
| System error monitor | `client/src/lib/systemErrorMonitor.ts` | Immediate toast classification | Shared storage error contract |
| Compiled-video panel | `client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx` | Durable error presentation/retry | Persisted `compiledVideo.error` |

### State matrix

| State | Expected UI | Verification |
| --- | --- | --- |
| loading | Existing assembly progress state | Existing component behavior |
| error | Clear storage label and remediation; no report action | Client unit test + formatter test |
| success | Existing compiled-video success state | Existing assembly suite |
| retry/disabled | Existing retry button remains available/disabled while running | Existing component behavior |

### Responsive/accessibility/visual direction

- Responsive: reuse the existing panel layout at mobile, tablet, laptop, and
  desktop sizes; no new fixed-width content is introduced.
- Accessibility: reuse existing toast semantics and retry button label/focus
  behavior; no icon-only control is added.
- Visual direction: existing destructive error styling and compact copy; no new
  tokens or motion.

### Copy contract

- Thai primary copy names the mount/drive when known, distinguishes inode
  exhaustion, and tells the user to free space and retry.
- English fallback uses the same storage label and remediation.
- If inspection cannot identify a mount, copy says temporary render storage
  rather than inventing a disk name.

### Browser evidence required

Follow `orchestra/ui-browser-evidence.md`; browser automation was not available
in this run, so required viewport checks are recorded as skipped rather than
claimed as passed.

## Failure and fallback behavior

Storage-capacity failures are terminal for the current render attempt, remain
retryable after the operator frees space, and are not silently converted into
a generic Remotion/ffmpeg bug. Other errors keep their existing behavior.
When mount inspection is unavailable, the message says that temporary render
storage is full rather than inventing a drive name.

## Verification

Add pure contract tests for detection, mount/detail parsing, bilingual copy,
and feedback suppression. Add server tests for temp-directory and staging
failure normalization, plus the existing Remotion/assembly suites. Run
focused tests and the affected TypeScript check; browser/provider/production
replay remain separate evidence boundaries.
