import { describe, expect, it } from "vitest";

import {
  extractLibraryMarkdownKnowledge,
  normalizeLibraryKnowledgeLogicalPath,
  resolveLibraryKnowledgeReference,
} from "./libraryKnowledgeGraphService";

describe("libraryKnowledgeGraphService", () => {
  it("extracts frontmatter aliases, tags, headings, and internal references from markdown", () => {
    const extracted = extractLibraryMarkdownKnowledge(`---
aliases:
  - Launch Plan
tags:
  - research
status: draft
owners:
  - alice
---
# Kickoff

We link [[Roadmap]] and [[plans/2026-roadmap#Milestones|milestones]].
Also see [Implementation](./docs/implementation.md) and body tag #ops.
`);

    expect(extracted.frontmatter).toMatchObject({
      status: "draft",
      owners: ["alice"],
    });
    expect(extracted.aliases).toEqual(["Launch Plan"]);
    expect(extracted.tags).toEqual(["research", "ops"]);
    expect(extracted.headings).toEqual([
      expect.objectContaining({
        depth: 1,
        text: "Kickoff",
        slug: "kickoff",
      }),
    ]);
    expect(extracted.references).toEqual([
      expect.objectContaining({
        kind: "wikilink",
        target: "Roadmap",
        targetPath: "roadmap",
        targetHeading: null,
      }),
      expect.objectContaining({
        kind: "wikilink",
        targetPath: "plans/2026-roadmap",
        targetHeading: "milestones",
        displayText: "milestones",
      }),
      expect.objectContaining({
        kind: "markdown",
        targetPath: "docs/implementation",
      }),
    ]);
  });

  it("normalizes logical paths consistently", () => {
    expect(normalizeLibraryKnowledgeLogicalPath(" ./Plans//Roadmap.md#Intro ")).toBe(
      "plans/roadmap#intro",
    );
  });

  it("resolves references by logical path, title, alias, and fail-closed states", () => {
    expect(
      resolveLibraryKnowledgeReference("Roadmap", [
        {
          libraryItemId: 11,
          title: "Roadmap",
          logicalPath: "plans/roadmap",
          aliases: ["Launch Plan"],
          isReadable: true,
        },
      ]),
    ).toMatchObject({
      status: "resolved",
      targetLibraryItemId: 11,
      matchedBy: "title",
    });

    expect(
      resolveLibraryKnowledgeReference("Launch Plan", [
        {
          libraryItemId: 11,
          title: "Roadmap",
          logicalPath: "plans/roadmap",
          aliases: ["Launch Plan"],
          isReadable: true,
        },
      ]),
    ).toMatchObject({
      status: "resolved",
      targetLibraryItemId: 11,
      matchedBy: "alias",
    });

    expect(
      resolveLibraryKnowledgeReference("./plans/roadmap.md#intro", [
        {
          libraryItemId: 11,
          title: "Roadmap",
          logicalPath: "plans/roadmap#intro",
          aliases: ["Launch Plan"],
          isReadable: true,
        },
      ]),
    ).toMatchObject({
      status: "resolved",
      targetLibraryItemId: 11,
      matchedBy: "logical_path",
    });

    expect(
      resolveLibraryKnowledgeReference("Decision Log", [
        {
          libraryItemId: 20,
          title: "Decision Log",
          logicalPath: "ops/decision-log",
          aliases: [],
          isReadable: true,
        },
        {
          libraryItemId: 21,
          title: "Decision Log",
          logicalPath: "finance/decision-log",
          aliases: [],
          isReadable: true,
        },
      ]),
    ).toMatchObject({
      status: "ambiguous",
      targetLibraryItemId: null,
      candidateIds: [20, 21],
    });

    expect(
      resolveLibraryKnowledgeReference("Secret Plan", [
        {
          libraryItemId: 31,
          title: "Secret Plan",
          logicalPath: "private/secret-plan",
          aliases: [],
          isReadable: false,
        },
      ]),
    ).toMatchObject({
      status: "forbidden",
      targetLibraryItemId: null,
      candidateIds: [31],
    });

    expect(resolveLibraryKnowledgeReference("Missing Note", [])).toMatchObject({
      status: "unresolved",
      targetLibraryItemId: null,
      candidateIds: [],
    });
  });
});
