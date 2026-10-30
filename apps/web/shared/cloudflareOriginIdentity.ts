import { z } from "zod";

export const cloudflareOriginIdentitySchema = z.object({
  tenantId: z.string().trim().min(1).max(36),
  projectId: z.string().trim().min(1).max(100),
  environment: z.enum(["staging", "production"]),
  provider: z.literal("cloudflare"),
}).strict();

export const cloudflareOriginReferenceSchema = cloudflareOriginIdentitySchema.extend({
  configurationRef: z.string().regex(/^cf-origin:[a-f0-9]{64}$/),
});

// Shared by the API and browser request contract tests; mocked transport must
// not accept payloads that the serving mutation rejects.
export const cloudflareStagingActivationInputSchema = cloudflareOriginReferenceSchema.extend({
  environment: z.literal("staging"),
  profile: z.enum(["namespace-only", "full-application-http"]).default("namespace-only"),
  workflowRuntimeToken: z.string().min(32).max(4096).optional(),
  controlPlaneToken: z.string().min(32).max(4096).optional(),
}).strict().superRefine((value, ctx) => {
  if (Boolean(value.workflowRuntimeToken) !== Boolean(value.controlPlaneToken)) {
    ctx.addIssue({ code: "custom", message: "Both runtime secrets must be supplied together" });
  }
});
