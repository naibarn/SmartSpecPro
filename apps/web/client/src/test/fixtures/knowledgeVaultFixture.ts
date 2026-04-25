import { documentManagementTableRowsFixture } from "@/pages/DocumentManagement.mock";

export const knowledgeVaultFixture = {
  activeNote: {
    libraryItemId: 101,
    title: "Desktop Worker With ZeroClaw-OpenClaw-NemoClaw.md",
    logicalPath: "navigation-first/desktop-worker",
    item_type: "md",
    aliases: ["Desktop Worker", "ZeroClaw Worker", "NemoClaw Guide"],
    tags: ["navigation-first", "graph", "docs"],
  },
  quickSwitchResults: [
    {
      libraryItemId: 101,
      title: "Desktop Worker With ZeroClaw-OpenClaw-NemoClaw.md",
      logicalPath: "navigation-first/desktop-worker",
      aliases: ["Desktop Worker", "ZeroClaw Worker"],
      matchType: "exact_title",
      disambiguation: null,
    },
    {
      libraryItemId: 201,
      title: "Graph Setup Checklist.md",
      logicalPath: "navigation-first/graph-setup",
      aliases: ["Graph Checklist"],
      matchType: "fuzzy",
      disambiguation: "Implementation",
    },
    {
      libraryItemId: 202,
      title: "Runtime Context Rules.md",
      logicalPath: "platform/runtime-context",
      aliases: ["Runtime Guardrails"],
      matchType: "alias",
      disambiguation: "Policy",
    },
  ],
  inspector: {
    note: {
      libraryItemId: 101,
      title: "Desktop Worker With ZeroClaw-OpenClaw-NemoClaw.md",
      logicalPath: "navigation-first/desktop-worker",
      aliases: ["Desktop Worker", "ZeroClaw Worker", "NemoClaw Guide"],
      tags: ["navigation-first", "graph", "docs"],
      properties: {
        owner: "platform",
        status: "draft",
        releaseGate: "knowledge_ready",
        lastReviewed: "2026-04-22",
      },
    },
    outgoing: [
      {
        libraryItemId: 201,
        title: "Graph Setup Checklist.md",
        logicalPath: "navigation-first/graph-setup",
        rawReference: "[Graph Setup Checklist](./Graph Setup Checklist.md)",
        status: "resolved",
      },
      {
        libraryItemId: 202,
        title: "Runtime Context Rules.md",
        logicalPath: "platform/runtime-context",
        rawReference: "[Runtime Context Rules](./Runtime Context Rules.md)",
        status: "resolved",
      },
    ],
    backlinks: [
      {
        libraryItemId: 203,
        title: "Workspace Navigation Handbook.md",
        logicalPath: "navigation-first/handbook",
        rawReference: "Desktop Worker With ZeroClaw-OpenClaw-NemoClaw",
        status: "resolved",
      },
    ],
    unlinkedMentions: [
      {
        libraryItemId: 204,
        title: "ZeroClaw Rollout Note.md",
        logicalPath: "platform/rollout",
        matchedText: "ZeroClaw",
      },
      {
        libraryItemId: 205,
        title: "OpenClaw Launch Memo.md",
        logicalPath: "platform/launch",
        matchedText: "OpenClaw",
      },
    ],
    sharedTags: [
      {
        libraryItemId: 206,
        title: "Navigation Handbook.md",
        logicalPath: "navigation-first/handbook",
        sharedTags: ["navigation-first", "docs"],
      },
      {
        libraryItemId: 207,
        title: "Graph Explorer Notes.md",
        logicalPath: "navigation-first/graph-explorer",
        sharedTags: ["graph", "docs"],
      },
    ],
    semanticRelated: [
      {
        libraryItemId: 208,
        title: "Workspace Tuning.md",
        logicalPath: "platform/workspace-tuning",
        score: 0.91,
        rationale: "Shares rollout and workspace-navigation language.",
      },
      {
        libraryItemId: 209,
        title: "Editor Layout Strategy.md",
        logicalPath: "platform/editor-layout",
        score: 0.84,
        rationale: "Describes dockable panels and layout persistence.",
      },
    ],
    localGraph: {
      nodes: [
        { id: "101", title: "Desktop Worker With ZeroClaw-OpenClaw-NemoClaw.md" },
        { id: "201", title: "Graph Setup Checklist.md" },
        { id: "202", title: "Runtime Context Rules.md" },
        { id: "203", title: "Workspace Navigation Handbook.md" },
        { id: "206", title: "Navigation Handbook.md" },
        { id: "208", title: "Workspace Tuning.md" },
      ],
      edges: [
        { id: "edge-1", source: "101", target: "201" },
        { id: "edge-2", source: "101", target: "202" },
        { id: "edge-3", source: "203", target: "101" },
        { id: "edge-4", source: "101", target: "206" },
        { id: "edge-5", source: "101", target: "208" },
      ],
    },
  },
  markdownById: {
    101: `---
title: Desktop Worker With ZeroClaw-OpenClaw-NemoClaw
owner: platform
status: draft
---

# Desktop Worker With ZeroClaw-OpenClaw-NemoClaw

This note documents the desktop worker flow for navigation-first library work.

## Graph path

- Open [[Graph Setup Checklist]]
- Review [[Runtime Context Rules]]
- Inspect the shared tags and backlinks before widening context.

## Runtime guardrails

The ZeroClaw path keeps the graph window dockable, draggable, and easy to test.

\`\`\`ts
export function buildWorkerPlan() {
  return "ZeroClaw OpenClaw NemoClaw";
}
\`\`\`

Additional mention: ZeroClaw, OpenClaw, and NemoClaw all appear in this branch.
`,
    201: `# Graph Setup Checklist

Checklist for knowledge graph navigation.

## Steps

- Verify backlinks
- Verify outgoing links
- Verify shared-tag neighbors
`,
    202: `# Runtime Context Rules

Use this note to keep runtime context narrow and navigation-first.

## Rules

- Do not auto-attach unrelated notes.
- Prefer graph navigation over bulk context injection.
`,
    203: `# Workspace Navigation Handbook

This backlink source references the main desktop worker note.
`,
    206: `# Navigation Handbook

This note shares the same navigation-first tags and graph vocabulary.
`,
    208: `# Workspace Tuning

This semantic neighbor discusses dockable panels and layout persistence.
`,
    301: `# Private Vault Design

This note lives in the private vault and still participates in the same
knowledge graph flows.

## Safeguards

- Keep runtime context narrow.
- Verify private-only relationships before opening the graph.
`,
    401: `# Shared Group Playbook

This note comes from a shared group and should open the same virtual graph
experience when selected.

## Collaboration

- Review backlinks.
- Review shared-tag neighbors.
`,
  } as Record<number, string>,
  createSuggestion: "Desktop worker graph companion note",
  scopedDocuments: {
    my_library: [
      {
        id: 101,
        item_type: "md",
        title: "Desktop Worker With ZeroClaw-OpenClaw-NemoClaw.md",
        description: "Primary knowledge note used by the smoke test",
        source: "document_management",
        source_url: "/knowledge/101.md",
        metadata: { extension: "md" },
        access_source: "owner",
        status: "ready",
        updated_at: "2026-04-22T10:00:00.000Z",
        created_at: "2026-04-21T10:00:00.000Z",
        parent_id: null,
      },
      {
        id: 201,
        item_type: "txt",
        title: "Operational Checklist.txt",
        description: "Non-markdown item for the same list.",
        source: "document_management",
        source_url: "/knowledge/operational-checklist.txt",
        metadata: { extension: "txt" },
        access_source: "owner",
        status: "ready",
        updated_at: "2026-04-22T09:00:00.000Z",
        created_at: "2026-04-20T09:00:00.000Z",
        parent_id: null,
      },
    ],
    private_vault: [
      {
        id: 301,
        item_type: "md",
        title: "Private Vault Design.md",
        description: "Markdown note inside the private vault scope.",
        source: "document_management",
        source_url: "/knowledge/private-vault-design.md",
        metadata: { extension: "md" },
        access_source: "owner",
        status: "ready",
        updated_at: "2026-04-22T08:30:00.000Z",
        created_at: "2026-04-20T08:30:00.000Z",
        parent_id: null,
      },
      {
        id: 302,
        item_type: "pdf",
        title: "Private Vault Reference.pdf",
        description: "Non-markdown item to keep the scope mixed.",
        source: "document_management",
        source_url: "/knowledge/private-vault-reference.pdf",
        metadata: { extension: "pdf" },
        access_source: "owner",
        status: "ready",
        updated_at: "2026-04-22T08:20:00.000Z",
        created_at: "2026-04-20T08:20:00.000Z",
        parent_id: null,
      },
    ],
    shared_groups: [
      {
        id: 401,
        item_type: "md",
        title: "Shared Group Playbook.md",
        description: "Markdown note surfaced from a shared group.",
        source: "document_management",
        source_url: "/knowledge/shared-group-playbook.md",
        metadata: { extension: "md" },
        access_source: "shared_group",
        status: "ready",
        updated_at: "2026-04-22T08:00:00.000Z",
        created_at: "2026-04-20T08:00:00.000Z",
        parent_id: null,
      },
      {
        id: 402,
        item_type: "txt",
        title: "Shared Group Checklist.txt",
        description: "Another item in the shared scope.",
        source: "document_management",
        source_url: "/knowledge/shared-group-checklist.txt",
        metadata: { extension: "txt" },
        access_source: "shared_group",
        status: "ready",
        updated_at: "2026-04-22T07:50:00.000Z",
        created_at: "2026-04-20T07:50:00.000Z",
        parent_id: null,
      },
    ],
  },
} as const;

export function getKnowledgeInspectorFixture(itemId: number) {
  if (itemId === knowledgeVaultFixture.activeNote.libraryItemId) {
    return knowledgeVaultFixture.inspector;
  }

  if (itemId === 301) {
    return {
      ...knowledgeVaultFixture.inspector,
      note: {
        ...knowledgeVaultFixture.inspector.note,
        libraryItemId: 301,
        title: "Private Vault Design.md",
        logicalPath: "private-vault/design",
      },
    };
  }

  if (itemId === 401) {
    return {
      ...knowledgeVaultFixture.inspector,
      note: {
        ...knowledgeVaultFixture.inspector.note,
        libraryItemId: 401,
        title: "Shared Group Playbook.md",
        logicalPath: "shared-groups/playbook",
      },
    };
  }

  return null;
}

export function getKnowledgeQuickSwitchFixture() {
  return {
    results: knowledgeVaultFixture.quickSwitchResults,
    createSuggestion: knowledgeVaultFixture.createSuggestion,
  };
}

export function getKnowledgeScopedDocumentsFixture(scope: string) {
  return (
    knowledgeVaultFixture.scopedDocuments[
      scope as keyof typeof knowledgeVaultFixture.scopedDocuments
    ] ?? knowledgeVaultFixture.scopedDocuments.my_library
  );
}

export function getKnowledgeGraphFixture(itemId: number = 101) {
  if (itemId === 301) {
    return {
      ...knowledgeVaultFixture.inspector,
      note: {
        ...knowledgeVaultFixture.inspector.note,
        libraryItemId: 301,
        title: "Private Vault Design.md",
        logicalPath: "private-vault/design",
      },
    };
  }

  if (itemId === 401) {
    return {
      ...knowledgeVaultFixture.inspector,
      note: {
        ...knowledgeVaultFixture.inspector.note,
        libraryItemId: 401,
        title: "Shared Group Playbook.md",
        logicalPath: "shared-groups/playbook",
      },
    };
  }

  return knowledgeVaultFixture.inspector;
}

export const knowledgeVaultMockFixtures = {
  spotlight: {
    title: knowledgeVaultFixture.activeNote.title,
    logicalPath: knowledgeVaultFixture.activeNote.logicalPath,
    aliases: knowledgeVaultFixture.activeNote.aliases,
    tags: knowledgeVaultFixture.activeNote.tags,
    backlinksCount: knowledgeVaultFixture.inspector.backlinks.length,
    outgoingCount: knowledgeVaultFixture.inspector.outgoing.length,
    mentionCount: knowledgeVaultFixture.inspector.unlinkedMentions.length,
    graphEdgeCount: knowledgeVaultFixture.inspector.localGraph.edges.length,
    sharedTagsCount: knowledgeVaultFixture.inspector.sharedTags.length,
    semanticRelatedCount: knowledgeVaultFixture.inspector.semanticRelated.length,
  },
  quickSwitcher: getKnowledgeQuickSwitchFixture(),
  graph: getKnowledgeGraphFixture(),
  overviewPanel: {
    pending: false,
    enabled: true,
    activeMode: "browse" as const,
    blockedReasons: ["release_gate_not_ready"],
    modes: [
      {
        mode: "browse" as const,
        label: "Browse",
        description: "Browse notes",
        enabled: true,
      },
      {
        mode: "related" as const,
        label: "Related",
        description: "Inspect relationships",
        enabled: true,
      },
      {
        mode: "graph" as const,
        label: "Graph",
        description: "Inspect graph",
        enabled: true,
      },
      {
        mode: "memory_packs" as const,
        label: "Memory Packs",
        description: "Curate packs",
        enabled: false,
      },
      {
        mode: "canvas" as const,
        label: "Canvas Boards",
        description: "Inspect boards",
        enabled: true,
      },
    ],
    quickSwitcherEnabled: true,
    releaseGateStatus: "unknown",
    selectedMarkdownTitle: "Roadmap.md",
  },
  documentManagement: {
    scopes: knowledgeVaultFixture.scopedDocuments,
    markdownById: knowledgeVaultFixture.markdownById,
  },
  documentGridListRows: documentManagementTableRowsFixture,
} as const;
