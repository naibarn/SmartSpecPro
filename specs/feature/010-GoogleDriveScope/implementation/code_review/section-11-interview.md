# Section 11 Code Review Interview

## Auto-Fixed Issues

### Fix 1: Enqueue indexing job after creating virtual reference (#8)
`_create_virtual_reference` now calls `process_google_drive_index_job_task.delay(item_id)` after inserting or updating. Files will actually be indexed for RAG search.

### Fix 2: Re-index modified files (#9)
When a file already exists in library_items, instead of returning early, the function now updates `syncStatus` to "pending" and enqueues a re-indexing job.

### Fix 3: datetime.utcnow() → datetime.now(timezone.utc) (#10)
Fixed deprecated datetime calls in `setup_watch_channel`.

### Fix 4: Check autoSyncEnabled in webhook handler (#11)
Added `if (!syncState.autoSyncEnabled) return;` check before enqueueing changes processing.

### Fix 5: Progress count includes failed files (#14)
Changed progress tracking to use `total_done = files_processed + len(failed_files)` so progress bar reaches 100%.

### Fix 6: Remove unused imports and variables (#16, #22)
Removed unused `and` import from webhooks.ts. Removed unused `proxy_token` and `node_backend` variables.

### Fix 7: ON CONFLICT on INSERT (#24)
Added `ON CONFLICT DO NOTHING` to the virtual reference INSERT to prevent race condition duplicates.

## Let-Go Issues (Accepted)

- #1 (nginx): nginx config was already modified but was inadvertently unstaged. Not adding to avoid mixing unrelated changes.
- #2 (beat task name): FALSE POSITIVE - existing `cleanup_expired_edit_sessions` beat entry uses short name and works fine.
- #5 (webhook mount order): CSRF already exempts no-Origin requests, which covers Google webhooks.
- #6 (feature flags): Out of scope - this is Section 13's responsibility.
- #7 (folderSelections shape): Storing just IDs is correct per schema. Folder names can be fetched from Drive API.
- #13 (lists all files): Optimization for selected_folders can come later.
- #17-19 (missing UI/tests): UI is Section 12. Webhook vitest is lower priority.
- #23 (estimateSyncCost as mutation): It calls Python backend which does API calls, so mutation is acceptable.
