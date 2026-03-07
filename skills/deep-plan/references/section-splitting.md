# Parallel Section File Writing

Write section files using parallel subagents. By this point you have:
- Expected tasks from step 19 including batch coordination tasks (`batch-N`)
- Individual section tasks (`section-{name}`) for each section
- All sections within a batch depend on the batch task (parallel within batch)

**How it works:** On platforms with sub-agent support, section tasks can run in parallel. On platforms without it, write the same section files sequentially. In all cases, save each section file directly to disk as soon as it is complete.

## Task Structure

Section tasks use batch parallelism:
- **Batch tasks** (`batch-1`, `batch-2`, etc.) coordinate each batch
- **Section tasks** (`section-01-setup`, etc.) depend only on their batch task, not on each other
- This means all sections in a batch can run in parallel

```
batch-1 (depends on create-section-index)
 ├─► section-01-setup ─┐
 ├─► section-02-core  ─┼─► (all parallel, all depend on batch-1)
 └─► section-03-api   ─┘

batch-2 (depends on batch-1)
 ├─► section-04-tests ─┐
 └─► section-05-docs  ─┴─► (all parallel, all depend on batch-2)

final-verification (depends on last batch)
output-summary (depends on final-verification)
```

## Batch Execution Loop

For each batch:

### 1. Mark Batch Task In Progress

Find the batch task by subject "Run batch N section subagents" and mark it in progress:
```
TaskUpdate(taskId=<batch_task_id>, status="in_progress")
```

### 2. Prepare Batch Prompts

Build one prompt or task brief per section in the batch. Each prompt should contain:
- the section title and output filename
- the relevant excerpts from `implementation-plan.md` and `implementation-plan-tdd.md`
- any cross-section dependency notes from `sections/index.md`

If you keep prompt files on disk, store them under `<planning_dir>/sections/.prompts/`.

### 3. Launch Parallel Task Subagents

**IMPORTANT:** Launch ALL Task calls in a single message to run them in parallel.

If the platform exposes a sub-agent tool, launch one agent per section in a single batch. If it does not, write the same sections sequentially inline.

For each section task, include:
- section filename
- section-specific brief
- required dependencies / prior sections
- expected output file path

Example: If the batch has 5 sections and sub-agents are available, send a single dispatch batch with 5 section-writing tasks.

### 4. Verify Files Were Written

**Section files must be written explicitly to disk.** After each subagent (or inline section-writing pass) completes:
1. Save the returned content to `{planning_dir}/sections/{filename}`
2. Verify the file exists and is non-empty
3. Record completion before continuing to the next section

After all subagents in the batch complete, check which files were created:

```bash
ls {planning_dir}/sections/
```

Compare against expected filenames from the batch. For each file that exists:
- Mark the section task complete (find task by subject "Write {filename}"):
  ```
  TaskUpdate(taskId=<section_task_id>, status="completed")
  ```

### 5. Handle Missing Files

If any expected files are missing after subagents complete:

**Step 1: Retry the same section brief**
Re-dispatch or re-run only the missing section with the same prompt plus any failure context.

**Step 2: Manual fallback**
If the file is still missing after retry, write the section manually:
1. Reuse the section brief and plan artifacts
2. Draft the section content directly
3. Write to `{planning_dir}/sections/{filename}`

### 6. Mark Batch Complete

After all section files in the batch are verified, mark the batch task complete:
```
TaskUpdate(taskId=<batch_task_id>, status="completed")
```

### 7. Next Batch

If there are more batches, repeat from step 1 with the next batch number.

## Final Verification

After all batches complete, verify completion manually:
- every manifest entry in `sections/index.md` has a corresponding file
- the file count matches the manifest
- no section file is empty or missing required headings

## Section File Requirements

Each section file must be **completely self-contained**. The implementer should be able to read only that section file, create a task list, and start implementing immediately without referencing any other documents.

## Debugging

If sections aren't being written:

1. **Check sections dir:** `ls {planning_dir}/sections/` - see what was written
2. **Check prompt files:** `{planning_dir}/sections/.prompts/` - review what was sent to the section writer
3. **Check section drafts or sub-agent output:** use the returned output as the manual fallback source

## Prompt Files

If you choose to store full prompt files in `<planning_dir>/sections/.prompts/`, keep them for debugging. They make retries and manual fallback much easier.
