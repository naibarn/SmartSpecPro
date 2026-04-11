import { z } from "zod";

import {
  roleDelegationIntentTypeSchema,
  roleHandoffSchema,
  roleMessageActionabilityStateSchema,
  roleMessagePrioritySchema,
  roleMessageSchema,
  roleVisibilityClassSchema,
} from "./roleAgentContracts";

export const roleVisibilityMatrixSchema = z.object({
  roleMemory: z.array(roleVisibilityClassSchema).default(["owner_full"]),
  roomThreads: z.array(roleVisibilityClassSchema).default(["owner_full"]),
  checkpoints: z.array(roleVisibilityClassSchema).default(["owner_full"]),
  artifacts: z.array(roleVisibilityClassSchema).default(["redacted_summary"]),
  exceptionDetail: z.array(roleVisibilityClassSchema).default(["operator_review"]),
});

export type RoleVisibilityMatrix = z.infer<typeof roleVisibilityMatrixSchema>;
export const roleTypedMessageSchema = roleMessageSchema;
export const roleHandoffRecordSchema = roleHandoffSchema;
export const roleMessageIntentSchema = roleDelegationIntentTypeSchema;
export const roleMessagePriorityLevelSchema = roleMessagePrioritySchema;
export const roleMessageActionabilitySchema = roleMessageActionabilityStateSchema;

