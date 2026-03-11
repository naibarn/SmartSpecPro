import { beforeEach, describe, expect, it, vi } from "vitest";

import { agencyTemplates, agentTemplates } from "../../drizzle/schema";
import {
  ensureBuiltInAgencyExperienceTemplates,
  resolveAgencyRetrievalScope,
} from "./agencyExperienceTemplateService";

function makeInsertRecorder() {
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  const insert = vi.fn().mockReturnValue({ values });
  return { insert, values, onConflictDoNothing };
}

function makeUpdateRecorder() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });
  return { update, set, where };
}

describe("agencyExperienceTemplateService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("seeds the three built-in platform templates and their agent definitions", async () => {
    const templatesInsert = makeInsertRecorder();
    const agentsInsert = makeInsertRecorder();
    const templatesUpdate = makeUpdateRecorder();
    const agentsUpdate = makeUpdateRecorder();
    const db = {
      insert: vi
        .fn()
        .mockImplementationOnce(() => ({ values: templatesInsert.values }))
        .mockImplementationOnce(() => ({ values: agentsInsert.values })),
      update: vi
        .fn()
        .mockImplementationOnce(() => ({ set: templatesUpdate.set }))
        .mockImplementationOnce(() => ({ set: templatesUpdate.set }))
        .mockImplementationOnce(() => ({ set: templatesUpdate.set }))
        .mockImplementationOnce(() => ({ set: agentsUpdate.set }))
        .mockImplementationOnce(() => ({ set: agentsUpdate.set }))
        .mockImplementationOnce(() => ({ set: agentsUpdate.set })),
    } as any;

    await ensureBuiltInAgencyExperienceTemplates(db);

    expect(db.insert).toHaveBeenNthCalledWith(1, agencyTemplates);
    expect(db.insert).toHaveBeenNthCalledWith(2, agentTemplates);
    const seededTemplates = templatesInsert.values.mock.calls[0]?.[0];
    const seededAgents = agentsInsert.values.mock.calls[0]?.[0];
    expect(seededTemplates).toHaveLength(3);
    expect(seededTemplates.map((template: any) => template.name)).toEqual([
      "Deep Research",
      "Storyboard Planner",
      "Deck Builder",
    ]);
    expect(seededAgents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agencyTemplateId: "platform-deep-research",
          defaultTools: expect.arrayContaining([
            "builtin-rag-knowledge",
            "builtin-document-search",
          ]),
        }),
        expect.objectContaining({
          agencyTemplateId: "platform-deck-builder",
          defaultTools: expect.arrayContaining([
            "builtin-rag-knowledge",
            "builtin-document-search",
          ]),
        }),
      ]),
    );
  });

  it("uses the template default retrieval scope when no override is provided", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                slug: "deep-research-4ab3",
              },
            ]),
          }),
        }),
      }),
    } as any;

    const resolved = await resolveAgencyRetrievalScope({
      agencyId: "agency-1",
      tenantId: "tenant-1",
      userId: 7,
      dbClient: db,
    });

    expect(resolved).toEqual({
      version: 1,
      experienceKey: "deep_research",
      templateDefault: "tenant_accessible",
      userOverride: null,
      effectiveMode: "tenant_accessible",
      permissionFilter: {
        tenantId: "tenant-1",
        userId: 7,
      },
    });
  });

  it("applies a supported user override while keeping the tenant permission boundary", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                slug: "deep-research-4ab3",
              },
            ]),
          }),
        }),
      }),
    } as any;

    const resolved = await resolveAgencyRetrievalScope({
      agencyId: "agency-1",
      tenantId: "tenant-1",
      userId: 7,
      overrideMode: "library_only",
      dbClient: db,
    });

    expect(resolved?.effectiveMode).toBe("library_only");
    expect(resolved?.permissionFilter).toEqual({
      tenantId: "tenant-1",
      userId: 7,
    });
  });
});
