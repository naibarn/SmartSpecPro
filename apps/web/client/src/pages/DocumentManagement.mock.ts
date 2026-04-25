import type { DocumentLibraryItem } from "@/lib/documentManagementUi";

export type DocumentManagementMockFileRecord = {
  item: DocumentLibraryItem;
  content: string;
  extractedText?: string;
};

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchText(record: DocumentManagementMockFileRecord): string {
  const metadata = record.item.metadata ?? {};
  return normalizeSearchText(
    [
      record.item.title,
      record.item.description ?? "",
      record.item.source_url ?? "",
      record.item.item_type,
      record.item.access_source,
      record.item.status,
      JSON.stringify(metadata),
      record.extractedText ?? "",
      record.content,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

const SEARCH_ONLY_TOKEN = "alpha-search-only-101";
const PRIVATE_VAULT_TOKEN = "private-vault-search-only-301";
const SHARED_GROUP_TOKEN = "shared-group-search-only-401";

export const documentManagementMockFileRecordsFixture: DocumentManagementMockFileRecord[] = [
  {
    item: {
      id: 3010,
      item_type: "folder",
      title: "Knowledge Hub",
      description: "Folder of knowledge files and uploaded notes.",
      source: "document_management",
      source_url: null,
      metadata: {
        searchTags: ["knowledge", "library", "folder"],
      },
      access_source: "owner",
      status: "ready",
      updated_at: "2026-04-22T06:00:00.000Z",
      created_at: "2026-04-20T06:00:00.000Z",
      parent_id: null,
    },
    content: `Knowledge hub folder.
Contains uploaded files, OCR notes, markdown, and preview-safe content.
Keywords for search: documentManagementTableRowsFixture, upload, OCR, preview, library.`,
    extractedText:
      "Knowledge hub folder with uploaded files, OCR notes, and markdown previews.",
  },
  {
    item: {
      id: 101,
      item_type: "md",
      title: "Desktop Worker With ZeroClaw-OpenClaw-NemoClaw.md",
      description: "Primary knowledge note used by the smoke test.",
      source: "document_management",
      source_url: "/knowledge/101.md",
      thumbnail_url: null,
      metadata: {
        extension: "md",
        searchTags: ["desktop", "worker", "graph", "navigation-first"],
      },
      access_source: "owner",
      status: "ready",
      updated_at: "2026-04-22T10:00:00.000Z",
      created_at: "2026-04-21T10:00:00.000Z",
      parent_id: null,
    },
    content: `# Desktop Worker With ZeroClaw-OpenClaw-NemoClaw

This fixture simulates a real markdown file a user typed and saved.

Search terms that should find this file from anywhere:
- documentManagementTableRowsFixture
- ZeroClaw
- OpenClaw
- NemoClaw
- OCR
- upload
- preview
- ${SEARCH_ONLY_TOKEN}

## Notes

The content intentionally includes long-form text, bullet points, and a code block.

\`\`\`ts
export const searchableMock = "documentManagementTableRowsFixture";
\`\`\`
`,
    extractedText:
      `This markdown file includes documentManagementTableRowsFixture, OCR, upload, preview, ${SEARCH_ONLY_TOKEN}, and ZeroClaw OpenClaw NemoClaw.`,
  },
  {
    item: {
      id: 301,
      item_type: "md",
      title: "Private Vault Design.md",
      description: "Markdown note inside the private vault scope.",
      source: "document_management",
      source_url: "/knowledge/private-vault-design.md",
      metadata: {
        extension: "md",
        searchTags: ["private", "vault", "security"],
      },
      access_source: "owner",
      status: "ready",
      updated_at: "2026-04-22T08:30:00.000Z",
      created_at: "2026-04-20T08:30:00.000Z",
      parent_id: null,
    },
    content: `# Private Vault Design

This private vault file behaves like a real user upload.
Searchable tokens: private vault, secure pin, OCR, upload, preview, documentManagementTableRowsFixture, ${PRIVATE_VAULT_TOKEN}.
`,
    extractedText:
      `Private vault design file with secure pin, OCR, upload, preview, documentManagementTableRowsFixture, and ${PRIVATE_VAULT_TOKEN}.`,
  },
  {
    item: {
      id: 302,
      item_type: "image",
      title: "Architecture Sketch.png",
      description: "A visual aid for the UI test.",
      source: "document_management",
      source_url: "https://example.com/architecture-sketch.png",
      thumbnail_url: "https://example.com/architecture-sketch-thumb.png",
      metadata: {
        extension: "png",
        searchTags: ["architecture", "diagram", "ocr"],
      },
      access_source: "shared_direct",
      status: "indexing",
      updated_at: "2026-04-22T09:30:00.000Z",
      created_at: "2026-04-20T09:30:00.000Z",
      parent_id: null,
    },
    content: `PNG image asset.
The caption mentions architecture, OCR, upload preview, and documentManagementTableRowsFixture.`,
    extractedText:
      "Architecture sketch with OCR friendly labels, upload preview, and documentManagementTableRowsFixture.",
  },
  {
    item: {
      id: 303,
      item_type: "video",
      title: "Walkthrough.mp4",
      description: "Video asset for preview state coverage.",
      source: "document_management",
      source_url: "https://example.com/walkthrough.mp4",
      thumbnail_url: "https://example.com/walkthrough-thumb.jpg",
      metadata: {
        extension: "mp4",
        searchTags: ["walkthrough", "demo", "preview"],
      },
      access_source: "shared_group",
      status: "ready",
      updated_at: "2026-04-22T08:45:00.000Z",
      created_at: "2026-04-20T08:45:00.000Z",
      parent_id: null,
    },
    content: `Video walkthrough for the file picker.
Includes terms like preview, upload, OCR, and documentManagementTableRowsFixture so search can match it.`,
    extractedText:
      "Video walkthrough about upload, preview, OCR, and documentManagementTableRowsFixture.",
  },
  {
    item: {
      id: 401,
      item_type: "md",
      title: "Shared Group Playbook.md",
      description: "Markdown note surfaced from a shared group.",
      source: "document_management",
      source_url: "/knowledge/shared-group-playbook.md",
      metadata: {
        extension: "md",
        searchTags: ["shared", "group", "collaboration"],
      },
      access_source: "shared_group",
      status: "ready",
      updated_at: "2026-04-22T08:00:00.000Z",
      created_at: "2026-04-20T08:00:00.000Z",
      parent_id: null,
    },
    content: `# Shared Group Playbook

This shared group file contains collaboration steps, preview notes, and upload instructions.
It also mentions OCR, documentManagementTableRowsFixture, and ${SHARED_GROUP_TOKEN} for search coverage.
`,
    extractedText:
      `Shared group playbook with collaboration steps, preview notes, upload instructions, OCR, documentManagementTableRowsFixture, and ${SHARED_GROUP_TOKEN}.`,
  },
  {
    item: {
      id: 304,
      item_type: "audio",
      title: "Narration.m4a",
      description: "Audio asset for preview state coverage.",
      source: "document_management",
      source_url: "https://example.com/narration.m4a",
      metadata: {
        extension: "m4a",
        searchTags: ["narration", "voice", "preview"],
      },
      access_source: "owner",
      status: "draft",
      updated_at: "2026-04-22T08:15:00.000Z",
      created_at: "2026-04-20T08:15:00.000Z",
      parent_id: null,
    },
    content: `Audio narration notes.
This mock file mentions upload, preview, OCR, and searchable content.`,
    extractedText:
      "Audio narration with searchable content, upload, preview, and OCR terms.",
  },
  {
    item: {
      id: 305,
      item_type: "pdf",
      title: "Release Notes.pdf",
      description: "PDF row for direct table coverage.",
      source: "document_management",
      source_url: "https://example.com/release-notes.pdf",
      metadata: {
        extension: "pdf",
        searchTags: ["release", "notes", "ocr"],
      },
      access_source: "owner",
      status: "archived",
      updated_at: "2026-04-22T07:45:00.000Z",
      created_at: "2026-04-20T07:45:00.000Z",
      parent_id: null,
    },
    content: `PDF release notes.
This text intentionally includes documentManagementTableRowsFixture, OCR, upload, and full text search.`,
    extractedText:
      "Release notes PDF with OCR, upload, and documentManagementTableRowsFixture terms.",
  },
];

export const documentManagementTableRowsFixture = documentManagementMockFileRecordsFixture.map(
  record => record.item,
);

export function getDocumentManagementMockItems(scope: string): DocumentLibraryItem[] {
  if (scope === "private_vault") {
    return documentManagementTableRowsFixture.filter(item => item.id === 301 || item.id === 305);
  }

  if (scope === "shared_groups") {
    return documentManagementTableRowsFixture.filter(item => item.id === 401 || item.id === 303);
  }

  return documentManagementTableRowsFixture;
}

export function searchDocumentManagementMockItems(
  scope: string,
  query: string,
  filters?: Partial<{ itemType?: string; status?: string }>
): DocumentLibraryItem[] {
  const normalizedQuery = normalizeSearchText(query);
  return documentManagementMockFileRecordsFixture
    .filter(record => getDocumentManagementMockItems(scope).some(item => item.id === record.item.id))
    .filter(record => {
      if (filters?.itemType && record.item.item_type !== filters.itemType) {
        return false;
      }
      if (filters?.status && record.item.status !== filters.status) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return buildSearchText(record).includes(normalizedQuery);
    })
    .map(record => record.item);
}

export function getDocumentManagementSearchableTextById(
  id: number,
): string | null {
  const record = documentManagementMockFileRecordsFixture.find(entry => entry.item.id === id);
  return record ? buildSearchText(record) : null;
}
