import type { ZodIssue } from "zod";

import {
  presentationSlideContentSchema,
  type PresentationSlideContent,
} from "./contracts";

export interface PresentationSlideContentValidationSuccess {
  ok: true;
  value: PresentationSlideContent;
}

export interface PresentationSlideContentValidationFailure {
  ok: false;
  code: "PRESENTATION_SLIDE_CONTENT_INVALID";
  issues: ZodIssue[];
}

export type PresentationSlideContentValidationResult =
  | PresentationSlideContentValidationSuccess
  | PresentationSlideContentValidationFailure;

export function validatePresentationSlideContent(
  input: unknown,
): PresentationSlideContentValidationResult {
  const parsed = presentationSlideContentSchema.safeParse(input);
  if (parsed.success) {
    return {
      ok: true,
      value: parsed.data,
    };
  }

  return {
    ok: false,
    code: "PRESENTATION_SLIDE_CONTENT_INVALID",
    issues: parsed.error.issues,
  };
}
