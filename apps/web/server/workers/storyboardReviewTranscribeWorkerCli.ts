import { runStoryboardReviewTranscribeJob } from "../services/storyboardReviewTranscriptionJobs";

function getArgValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const jobId = getArgValue("--job-id")?.trim();
  if (!jobId) throw new Error("--job-id is required");
  await runStoryboardReviewTranscribeJob(jobId);
  console.info("[StoryboardReviewTranscribeWorkerCli] completed", { jobId });
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error(
      "[StoryboardReviewTranscribeWorkerCli] failed",
      error instanceof Error ? error.stack || error.message : error,
    );
    process.exit(1);
  });
