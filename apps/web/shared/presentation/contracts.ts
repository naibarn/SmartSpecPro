import { z } from "zod";

import {
  PRESENTATION_ERROR_CODE_VALUES,
  PRESENTATION_ITEM_TYPE,
} from "./constants";

export const presentationRouteGuardInputSchema = z.object({
  itemId: z.number().int().positive(),
  itemType: z.string().min(1).max(64),
});

export const presentationRecoveryCtaSchema = z.object({
  label: z.string().min(1).max(120),
  href: z.string().min(1).max(2048),
});

export const presentationRouteAllowedResultSchema = z.object({
  allowed: z.literal(true),
  itemId: z.number().int().positive(),
  editorRoute: z.string().min(1).max(2048),
});

export const presentationRouteBlockedResultSchema = z.object({
  allowed: z.literal(false),
  itemId: z.number().int().positive(),
  itemType: z.string().min(1).max(64),
  errorCode: z.enum(PRESENTATION_ERROR_CODE_VALUES),
  message: z.string().min(1).max(400),
  recoveryCta: presentationRecoveryCtaSchema,
});

export const presentationRouteGuardResultSchema = z.union([
  presentationRouteAllowedResultSchema,
  presentationRouteBlockedResultSchema,
]);

export const presentationAvailabilitySchema = z.object({
  enabled: z.boolean(),
  errorCode: z.enum(PRESENTATION_ERROR_CODE_VALUES).optional(),
  message: z.string().optional(),
});

export type PresentationRouteGuardInput = z.infer<typeof presentationRouteGuardInputSchema>;
export type PresentationRouteAllowedResult = z.infer<typeof presentationRouteAllowedResultSchema>;
export type PresentationRouteBlockedResult = z.infer<typeof presentationRouteBlockedResultSchema>;
export type PresentationRouteGuardResult = z.infer<typeof presentationRouteGuardResultSchema>;
export type PresentationAvailability = z.infer<typeof presentationAvailabilitySchema>;

export function isPresentationItemType(itemType: string): boolean {
  return itemType.trim().toLowerCase() === PRESENTATION_ITEM_TYPE;
}
