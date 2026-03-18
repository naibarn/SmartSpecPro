/**
 * Agency Result Router
 *
 * Routes AgencyResultEnvelope outputs to the correct UI destination.
 * Called after an agency run completes and produces structured output.
 *
 * Routing logic:
 *   presentation_deck → Presentation Editor URL (/presentations/{deckId}/edit)
 *   media_prompt      → Media Studio prefill URL (/media-studio?prompt=...&model=...)
 *   video_storyboard  → Chat display (structured scene data)
 *   research_report   → Chat display (structured report sections)
 *   text_content      → Chat display (rendered markdown/text)
 */

import {
  type AgencyResultEnvelope,
  AgencyResultEnvelopeSchema,
  RESULT_TYPE_DESTINATIONS,
} from "@shared/contentAutomation/agencyResultEnvelope";
import { auditLogger } from "./auditLogger";

// ── Types ──────────────────────────────────────────────────

export interface AgencyRoutingResult {
  /** Whether the envelope was valid and routing succeeded */
  success: boolean;
  /** The result type from the envelope */
  resultType: string;
  /** Where the result should be displayed */
  destination: "presentation_editor" | "media_studio" | "chat";
  /** Human-readable label for the destination */
  destinationLabel: string;
  /** URL to navigate to (for presentation_editor and media_studio) */
  navigateUrl: string | null;
  /** Structured payload for in-chat display (for chat destinations) */
  displayPayload: unknown | null;
  /** Error message if routing failed */
  error: string | null;
}

// ── Core routing function ──────────────────────────────────

export function routeAgencyResult(
  envelope: AgencyResultEnvelope,
): AgencyRoutingResult {
  const meta = RESULT_TYPE_DESTINATIONS[envelope.resultType];

  const baseResult: Pick<AgencyRoutingResult, "success" | "resultType" | "destination" | "destinationLabel" | "error"> = {
    success: true,
    resultType: envelope.resultType,
    destination: meta.destination,
    destinationLabel: meta.label,
    error: null,
  };

  switch (envelope.resultType) {
    case "presentation_deck": {
      const { deckId } = envelope.payload;
      return {
        ...baseResult,
        navigateUrl: `/presentations/${deckId}/edit`,
        displayPayload: {
          type: "presentation_deck",
          deckId: envelope.payload.deckId,
          libraryItemId: envelope.payload.libraryItemId,
          title: envelope.payload.title,
          slideCount: envelope.payload.slideCount,
          previewImageUrl: envelope.payload.previewImageUrl ?? null,
        },
      };
    }

    case "media_prompt": {
      const params = new URLSearchParams();
      params.set("prompt", envelope.payload.prompt);
      params.set("type", envelope.payload.mediaType);
      if (envelope.payload.model) {
        params.set("model", envelope.payload.model);
      }
      return {
        ...baseResult,
        navigateUrl: `/media-studio?${params.toString()}`,
        displayPayload: null,
      };
    }

    case "video_storyboard":
      return {
        ...baseResult,
        navigateUrl: null,
        displayPayload: {
          type: "video_storyboard",
          title: envelope.payload.title,
          summary: envelope.payload.summary,
          totalScenes: envelope.payload.totalScenes,
          totalDurationSeconds: envelope.payload.totalDurationSeconds,
          scenes: envelope.payload.scenes,
        },
      };

    case "research_report":
      return {
        ...baseResult,
        navigateUrl: null,
        displayPayload: {
          type: "research_report",
          title: envelope.payload.title,
          summary: envelope.payload.summary,
          sections: envelope.payload.sections,
          methodology: envelope.payload.methodology,
          limitations: envelope.payload.limitations,
        },
      };

    case "text_content":
      return {
        ...baseResult,
        navigateUrl: null,
        displayPayload: {
          type: "text_content",
          title: envelope.payload.title,
          content: envelope.payload.content,
          format: envelope.payload.format,
        },
      };
  }
}

// ── Parse + route (safe entry point for tRPC) ──────────────

export function parseAndRouteAgencyResult(
  raw: unknown,
  meta?: { agencyId?: string; agencyRunId?: string; userId?: number },
): AgencyRoutingResult {
  const parsed = AgencyResultEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      resultType: "unknown",
      destination: "chat",
      destinationLabel: "Chat",
      navigateUrl: null,
      displayPayload: null,
      error: `Invalid AgencyResultEnvelope: ${parsed.error.message.slice(0, 500)}`,
    };
  }

  const result = routeAgencyResult(parsed.data);

  auditLogger.log({
    traceId: `agency-result-route:${meta?.agencyRunId ?? "unknown"}:${Date.now()}`,
    timestamp: new Date().toISOString(),
    eventType: "agency_result_routed",
    userId: meta?.userId ?? 0,
    requestPayload: {
      agencyId: meta?.agencyId ?? parsed.data.agencyId,
      agencyRunId: meta?.agencyRunId ?? parsed.data.agencyRunId,
      resultType: parsed.data.resultType,
    },
    responsePayload: {
      destination: result.destination,
      navigateUrl: result.navigateUrl,
      success: result.success,
    },
  });

  return result;
}
