import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./libraryService", () => ({
  createLibraryItem: vi.fn(),
  getLibraryItemById: vi.fn(),
  getUserEffectivePermission: vi.fn(),
}));

import { agencyRunArtifacts, libraryChunks, libraryItems } from "../../drizzle/schema";
import type { RunResult } from "./agencyBridge";
import { buildAgencyPreview } from "./agencyPreviewService";
import {
  AgencyPreviewCommitError,
  commitLibraryBackedPreview,
} from "./agencyCommitService";
import {
  createLibraryItem,
  getLibraryItemById,
  getUserEffectivePermission,
} from "./libraryService";

const mockCreateLibraryItem = vi.mocked(createLibraryItem);
const mockGetLibraryItemById = vi.mocked(getLibraryItemById);
const mockGetUserEffectivePermission = vi.mocked(getUserEffectivePermission);

function makeRunResult(
  intent: "research_report" | "video_storyboard" | "hotel_comparison" = "research_report",
): RunResult {
  if (intent === "hotel_comparison") {
    return {
      runId: "run-1",
      conversationId: "conv-1",
      status: "completed",
      response: "Comparison preview ready.",
      creditsUsed: 0,
      durationMs: 500,
      stepAttemptSnapshots: [],
      structuredResult: {
        version: "1.0",
        intent,
        summary: "Comparison preview ready.",
        payload: {
          title: "Hotels near BTS Asok",
          summary: "Best balance of price and distance.",
          options: [
            {
              vendor: "Booking.com",
              option_title: "Centre Point Asok",
              price: "4200",
              currency_code: "THB",
              distance_meters: "350",
              availability: "few_left",
              refundable: "true",
              booking_link: "https://example.com/hotel-1",
              evidence: [
                {
                  title: "Rate card",
                  url: "https://example.com/rate-1",
                  snippet: "Breakfast included",
                },
              ],
            },
          ],
          recommendations: ["Pick the closest refundable option."],
        },
        artifacts: [{ artifact_type: "comparison", title: "Hotels near BTS Asok" }],
        references: [
          {
            document_id: "101",
            chunk_id: "chunk-1",
            title: "Quarterly demand report",
            url: "https://example.com/report",
          },
        ],
        metrics: {},
      },
      previewArtifacts: [
        {
          id: "artifact-1",
          intent,
          artifact_type: "comparison",
          state: "preview_generated",
          summary: "Comparison preview ready.",
          commit_status: "not_committed",
          commit_token: "commit-token-1",
          payload_json: {
            title: "Hotels near BTS Asok",
            summary: "Best balance of price and distance.",
            options: [
              {
                vendor: "Booking.com",
                option_title: "Centre Point Asok",
                price: "4200",
                currency_code: "THB",
                distance_meters: "350",
                availability: "few_left",
                refundable: "true",
                booking_link: "https://example.com/hotel-1",
                evidence: [
                  {
                    title: "Rate card",
                    url: "https://example.com/rate-1",
                    snippet: "Breakfast included",
                  },
                ],
              },
            ],
            recommendations: ["Pick the closest refundable option."],
          },
          provenance_json: [
            {
              document_id: "101",
              chunk_id: "chunk-1",
              title: "Quarterly demand report",
              url: "https://example.com/report",
            },
          ],
          payload_storage_key: null,
          target_type: null,
          target_id: null,
          committed_at: null,
          expired_at: null,
        },
      ],
    };
  }

  if (intent === "video_storyboard") {
    return {
      runId: "run-1",
      conversationId: "conv-1",
      status: "completed",
      response: "Storyboard preview ready.",
      creditsUsed: 0,
      durationMs: 500,
      stepAttemptSnapshots: [],
      structuredResult: {
        version: "1.0",
        intent,
        summary: "Storyboard preview ready.",
        payload: {
          title: "Launch storyboard",
          total_duration_seconds: 30,
          style: "cinematic",
          scenes: [
            {
              scene_number: 1,
              duration_seconds: 10,
              description: "Opening shot",
              dialogue: "Welcome",
              camera: "push in",
              lighting: "golden hour",
              video_prompt: "A cinematic city reveal",
              audio_prompt: "Warm orchestral swell",
            },
          ],
        },
        artifacts: [{ artifact_type: "storyboard", title: "Launch storyboard" }],
        references: [
          {
            document_id: "101",
            chunk_id: "chunk-1",
            title: "Creative brief",
            url: null,
          },
        ],
        metrics: {},
      },
      previewArtifacts: [
        {
          id: "artifact-1",
          intent,
          artifact_type: "storyboard",
          state: "preview_generated",
          summary: "Storyboard preview ready.",
          commit_status: "not_committed",
          commit_token: "commit-token-1",
          payload_json: {
            title: "Launch storyboard",
            total_duration_seconds: 30,
            style: "cinematic",
            scenes: [
              {
                scene_number: 1,
                duration_seconds: 10,
                description: "Opening shot",
                dialogue: "Welcome",
                camera: "push in",
                lighting: "golden hour",
                video_prompt: "A cinematic city reveal",
                audio_prompt: "Warm orchestral swell",
              },
            ],
          },
          provenance_json: [
            {
              document_id: "101",
              chunk_id: "chunk-1",
              title: "Creative brief",
              url: null,
            },
          ],
          payload_storage_key: null,
          target_type: null,
          target_id: null,
          committed_at: null,
          expired_at: null,
        },
      ],
    };
  }

  return {
    runId: "run-1",
    conversationId: "conv-1",
    status: "completed",
    response: "Research preview ready.",
    creditsUsed: 0,
    durationMs: 500,
    stepAttemptSnapshots: [],
    structuredResult: {
      version: "1.0",
      intent,
      summary: "Research preview ready.",
      payload: {
        title: "Market scan",
        executive_summary: "Demand is rising.",
        sections: [
          {
            heading: "Overview",
            content: "Demand continues to rise.",
            sources: ["doc-1"],
          },
        ],
        key_findings: ["Demand is rising"],
        recommendations: ["Expand distribution"],
      },
      artifacts: [{ artifact_type: "report", title: "Market scan" }],
      references: [
        {
          document_id: "101",
          chunk_id: "chunk-1",
          title: "Quarterly demand report",
          url: "https://example.com/report",
        },
      ],
      metrics: {},
    },
    previewArtifacts: [
      {
        id: "artifact-1",
        intent,
        artifact_type: "report",
        state: "preview_generated",
        summary: "Research preview ready.",
        commit_status: "not_committed",
        commit_token: "commit-token-1",
        payload_json: {
          title: "Market scan",
          executive_summary: "Demand is rising.",
          sections: [
            {
              heading: "Overview",
              content: "Demand continues to rise.",
              sources: ["doc-1"],
            },
          ],
          key_findings: ["Demand is rising"],
          recommendations: ["Expand distribution"],
        },
        provenance_json: [
          {
            document_id: "101",
            chunk_id: "chunk-1",
            title: "Quarterly demand report",
            url: "https://example.com/report",
          },
        ],
        payload_storage_key: null,
        target_type: null,
        target_id: null,
        committed_at: null,
        expired_at: null,
      },
    ],
  };
}

function makeDb() {
  const insertValues = vi.fn().mockReturnValue({
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  });
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const insert = vi.fn().mockImplementation((table) => {
    if (table === libraryChunks) {
      return { values: insertValues };
    }
    return { values: vi.fn() };
  });
  const update = vi.fn().mockImplementation((table) => {
    if (table === agencyRunArtifacts || table === libraryItems) {
      return { set: updateSet };
    }
    return { set: vi.fn() };
  });
  const tx = { insert, update } as any;
  const transaction = vi.fn().mockImplementation(async (callback: (client: any) => unknown) => callback(tx));
  return {
    db: { transaction, update } as any,
    tx,
    mocks: { insertValues, updateSet, updateWhere, transaction },
  };
}

describe("agencyCommitService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateLibraryItem.mockResolvedValue({
      item: {
        id: 501,
        tenantId: "tenant-1",
        ownerUserId: 7,
        itemType: "md",
        source: "agency_generated",
        title: "Market scan",
        metadata: {},
      } as any,
      idempotent: false,
    });
    mockGetLibraryItemById.mockResolvedValue({
      id: 101,
      tenantId: "tenant-1",
      ownerUserId: 7,
      itemType: "document",
      source: "upload",
      title: "Quarterly demand report",
      status: "ready",
      visibility: "private",
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    mockGetUserEffectivePermission.mockResolvedValue({
      effectivePermissionLevel: "read",
      sources: [{ type: "owner" }],
    } as any);
  });

  it("commits a research preview into a library-backed markdown artifact", async () => {
    const preview = buildAgencyPreview(makeRunResult("research_report"));
    const { db, mocks } = makeDb();

    const result = await commitLibraryBackedPreview({
      actor: { userId: 7, tenantId: "tenant-1", role: "user" },
      artifactRecord: {
        id: "artifact-1",
        runId: "run-1",
        tenantId: "tenant-1",
        commitToken: "commit-token-1",
        commitStatus: "not_committed",
        targetType: null,
        targetId: null,
      },
      commitToken: "commit-token-1",
      dbClient: db,
      preview,
    });

    expect(mockCreateLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        itemType: "md",
        source: "agency_generated",
        title: "Market scan",
        sourceLink: {
          linkType: "agency_run_artifact",
          linkId: "artifact-1",
        },
      }),
      expect.objectContaining({ userId: 7, tenantId: "tenant-1" }),
      expect.anything(),
    );
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        libraryItemId: 501,
        contentType: "markdown_source",
      }),
    );
    const markdownInsert = mocks.insertValues.mock.calls[0]?.[0];
    expect(markdownInsert.content).toContain("# Market scan");
    expect(markdownInsert.content).toContain("## Executive Summary");
    expect(result).toEqual(
      expect.objectContaining({
        status: "committed",
        targetType: "library_item",
        targetId: "501",
      }),
    );
  });

  it("commits a storyboard preview into the same library-backed path", async () => {
    const preview = buildAgencyPreview(makeRunResult("video_storyboard"));
    const { db } = makeDb();

    const result = await commitLibraryBackedPreview({
      actor: { userId: 7, tenantId: "tenant-1", role: "user" },
      artifactRecord: {
        id: "artifact-1",
        runId: "run-1",
        tenantId: "tenant-1",
        commitToken: "commit-token-1",
        commitStatus: "not_committed",
        targetType: null,
        targetId: null,
      },
      commitToken: "commit-token-1",
      dbClient: db,
      preview,
    });

    expect(result.status).toBe("committed");
    expect(result.targetType).toBe("library_item");
  });

  it("commits a comparison preview into the same library-backed path", async () => {
    const preview = buildAgencyPreview(makeRunResult("hotel_comparison"));
    const { db, mocks } = makeDb();

    const result = await commitLibraryBackedPreview({
      actor: { userId: 7, tenantId: "tenant-1", role: "user" },
      artifactRecord: {
        id: "artifact-1",
        runId: "run-1",
        tenantId: "tenant-1",
        commitToken: "commit-token-1",
        commitStatus: "not_committed",
        targetType: null,
        targetId: null,
      },
      commitToken: "commit-token-1",
      dbClient: db,
      preview,
    });

    const markdownInsert = mocks.insertValues.mock.calls[0]?.[0];
    expect(markdownInsert.content).toContain("# Hotels near BTS Asok");
    expect(markdownInsert.content).toContain("Price: THB 4,200");
    expect(markdownInsert.content).toContain("Booking: https://example.com/hotel-1");
    expect(result.status).toBe("committed");
  });

  it("rejects expired previews before creating a library artifact", async () => {
    const preview = buildAgencyPreview(
      makeRunResult("research_report"),
      new Date("2026-03-11T00:00:00.000Z"),
    );
    const expiredPreview = preview && {
      ...preview,
      lifecycleState: "expired_preview" as const,
      commit: { ...preview.commit, available: false },
    };

    await expect(
      commitLibraryBackedPreview({
        actor: { userId: 7, tenantId: "tenant-1", role: "user" },
        artifactRecord: {
          id: "artifact-1",
          runId: "run-1",
          tenantId: "tenant-1",
          commitToken: "commit-token-1",
          commitStatus: "not_committed",
          targetType: null,
          targetId: null,
        },
        commitToken: "commit-token-1",
        dbClient: makeDb().db,
        preview: expiredPreview,
      }),
    ).rejects.toMatchObject<Partial<AgencyPreviewCommitError>>({
      code: "STALE_PREVIEW",
    });
    expect(mockCreateLibraryItem).not.toHaveBeenCalled();
  });

  it("treats repeated confirm requests with the same commit token as idempotent", async () => {
    const preview = buildAgencyPreview(makeRunResult("research_report"));

    const result = await commitLibraryBackedPreview({
      actor: { userId: 7, tenantId: "tenant-1", role: "user" },
      artifactRecord: {
        id: "artifact-1",
        runId: "run-1",
        tenantId: "tenant-1",
        commitToken: "commit-token-1",
        commitStatus: "committed",
        targetType: "library_item",
        targetId: "501",
      },
      commitToken: "commit-token-1",
      dbClient: makeDb().db,
      preview,
    });

    expect(result).toEqual({
      artifactId: "artifact-1",
      commitToken: "commit-token-1",
      runId: "run-1",
      status: "committed",
      targetId: "501",
      targetType: "library_item",
    });
    expect(mockCreateLibraryItem).not.toHaveBeenCalled();
  });
});
