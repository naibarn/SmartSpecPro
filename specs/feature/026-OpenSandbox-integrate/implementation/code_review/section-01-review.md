# Section 01 Code Review

## HIGH SEVERITY

### 1. opensandbox-server attached to opensandbox-exec network
Server on exec network creates path between privileged server and sandbox containers. Plan shows server only on opensandbox-network. Counter-argument: network won't be created by Docker Compose if no service references it.

### 2. Service count includes celery-import (unrelated change)
The celery-import additions in the diff are from existing dirty working tree, not this section's changes.

## MEDIUM SEVERITY

### 3. wait_for_sandbox() reports misleading elapsed time
Sleeps 2s per attempt but reports `${attempt}s` as if 1s per attempt.

### 4. start_sandbox() swallows docker compose errors
Both stdout and stderr suppressed. User gets no feedback on failures.

### 5. Healthcheck assumes curl in OpenSandbox image
May not be available in minimal images.

### 6. No docker compose project name for sandbox
Media workers use `-p smartspecpro` but sandbox doesn't.

## LOW SEVERITY

### 7-10. Plan test commands, URL alignment, celery-import scope, default API key
Minor issues or addressed in other sections.
