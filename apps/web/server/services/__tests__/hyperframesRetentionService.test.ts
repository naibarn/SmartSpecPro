import { describe, expect, it } from "vitest";

import {
  HYPERFRAMES_RETENTION_RULES,
  dryRunHyperframesRetentionPurge,
  purgeHyperframesRetentionArtifacts,
  runHyperframesRetentionPurgeJob,
} from "../hyperframesRetentionService";

describe("hyperframesRetentionService", () => {
  it("defines retention defaults for every HyperFrames artifact kind", () => {
    expect([...new Set(HYPERFRAMES_RETENTION_RULES.map(rule => rule.artifactKind))]).toEqual([
      "hyperframes_input_json",
      "hyperframes_composition_html",
      "hyperframes_snapshot",
      "hyperframes_render_mp4",
      "hyperframes_render_webm",
      "hyperframes_subtitle_vtt",
      "hyperframes_manifest",
      "hyperframes_sanitized_log",
    ]);
  });

  it("matches the planned retention class matrix for review, library, and audit artifacts", () => {
    expect(
      HYPERFRAMES_RETENTION_RULES.map(rule => [
        rule.artifactKind,
        rule.retentionClass,
      ])
    ).toEqual([
      ["hyperframes_input_json", "review"],
      ["hyperframes_composition_html", "review"],
      ["hyperframes_snapshot", "temporary"],
      ["hyperframes_snapshot", "review"],
      ["hyperframes_render_mp4", "review"],
      ["hyperframes_render_mp4", "library"],
      ["hyperframes_render_webm", "review"],
      ["hyperframes_render_webm", "library"],
      ["hyperframes_subtitle_vtt", "review"],
      ["hyperframes_subtitle_vtt", "library"],
      ["hyperframes_manifest", "audit"],
      ["hyperframes_sanitized_log", "audit"],
    ]);
  });

  it("dry-runs purge while preserving Library-owned and active artifacts", () => {
    const now = new Date("2026-06-04T00:00:00.000Z");
    const result = dryRunHyperframesRetentionPurge({
      now,
      artifacts: [
        {
          artifactId: "preview_old",
          artifactKind: "hyperframes_snapshot",
          retentionClass: "temporary",
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
        },
        {
          artifactId: "library_video",
          artifactKind: "hyperframes_render_mp4",
          retentionClass: "review",
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          libraryOwned: true,
        },
        {
          artifactId: "active_job",
          artifactKind: "hyperframes_sanitized_log",
          retentionClass: "audit",
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          activeJob: true,
        },
      ],
    });

    expect(result.eligibleArtifactIds).toEqual(["preview_old"]);
    expect(result.preservedCount).toBe(2);
  });

  it("preserves library-retained media even when old enough for normal review cleanup", () => {
    const now = new Date("2037-06-04T00:00:00.000Z");
    const result = dryRunHyperframesRetentionPurge({
      now,
      artifacts: [
        {
          artifactId: "library_mp4",
          artifactKind: "hyperframes_render_mp4",
          retentionClass: "library",
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          libraryOwned: true,
        },
        {
          artifactId: "library_subtitle",
          artifactKind: "hyperframes_subtitle_vtt",
          retentionClass: "library",
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          libraryOwned: true,
        },
      ],
    });

    expect(result.eligibleArtifactIds).toEqual([]);
    expect(result.preservedCount).toBe(2);
  });

  it("skips locked artifacts and artifacts inside retry grace", () => {
    const now = new Date("2026-06-04T00:00:00.000Z");
    const result = dryRunHyperframesRetentionPurge({
      now,
      artifacts: [
        {
          artifactId: "locked_preview",
          artifactKind: "hyperframes_snapshot",
          retentionClass: "temporary",
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          locked: true,
        },
        {
          artifactId: "retry_preview",
          artifactKind: "hyperframes_snapshot",
          retentionClass: "temporary",
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          retryGraceUntil: new Date("2026-06-04T01:00:00.000Z"),
        },
      ],
    });

    expect(result.eligibleArtifactIds).toEqual([]);
    expect(result.preservedCount).toBe(2);
  });

  it("executes destructive purge through an explicit storage adapter", async () => {
    const now = new Date("2026-06-04T00:00:00.000Z");
    const deleted: string[] = [];
    const result = await purgeHyperframesRetentionArtifacts({
      now,
      dryRun: false,
      artifacts: [
        {
          artifactId: "preview_old",
          artifactKind: "hyperframes_snapshot",
          retentionClass: "temporary",
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
        },
        {
          artifactId: "library_video",
          artifactKind: "hyperframes_render_mp4",
          retentionClass: "review",
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          libraryOwned: true,
        },
      ],
      deleteArtifact: artifact => {
        deleted.push(artifact.artifactId);
      },
    });

    expect(result).toMatchObject({
      dryRun: false,
      deletedCount: 1,
      deletedArtifactIds: ["preview_old"],
      preservedCount: 1,
      failed: [],
    });
    expect(deleted).toEqual(["preview_old"]);
  });

  it("runs retention as an auditable job with loader and storage adapters", async () => {
    const now = new Date("2026-06-04T00:00:00.000Z");
    const deleted: string[] = [];
    const auditEvents: unknown[] = [];
    const result = await runHyperframesRetentionPurgeJob({
      tenantId: "tenant_1",
      now,
      dryRun: false,
      loadArtifacts: () => [
        {
          artifactId: "expired_preview",
          artifactKind: "hyperframes_snapshot",
          retentionClass: "temporary",
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
        },
        {
          artifactId: "active_preview",
          artifactKind: "hyperframes_snapshot",
          retentionClass: "temporary",
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          activeJob: true,
        },
      ],
      deleteArtifact: artifact => {
        deleted.push(artifact.artifactId);
      },
      recordAuditEvent: event => {
        auditEvents.push(event);
      },
    });

    expect(deleted).toEqual(["expired_preview"]);
    expect(result.auditPersisted).toBe(true);
    expect(result.audit).toMatchObject({
      action: "hyperframes_retention_purge",
      tenantId: "tenant_1",
      eligibleCount: 1,
      deletedCount: 1,
      failedCount: 0,
      redacted: true,
    });
    expect(auditEvents).toEqual([result.audit]);
  });

  it("records destructive purge failures in the audit summary", async () => {
    const now = new Date("2026-06-04T00:00:00.000Z");
    const result = await runHyperframesRetentionPurgeJob({
      tenantId: "tenant_1",
      now,
      dryRun: false,
      loadArtifacts: () => [
        {
          artifactId: "expired_preview",
          artifactKind: "hyperframes_snapshot",
          retentionClass: "temporary",
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
      deleteArtifact: () => {
        throw new Error("storage unavailable");
      },
    });

    expect(result.failed).toEqual([
      { artifactId: "expired_preview", message: "storage unavailable" },
    ]);
    expect(result.audit).toMatchObject({
      action: "hyperframes_retention_purge",
      failedCount: 1,
      redacted: true,
    });
  });
});
