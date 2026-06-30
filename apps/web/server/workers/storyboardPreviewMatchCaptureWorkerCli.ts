import { runStoryboardPreviewMatchCaptureJob } from "./storyboardPreviewMatchCaptureWorker";

function getArgValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const captureJobId = getArgValue("--capture-job-id")?.trim();
  if (!captureJobId) throw new Error("--capture-job-id is required");
  await runStoryboardPreviewMatchCaptureJob({ captureJobId });
  console.info("[StoryboardPreviewMatchCaptureWorkerCli] completed", { captureJobId });
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error(
      "[StoryboardPreviewMatchCaptureWorkerCli] failed",
      error instanceof Error ? error.stack || error.message : error,
    );
    process.exit(1);
  });
