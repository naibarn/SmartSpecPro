import { z } from "zod";

export const marketplaceConnectorTenantConfigSchema = z.object({
  liveProbeUrl: z.string().trim().url().or(z.literal("")).default(""),
  liveProbeToken: z.string().trim().max(4096).optional().default(""),
  fixtureFallbackEnabled: z.boolean().default(false),
  activeGrantTtlDays: z.coerce.number().int().min(1).max(365).default(90),
});

export const maskedMarketplaceConnectorTenantConfigSchema = marketplaceConnectorTenantConfigSchema
  .omit({ liveProbeToken: true })
  .extend({
    liveProbeTokenConfigured: z.boolean().default(false),
    liveProbeTokenHint: z.string().nullable().default(null),
  });

export type MarketplaceConnectorTenantConfigInput = z.input<typeof marketplaceConnectorTenantConfigSchema>;
export type MarketplaceConnectorTenantConfig = z.infer<typeof marketplaceConnectorTenantConfigSchema>;
export type MaskedMarketplaceConnectorTenantConfig = z.infer<typeof maskedMarketplaceConnectorTenantConfigSchema>;
