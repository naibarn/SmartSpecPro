import { z } from "zod";

import {
  roleContextGovernanceSchema,
  roleImprovementProposalSchema,
  roleMemoryClassSchema,
  roleMemoryItemSchema,
  rolePromotionGateSchema,
} from "./roleAgentContracts";

export const roleMemorySummarySchema = z.object({
  roleId: z.string().min(1),
  memoryClass: roleMemoryClassSchema,
  hotCount: z.number().int().nonnegative(),
  archivedCount: z.number().int().nonnegative(),
  oldestHotCreatedAt: z.string().datetime().nullable().optional(),
  newestArchivedAt: z.string().datetime().nullable().optional(),
});

export type RoleMemorySummary = z.infer<typeof roleMemorySummarySchema>;
export const roleMemoryGovernanceSchema = roleContextGovernanceSchema;
export const roleMemoryRecordSchema = roleMemoryItemSchema;
export const roleImprovementRecordSchema = roleImprovementProposalSchema;
export const rolePromotionGateRecordSchema = rolePromotionGateSchema;

