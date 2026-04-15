import { z } from "zod";

import { domainAdminProcedure, router } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import {
  agentRegistryCreateSchema,
  agentRegistryMemoryRecordSchema,
  agentRegistryResolutionRequestSchema,
  agentRegistryVersionCreateSchema,
} from "../../shared/agentRegistryContracts";
import {
  createAgentRegistry,
  freezeAgentVersion,
  getAgentRegistry,
  listAgentRegistries,
  publishAgentVersion,
  recordAgentOutcomeMemory,
  resolveAgentVersion,
  rollbackAgentVersion,
} from "../services/agentRegistryService";

const registrySurfaceProcedure = domainAdminProcedure.use(requireFeatureFlag("agentRegistryEnabled"));

export const agentRegistryRouter = router({
  list: registrySurfaceProcedure.query(async ({ ctx }) => {
    return listAgentRegistries(ctx.tenantId!);
  }),

  get: registrySurfaceProcedure
    .input(z.object({ registryId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const registry = await getAgentRegistry(ctx.tenantId!, input.registryId);
      if (!registry) {
        return null;
      }
      return registry;
    }),

  createRegistry: registrySurfaceProcedure
    .input(agentRegistryCreateSchema.omit({ owningUserId: true }))
    .mutation(async ({ ctx, input }) => {
      return createAgentRegistry({
        ...input,
        owningUserId: ctx.user?.id ?? null,
      });
    }),

  publishVersion: registrySurfaceProcedure
    .input(agentRegistryVersionCreateSchema)
    .mutation(async ({ input }) => {
      return publishAgentVersion(input);
    }),

  resolve: registrySurfaceProcedure
    .input(agentRegistryResolutionRequestSchema)
    .query(async ({ input }) => {
      return resolveAgentVersion(input);
    }),

  recordMemory: registrySurfaceProcedure
    .input(agentRegistryMemoryRecordSchema)
    .mutation(async ({ input }) => {
      return recordAgentOutcomeMemory(input);
    }),

  freezeVersion: registrySurfaceProcedure
    .input(z.object({
      tenantId: z.string().min(1),
      versionId: z.string().min(1),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return freezeAgentVersion(input);
    }),

  rollbackVersion: registrySurfaceProcedure
    .input(z.object({
      tenantId: z.string().min(1),
      registryId: z.string().min(1),
      versionId: z.string().min(1),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return rollbackAgentVersion(input);
    }),
});
