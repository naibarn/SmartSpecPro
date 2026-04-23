import { describe, expect, it } from "vitest";

import {
  buildLibraryKnowledgeCacheRows,
  buildLibraryKnowledgeRefreshMetadata,
  summarizeLibraryKnowledgeBackfillProgress,
} from "./libraryKnowledgeBackfillService";

describe("libraryKnowledgeBackfillService", () => {
  it("summarizes backfill coverage, remaining work, and retries", () => {
    expect(
      summarizeLibraryKnowledgeBackfillProgress({
        totalNotes: 10,
        processedNotes: 7,
        successfulNotes: 6,
        failedNotes: 1,
        retryCount: 2,
      }),
    ).toEqual({
      coveragePercent: 70,
      remainingNotes: 3,
      hasFailures: true,
      retryCount: 2,
    });
  });

  it("builds structured knowledge refresh metadata for downstream jobs", () => {
    expect(
      buildLibraryKnowledgeRefreshMetadata({
        reason: "permission_change",
        actorUserId: 5,
        fieldKeys: ["visibility", "shares"],
      }),
    ).toEqual({
      knowledgeRefresh: {
        reason: "permission_change",
        actorUserId: 5,
        fieldKeys: ["shares", "visibility"],
      },
    });
  });

  it("builds note and relation cache rows from markdown knowledge", () => {
    const extractedAt = new Date("2026-04-21T00:00:00.000Z");
    const rows = buildLibraryKnowledgeCacheRows({
      extractedAt,
      item: {
        id: 10,
        tenantId: "tenant-1",
        title: "Ops Runbook",
        metadata: { logical_path: "ops/runbook.md" },
        updatedAt: new Date("2026-04-20T00:00:00.000Z"),
      },
      markdown: [
        "---",
        "aliases:",
        "  - Operations",
        "tags:",
        "  - ops",
        "---",
        "# Daily Ops",
        "See [[Incident Playbook]] and [Checklist](ops/checklist.md).",
      ].join("\n"),
      candidates: [
        {
          libraryItemId: 10,
          title: "Ops Runbook",
          logicalPath: "ops/runbook",
          aliases: ["Operations"],
          isReadable: true,
        },
        {
          libraryItemId: 11,
          title: "Incident Playbook",
          logicalPath: "ops/incident-playbook",
          aliases: [],
          isReadable: true,
        },
        {
          libraryItemId: 12,
          title: "Checklist",
          logicalPath: "ops/checklist",
          aliases: [],
          isReadable: true,
        },
      ],
    });

    expect(rows.note).toMatchObject({
      libraryItemId: 10,
      tenantId: "tenant-1",
      logicalPath: "ops/runbook",
      normalizedTitle: "ops runbook",
      aliases: ["Operations"],
      tags: ["ops"],
      isStale: false,
      lastBackfilledAt: extractedAt,
    });
    expect(rows.note.contentFingerprint).toHaveLength(64);
    expect(rows.relations).toEqual([
      expect.objectContaining({
        sourceLibraryItemId: 10,
        targetLibraryItemId: 11,
        relationKind: "wikilink",
        resolutionStatus: "resolved",
        matchedBy: "title",
      }),
      expect.objectContaining({
        sourceLibraryItemId: 10,
        targetLibraryItemId: 12,
        relationKind: "markdown",
        resolutionStatus: "resolved",
        matchedBy: "logical_path",
      }),
    ]);
  });
});
