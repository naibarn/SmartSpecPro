import { normalizeProductionRunId } from "@/lib/productionMediaHistoryFilter";
import type {
  HyperframesOutputRef,
  HyperframesRenderStatusProjection,
} from "@shared/hyperframes/contracts";
import { buildHyperframesLibraryIdempotencyKey } from "@shared/hyperframes/contracts";

export type MediaStudioRenderLibrarySessionSource =
  | "storyboard_review"
  | "video_shot"
  | "marketplace_auto_review_hyperframes_render";

export type MediaStudioRenderLibrarySession = {
  version: 1;
  source: MediaStudioRenderLibrarySessionSource;
  jobId: string;
  productionRunId?: string | null;
  title?: string | null;
  metadata?: Record<string, unknown>;
  startedAt: number;
  updatedAt: number;
};

export type HyperframesRenderLibrarySaveInput = {
  productId: string;
  runId: string;
  renderJobId: string;
  idempotencyKey: string;
};

function hasLibraryReadyRenderArtifact(
  render: HyperframesRenderStatusProjection | null | undefined,
  contentHash: string | undefined
): boolean {
  if (!contentHash) return false;
  return Boolean(
    render?.artifactRefs?.some(
      ref =>
        ref.contentHash === contentHash &&
        ref.retentionClass === "library" &&
        (ref.kind === "hyperframes_render_mp4" ||
          ref.kind === "hyperframes_render_webm")
    )
  );
}

export function getHyperframesRenderLibraryReadyOutput(
  render: HyperframesRenderStatusProjection | null | undefined
): HyperframesOutputRef | null {
  return (
    render?.outputRefs?.find(
      ref =>
        (ref.kind === "final_video" || ref.kind === "library_item") &&
        hasLibraryReadyRenderArtifact(render, ref.contentHash)
    ) ?? null
  );
}

export function hasHyperframesRenderLibraryReadyOutput(
  render: HyperframesRenderStatusProjection | null | undefined
): boolean {
  if (
    !render ||
    (render.status !== "completed" && render.status !== "ready_for_review")
  ) {
    return false;
  }
  return Boolean(getHyperframesRenderLibraryReadyOutput(render));
}

export function buildHyperframesRenderLibrarySession(
  render: HyperframesRenderStatusProjection | null | undefined,
  options: { title?: string | null } = {}
): MediaStudioRenderLibrarySession | null {
  if (!render?.renderJobId || !render.runId) return null;
  if (render.status !== "completed" && render.status !== "ready_for_review")
    return null;
  if (render.renderIntent === "preview" || render.renderIntent === "snapshot")
    return null;
  const output = getHyperframesRenderLibraryReadyOutput(render);
  if (!output?.contentHash || output.kind === "library_item") return null;
  const now = Date.now();
  return {
    version: 1,
    source: "marketplace_auto_review_hyperframes_render",
    jobId: render.renderJobId,
    productionRunId: render.runId,
    title: options.title ?? "HyperFrames Marketplace Auto Review video",
    metadata: {
      source: "marketplace_auto_review_hyperframes_render",
      tenantId: render.tenantId,
      productId: render.productId,
      runId: render.runId,
      renderJobId: render.renderJobId,
      renderIntent: render.renderIntent ?? null,
      compositionInputHash: render.compositionInputHash ?? null,
      outputHash: output.contentHash,
      outputUrl: output.url ?? null,
      thumbnailUrl: output.thumbnailUrl ?? null,
      templateId: render.templateId ?? null,
      templateVersion: render.templateVersion ?? null,
      platformPresetId: render.platformPresetId ?? null,
      platformPresetVersion: render.platformPresetVersion ?? null,
      qaStatus: render.qaStatus ?? null,
    },
    startedAt: now,
    updatedAt: now,
  };
}

function metadataText(
  metadata: Record<string, unknown> | undefined,
  key: string
): string {
  const value = metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function buildHyperframesRenderLibrarySaveInputFromSession(
  session: MediaStudioRenderLibrarySession | null | undefined
): HyperframesRenderLibrarySaveInput | null {
  if (!session || session.source !== "marketplace_auto_review_hyperframes_render")
    return null;
  const metadata = session.metadata;
  const tenantId = metadataText(metadata, "tenantId") || "default";
  const productId = metadataText(metadata, "productId");
  const runId =
    metadataText(metadata, "runId") ||
    (typeof session.productionRunId === "string"
      ? session.productionRunId.trim()
      : "");
  const renderJobId = metadataText(metadata, "renderJobId") || session.jobId;
  const renderIntent = metadataText(metadata, "renderIntent");
  const compositionInputHash = metadataText(metadata, "compositionInputHash");
  const outputHash = metadataText(metadata, "outputHash");
  if (
    !productId ||
    !runId ||
    !renderJobId ||
    !renderIntent ||
    !compositionInputHash ||
    !outputHash
  ) {
    return null;
  }
  return {
    productId,
    runId,
    renderJobId,
    idempotencyKey: buildHyperframesLibraryIdempotencyKey({
      tenantId,
      runId,
      renderIntent: renderIntent as never,
      compositionInputHash,
      outputHash,
    }),
  };
}

export const MEDIA_STUDIO_RENDER_LIBRARY_SESSIONS_KEY =
  "smartspec_media_studio_render_library_sessions_v1";

const MEDIA_STUDIO_RENDER_LIBRARY_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sanitizeRenderLibrarySession(
  value: unknown
): MediaStudioRenderLibrarySession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<MediaStudioRenderLibrarySession>;
  const source =
    record.source === "storyboard_review" ||
    record.source === "video_shot" ||
    record.source === "marketplace_auto_review_hyperframes_render"
      ? record.source
      : null;
  const jobId = typeof record.jobId === "string" ? record.jobId.trim() : "";
  if (record.version !== 1 || !source || !jobId) return null;
  const updatedAt =
    Number(record.updatedAt) || Number(record.startedAt) || Date.now();
  if (Date.now() - updatedAt > MEDIA_STUDIO_RENDER_LIBRARY_SESSION_TTL_MS)
    return null;
  const metadata = asRecord(record.metadata);
  return {
    version: 1,
    source,
    jobId,
    productionRunId:
      typeof record.productionRunId === "string"
        ? record.productionRunId
        : null,
    title: typeof record.title === "string" ? record.title : null,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    startedAt: Number(record.startedAt) || updatedAt,
    updatedAt,
  };
}

export function readMediaStudioRenderLibrarySessions(): MediaStudioRenderLibrarySession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(
      MEDIA_STUDIO_RENDER_LIBRARY_SESSIONS_KEY
    );
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const sessions = parsed
      .map(sanitizeRenderLibrarySession)
      .filter((session): session is MediaStudioRenderLibrarySession =>
        Boolean(session)
      );
    if (sessions.length !== parsed.length) {
      window.localStorage.setItem(
        MEDIA_STUDIO_RENDER_LIBRARY_SESSIONS_KEY,
        JSON.stringify(sessions)
      );
    }
    return sessions;
  } catch {
    return [];
  }
}

export function writeMediaStudioRenderLibrarySessions(
  sessions: MediaStudioRenderLibrarySession[]
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      MEDIA_STUDIO_RENDER_LIBRARY_SESSIONS_KEY,
      JSON.stringify(sessions)
    );
  } catch {
    // Ignore storage failures; render progress still works while the page is open.
  }
}

export function upsertMediaStudioRenderLibrarySession(
  session: MediaStudioRenderLibrarySession
): void {
  const sessions = readMediaStudioRenderLibrarySessions();
  const nextSession = {
    ...session,
    version: 1 as const,
    updatedAt: Date.now(),
  };
  const index = sessions.findIndex(item => item.jobId === session.jobId);
  if (index >= 0) {
    sessions[index] = nextSession;
  } else {
    sessions.push(nextSession);
  }
  writeMediaStudioRenderLibrarySessions(sessions);
}

export function removeMediaStudioRenderLibrarySession(jobId: string): void {
  if (!jobId) return;
  writeMediaStudioRenderLibrarySessions(
    readMediaStudioRenderLibrarySessions().filter(
      session => session.jobId !== jobId
    )
  );
}

export function findMediaStudioRenderLibrarySession(
  source: MediaStudioRenderLibrarySession["source"],
  productionRunId: string
): MediaStudioRenderLibrarySession | null {
  const normalizedRunId = normalizeProductionRunId(productionRunId);
  return (
    readMediaStudioRenderLibrarySessions()
      .filter(session => {
        if (session.source !== source) return false;
        const sessionRunId = normalizeProductionRunId(session.productionRunId);
        return normalizedRunId ? sessionRunId === normalizedRunId : !sessionRunId;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
  );
}
