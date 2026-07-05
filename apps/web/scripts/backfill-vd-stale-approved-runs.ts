import "dotenv/config";
import { getDb, db } from "../server/db";
import { eq } from "drizzle-orm";
import {
  verticalDramaEpisodeRuns,
  verticalDramaApprovalCheckpoints,
} from "../drizzle/schema";

/**
 * One-off backfill for the "approve loop" bug found 2026-07-05:
 * `approveCheckpoint` never updated the run row that produced the
 * checkpoint, so any run whose checkpoint was already approved BEFORE the
 * fix landed is still frozen at status="approval_required" / nextAction=
 * "approve" — and since the client only attaches a checkpointId to a stage
 * when a checkpoint is still "pending", clicking Approve on these already-
 * approved-but-stale rows is a client-side no-op (the fix in
 * `approveCheckpoint` itself never even gets invoked). This directly patches
 * every such row once.
 */
async function main() {
  getDb();
  const checkpoints = await db.select().from(verticalDramaApprovalCheckpoints);
  let patched = 0;
  for (const cp of checkpoints) {
    if (cp.state !== "approved" && cp.state !== "rejected") continue;
    const [run] = await db
      .select()
      .from(verticalDramaEpisodeRuns)
      .where(eq(verticalDramaEpisodeRuns.id, cp.runId))
      .limit(1);
    if (!run) continue;
    if (cp.state === "approved" && run.status === "approval_required") {
      const nextAction =
        cp.stage === "create_storyboard_review_project"
          ? "open_storyboard_review"
          : cp.stage === "summarize_episode_to_series_memory"
            ? "none"
            : "resume_next_stage";
      console.log(
        `Patching run ${run.id} (episode ${run.episodeId}, stage ${cp.stage}): status ${run.status}->succeeded, nextAction ${run.nextAction}->${nextAction}`,
      );
      await db
        .update(verticalDramaEpisodeRuns)
        .set({ status: "succeeded", nextAction, updatedAt: new Date() })
        .where(eq(verticalDramaEpisodeRuns.id, run.id));
      patched++;
    } else if (cp.state === "rejected" && run.status === "approval_required") {
      console.log(
        `Patching run ${run.id} (episode ${run.episodeId}, stage ${cp.stage}): status ${run.status}->failed (rejected), nextAction ${run.nextAction}->repair`,
      );
      await db
        .update(verticalDramaEpisodeRuns)
        .set({ status: "failed", nextAction: "repair", updatedAt: new Date() })
        .where(eq(verticalDramaEpisodeRuns.id, run.id));
      patched++;
    }
  }
  console.log(`Done. ${patched} run row(s) patched out of ${checkpoints.length} checkpoint(s) inspected.`);
  process.exit(0);
}
main().catch(e => {
  console.error(e);
  process.exit(1);
});
