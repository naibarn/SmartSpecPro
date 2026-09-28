import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  videoEditorProjectRevisions,
  videoEditorProjects,
  type VideoEditorProjectRevision,
} from "../../drizzle/schema";
import {
  assertCanonicalProject,
  type CanonicalNleProject,
  migrateLegacyProject,
  type MigrationReport,
} from "@smartspec/shared";

export interface VideoEditorProjectRevisionScope {
  tenantId: string;
  userId: number;
}

export interface VideoEditorRevisionDocument {
  project: CanonicalNleProject;
  report: MigrationReport | null;
}

export interface AppendVideoEditorRevisionInput {
  projectId: number;
  document: unknown;
  expectedRevision?: number;
  expectedRevisionId?: string;
  clientMutationId?: string;
  reason?: "edit" | "autosave" | "import" | "recovery";
  name?: string;
  thumbnailUrl?: string | null;
  duration?: number;
  resolution?: string | null;
  trackCount?: number;
  clipCount?: number;
}

export class VideoEditorProjectRevisionConflictError extends Error {
  readonly code = "VIDEO_EDITOR_REVISION_CONFLICT" as const;
  readonly projectId: number;
  readonly expectedRevision: number | undefined;
  readonly actualRevision: number;
  readonly currentRevisionId: string | null;

  constructor(input: {
    projectId: number;
    expectedRevision?: number;
    actualRevision: number;
    currentRevisionId: string | null;
  }) {
    super("Video editor project revision is stale");
    this.name = "VideoEditorProjectRevisionConflictError";
    this.projectId = input.projectId;
    this.expectedRevision = input.expectedRevision;
    this.actualRevision = input.actualRevision;
    this.currentRevisionId = input.currentRevisionId;
  }
}

export class VideoEditorProjectAccessError extends Error {
  readonly code = "VIDEO_EDITOR_PROJECT_NOT_FOUND" as const;

  constructor() {
    super("Video editor project was not found");
    this.name = "VideoEditorProjectAccessError";
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)])
  );
}

export function hashVideoEditorDocument(document: CanonicalNleProject): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(document)), "utf8")
    .digest("hex");
}

export function buildVideoEditorRevisionDocument(
  input: unknown,
  projectId: string
): VideoEditorRevisionDocument {
  if (
    input &&
    typeof input === "object" &&
    (input as Record<string, unknown>).schemaVersion === "nle.web.1"
  ) {
    assertCanonicalProject(input);
    if (input.projectId !== projectId) throw new Error("PROJECT_ID_MISMATCH");
    return { project: input, report: null };
  }
  try {
    assertCanonicalProject(input);
    if (input.projectId !== projectId) throw new Error("PROJECT_ID_MISMATCH");
    return { project: input, report: null };
  } catch (error) {
    if (error instanceof Error && error.message === "PROJECT_ID_MISMATCH")
      throw error;
  }

  const migrated = migrateLegacyProject(input, projectId);
  assertCanonicalProject(migrated.project);
  return migrated;
}

export async function getCurrentVideoEditorProjectRevision(
  scope: VideoEditorProjectRevisionScope,
  projectId: number
): Promise<VideoEditorProjectRevision | null> {
  const db = getDb();
  const [project] = await db
    .select({ id: videoEditorProjects.id, userId: videoEditorProjects.userId })
    .from(videoEditorProjects)
    .where(
      and(
        eq(videoEditorProjects.id, projectId),
        eq(videoEditorProjects.userId, scope.userId)
      )
    )
    .limit(1);
  if (!project) throw new VideoEditorProjectAccessError();

  const [revision] = await db
    .select()
    .from(videoEditorProjectRevisions)
    .where(
      and(
        eq(videoEditorProjectRevisions.projectId, projectId),
        eq(videoEditorProjectRevisions.tenantId, scope.tenantId)
      )
    )
    .orderBy(desc(videoEditorProjectRevisions.revision))
    .limit(1);
  return revision ?? null;
}

export async function appendVideoEditorProjectRevision(
  scope: VideoEditorProjectRevisionScope,
  input: AppendVideoEditorRevisionInput
): Promise<VideoEditorProjectRevision> {
  const canonical = buildVideoEditorRevisionDocument(
    input.document,
    `project-${input.projectId}`
  );
  const documentHash = hashVideoEditorDocument(canonical.project);
  const db = getDb();

  return db.transaction(async tx => {
    const [project] = await tx
      .select({ id: videoEditorProjects.id })
      .from(videoEditorProjects)
      .where(
        and(
          eq(videoEditorProjects.id, input.projectId),
          eq(videoEditorProjects.userId, scope.userId)
        )
      )
      .for("update")
      .limit(1);
    if (!project) throw new VideoEditorProjectAccessError();

    const existingTenantRows = await tx
      .select({ tenantId: videoEditorProjectRevisions.tenantId })
      .from(videoEditorProjectRevisions)
      .where(eq(videoEditorProjectRevisions.projectId, input.projectId));
    if (existingTenantRows.some(row => row.tenantId !== scope.tenantId)) {
      throw new VideoEditorProjectAccessError();
    }

    if (input.clientMutationId) {
      const [duplicate] = await tx
        .select()
        .from(videoEditorProjectRevisions)
        .where(
          and(
            eq(videoEditorProjectRevisions.projectId, input.projectId),
            eq(videoEditorProjectRevisions.tenantId, scope.tenantId),
            eq(
              videoEditorProjectRevisions.clientMutationId,
              input.clientMutationId
            )
          )
        )
        .limit(1);
      if (duplicate) return duplicate;
    }

    const [current] = await tx
      .select()
      .from(videoEditorProjectRevisions)
      .where(
        and(
          eq(videoEditorProjectRevisions.projectId, input.projectId),
          eq(videoEditorProjectRevisions.tenantId, scope.tenantId)
        )
      )
      .orderBy(desc(videoEditorProjectRevisions.revision))
      .limit(1);
    const currentRevision = current?.revision ?? 0;
    if (
      input.expectedRevision !== undefined &&
      input.expectedRevision !== currentRevision
    ) {
      throw new VideoEditorProjectRevisionConflictError({
        projectId: input.projectId,
        expectedRevision: input.expectedRevision,
        actualRevision: currentRevision,
        currentRevisionId: current?.id ?? null,
      });
    }
    if (
      input.expectedRevisionId !== undefined &&
      input.expectedRevisionId !== (current?.id ?? null)
    ) {
      throw new VideoEditorProjectRevisionConflictError({
        projectId: input.projectId,
        expectedRevision: input.expectedRevision,
        actualRevision: currentRevision,
        currentRevisionId: current?.id ?? null,
      });
    }

    const now = new Date();
    const [revision] = await tx
      .insert(videoEditorProjectRevisions)
      .values({
        id: randomUUID(),
        projectId: input.projectId,
        tenantId: scope.tenantId,
        revision: currentRevision + 1,
        parentRevisionId: current?.id ?? null,
        schemaVersion: canonical.project.schemaVersion,
        document: canonical.project as unknown as Record<string, unknown>,
        documentHash,
        reason: input.reason ?? "edit",
        actorUserId: scope.userId,
        clientMutationId: input.clientMutationId,
        createdAt: now,
      })
      .returning();

    await tx
      .update(videoEditorProjects)
      .set({
        // Keep the legacy-shaped JSON field as a compatibility cache for the
        // current Phase 3 loader. The immutable canonical revision above is
        // the authority and is the only input used for execution admission.
        projectData: input.document,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.thumbnailUrl !== undefined
          ? { thumbnailUrl: input.thumbnailUrl }
          : {}),
        ...(input.duration !== undefined
          ? { duration: String(input.duration) }
          : {}),
        ...(input.resolution !== undefined
          ? { resolution: input.resolution }
          : {}),
        ...(input.trackCount !== undefined
          ? { trackCount: input.trackCount }
          : {}),
        ...(input.clipCount !== undefined
          ? { clipCount: input.clipCount }
          : {}),
        isAutoSave: input.reason === "autosave",
        updatedAt: now,
      })
      .where(eq(videoEditorProjects.id, input.projectId));

    return revision;
  });
}
