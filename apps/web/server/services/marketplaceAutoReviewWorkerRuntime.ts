import crypto from "node:crypto";

import { signBearerToken } from "../_core/tokens";
import { getAppRuntimeConfig } from "./appRuntimeConfig";

export function createMarketplaceAutoReviewWorkerToken(input: {
  userId: number;
  tenantId: string;
  runId: string;
  jobId: string;
}) {
  return signBearerToken(
    {
      sub: String(input.userId),
      user_id: input.userId,
      tenantId: input.tenantId,
      type: "access",
      tokenUse: "marketplace_auto_review_background",
      scopes: ["media:generate"],
      jti: `marketplace_auto_review_${input.runId}_${input.jobId}_${crypto.randomBytes(8).toString("hex")}`,
    },
    "65m"
  );
}

export async function createMarketplaceAutoReviewWorkerRuntime(input: {
  userId: number;
  tenantId: string;
  runId: string;
  jobId: string;
  schedulerSource: string;
}) {
  const config = await getAppRuntimeConfig();
  return {
    userToken: createMarketplaceAutoReviewWorkerToken(input),
    publicUrl: config.publicUrl,
    automationWorkerId: `worker_jobs:${input.jobId}`,
    schedulerSource: input.schedulerSource,
  };
}
