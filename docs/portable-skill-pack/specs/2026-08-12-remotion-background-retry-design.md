# Remotion background render retry design

## Goal

Keep Remotion renders in the background while a Worker App is queued or rendering, and recover automatically from transient asset/network/render failures. A real permanent failure must still become a truthful terminal error.

## Contract

- A queued `remotion_render_video` job may wait up to 60 minutes before the episode-level reconciliation path reports that no Worker App accepted it.
- The Worker App sidecar gives each render up to 10 minutes per attempt and performs at most three attempts.
- Retry backoff is 20 seconds before attempt 2 and 60 seconds before attempt 3.
- Retry is limited to transient timeout, network, proxy, browser-launch, and upload symptoms. Contract errors, missing compositions, 4xx/404 assets, checksum mismatches, and invalid output are not retried.
- The sidecar emits progress during retry and emits one terminal failure only after the retry budget is exhausted.
- The worker job timeout is at least 60 minutes so the job-level lease/orphan logic does not terminate a render while the sidecar is still within its retry budget.

## Data flow

The existing flow remains unchanged: the server inserts one idempotent worker job, the Worker App claims it, the Remotion sidecar executes the render, and the server reconciles the terminal worker status into the episode manifest. Retry is inside the sidecar so a retry does not create a second worker job, reserve credits again, or require the client to resubmit.

## Failure handling

Queued/running states remain non-error. Transient failures are logged and represented as progress messages. Permanent failures and exhausted transient failures are recorded with the final typed failure code and message. A page refresh continues polling the same durable job id.

## Verification

Focused tests cover successful retry, retry exhaustion, permanent no-retry behavior, the expanded queue timeout, and the 60-minute queued reconciliation boundary. Runtime release packaging continues to copy the tracked sidecar source into the installed runtime pack.
