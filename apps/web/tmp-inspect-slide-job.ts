import "dotenv/config";
import { desc, eq } from "drizzle-orm";

import { getDb } from "./server/db";
import { sandboxArtifacts, sandboxJobs } from "./drizzle/schema";
import { getJobArtifactUrls } from "./server/services/sandbox/artifactAccess";
import { storageReadText } from "./server/storage";

async function main() {
  const db = getDb();
  const recentJobs = await db
    .select({
      id: sandboxJobs.id,
      tenantId: sandboxJobs.tenantId,
      status: sandboxJobs.status,
      createdAt: sandboxJobs.createdAt,
      outputManifestJson: sandboxJobs.outputManifestJson,
      stdoutExcerpt: sandboxJobs.stdoutExcerpt,
      stderrExcerpt: sandboxJobs.stderrExcerpt,
    })
    .from(sandboxJobs)
    .orderBy(desc(sandboxJobs.createdAt))
    .limit(8);

  console.log("RECENT JOBS");
  for (const job of recentJobs) {
    console.log(JSON.stringify(job, null, 2));
  }

  const target = recentJobs[0];
  if (!target) {
    console.log("No jobs found");
    return;
  }

  console.log("\nTARGET JOB", target.id, "tenant", target.tenantId);
  const urls = await getJobArtifactUrls({
    jobId: target.id,
    tenantId: target.tenantId,
  });
  console.log("\nARTIFACT URL ROWS");
  console.log(JSON.stringify(urls, null, 2));

  const artifactRows = await db
    .select({
      id: sandboxArtifacts.id,
      sandboxJobId: sandboxArtifacts.sandboxJobId,
      artifactType: sandboxArtifacts.artifactType,
      objectKey: sandboxArtifacts.objectKey,
      mimeType: sandboxArtifacts.mimeType,
      isPrimary: sandboxArtifacts.isPrimary,
      metadataJson: sandboxArtifacts.metadataJson,
      createdAt: sandboxArtifacts.createdAt,
    })
    .from(sandboxArtifacts)
    .where(eq(sandboxArtifacts.sandboxJobId, target.id))
    .orderBy(desc(sandboxArtifacts.createdAt));
  console.log("\nARTIFACT ROWS");
  console.log(JSON.stringify(artifactRows, null, 2));

  for (const artifact of artifactRows) {
    if (!String(artifact.objectKey).toLowerCase().endsWith(".json")) {
      continue;
    }
    const text = await storageReadText(artifact.objectKey);
    console.log(`\nJSON ARTIFACT ${artifact.objectKey}`);
    console.log(text?.slice(0, 4000) ?? null);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
