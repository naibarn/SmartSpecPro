/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getKnowledgeInspectorFixture,
  knowledgeVaultFixture,
} from "@/test/fixtures/knowledgeVaultFixture";
import {
  getDocumentManagementMockItems,
  searchDocumentManagementMockItems,
} from "./DocumentManagement.mock";
import {
  clearPrivateVaultAccessToken,
  setPrivateVaultAccessToken,
} from "@/lib/privateVault";

const { mockSetLocation, mockInvalidate } = vi.hoisted(() => ({
  mockSetLocation: vi.fn(),
  mockInvalidate: vi.fn(),
}));

function mockQuery<T>(
  data: T,
  extras?: Partial<{ isLoading: boolean; error: Error | null }>,
) {
  return {
    data,
    isLoading: extras?.isLoading ?? false,
    error: extras?.error ?? null,
  };
}

function mockMutation(overrides?: Record<string, unknown>) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    error: null,
    data: undefined,
    reset: vi.fn(),
    ...overrides,
  };
}

function getScopeFromSearch(input?: { scope?: string }) {
  return input?.scope ?? "my_library";
}

function getDocumentsForScope(scope: string) {
  return getDocumentManagementMockItems(scope);
}

function getSearchDocumentsForScope(
  scope: string,
  query: string,
  folderId: number | null | undefined,
  filters?: { itemType?: string; status?: string },
) {
  if (!query.trim()) {
    return getDocumentsForScope(scope);
  }

  if (
    query.toLowerCase().includes("graph-api-contract") &&
    scope === "my_library"
  ) {
    if (folderId !== undefined) {
      return [];
    }

    return [
      {
        id: 999,
        item_type: "md",
        title: "Graph API Contract.md",
        description: "A nested markdown note used to verify global search.",
        source: "document_management",
        source_url: "/knowledge/graph/api-contract.md",
        metadata: {
          extension: "md",
          logical_path: "knowledge/graph/api-contract",
          searchTags: ["graph", "api", "contract"],
        },
        access_source: "owner",
        status: "ready",
        updated_at: "2026-04-22T11:00:00.000Z",
        created_at: "2026-04-20T11:00:00.000Z",
        parent_id: 110,
      },
    ];
  }

  return searchDocumentManagementMockItems(scope, query, filters);
}

vi.mock("wouter", () => ({
  useLocation: () => ["/document-management", mockSetLocation],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 1, role: "member" },
    isLoading: false,
    isAuthenticated: true,
  }),
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      library: {
        listDocuments: { invalidate: mockInvalidate },
        search: { invalidate: mockInvalidate },
      },
    }),
    library: {
      getPreferences: undefined,
      listDocuments: {
        useQuery: (input: { scope?: string }) =>
          mockQuery({
            results: getDocumentsForScope(getScopeFromSearch(input)),
          }),
      },
      search: {
        useQuery: (input: {
          scope?: string;
          query?: string;
          folderId?: number | null;
          filters?: { itemType?: string; status?: string };
        }) =>
          mockQuery({
            results: getSearchDocumentsForScope(
              getScopeFromSearch(input),
              String(input?.query ?? ""),
              input?.folderId,
              input?.filters,
            ),
          }),
      },
      getUploadStatus: {
        useQuery: () => mockQuery([]),
      },
      getItem: {
        useQuery: () => mockQuery(null),
      },
      getMarkdownContent: {
        useQuery: ({ id }: { id: number }) =>
          mockQuery(
            knowledgeVaultFixture.markdownById[id]
              ? {
                  content: knowledgeVaultFixture.markdownById[id],
                  updated_at: "2026-04-22T10:00:00.000Z",
                }
              : null,
          ),
      },
      getKnowledgeInspector: {
        useQuery: ({ itemId }: { itemId: number }) =>
          mockQuery(getKnowledgeInspectorFixture(itemId)),
      },
      getKnowledgeVaultPolicy: {
        useQuery: () =>
          mockQuery({
            enabled: true,
            releaseGateStatus: "ready",
            surfaces: {
              quickSwitcher: true,
              inspector: true,
              savedViews: true,
              contextPacks: true,
              graph: true,
              canvas: true,
            },
            surfaceReasons: {
              quickSwitcher: [],
              inspector: [],
              savedViews: [],
              contextPacks: [],
              graph: [],
              canvas: [],
            },
          }),
      },
      getPublicShareLink: {
        useQuery: () => mockQuery(null),
      },
      getFolderPath: {
        useQuery: () => mockQuery([]),
      },
      saveMarkdown: {
        useMutation: () => mockMutation(),
      },
      uploadFile: {
        useMutation: () => mockMutation(),
      },
      replaceFile: {
        useMutation: () => mockMutation(),
      },
      createItem: {
        useMutation: () => mockMutation(),
      },
      updateItem: {
        useMutation: () => mockMutation(),
      },
      deleteItem: {
        useMutation: () => mockMutation(),
      },
      deleteItems: {
        useMutation: () => mockMutation(),
      },
    },
    users: {
      getPreferences: {
        useQuery: () =>
          mockQuery({
            privateVault: { enabled: true },
          }),
      },
      unlockPrivateVault: {
        useMutation: () =>
          mockMutation({
            mutate: vi.fn(),
            mutateAsync: vi.fn().mockResolvedValue({ token: "mock-token" }),
          }),
      },
    },
    systemSettings: {
      getReindexStatus: {
        useQuery: () => mockQuery(null),
      },
      triggerReindex: {
        useMutation: () => mockMutation(),
      },
    },
    presentation: {
      createDeck: {
        useMutation: () => mockMutation(),
      },
    },
    googleDrive: {
      importDriveFile: {
        useMutation: () => mockMutation(),
      },
    },
  },
}));

vi.mock("@/components/library/DocumentGridList", () => ({
  default: ({
    items,
    onSelect,
  }: {
    items: Array<{ id: number; title: string; item_type: string }>;
    onSelect: (item: any) => void;
  }) => (
    <div data-testid="document-grid-list">
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item)}
          data-testid={`document-item-${item.id}`}
        >
          {item.title}
        </button>
      ))}
    </div>
  ),
}));

function stubComponent(testId: string) {
  return () => <div data-testid={testId} />;
}

vi.mock("@/components/library/DocumentLibraryTabs", () => ({
  default: stubComponent("document-library-tabs"),
}));
vi.mock("@/components/library/DocumentPreviewPanel", () => ({
  default: ({ item }: { item?: { title?: string } }) => (
    <div data-testid="document-preview-panel">{item?.title ?? "preview"}</div>
  ),
}));
vi.mock("@/components/library/GoogleDriveBrowser", () => ({
  default: stubComponent("google-drive-browser"),
}));
vi.mock("@/components/library/KnowledgeCanvasPanel", () => ({
  default: stubComponent("knowledge-canvas-panel"),
}));
vi.mock("@/components/library/KnowledgeGraphView", () => ({
  default: ({ activeNote }: { activeNote: { title: string } }) => (
    <div data-testid="knowledge-graph-view">Graph for {activeNote.title}</div>
  ),
}));
vi.mock("@/components/library/KnowledgeInspectorPanel", () => ({
  default: stubComponent("knowledge-inspector-panel"),
}));
vi.mock("@/components/library/KnowledgeQuickSwitcherDialog", () => ({
  default: stubComponent("knowledge-quick-switcher-dialog"),
}));
vi.mock("@/components/library/KnowledgeVaultOverviewPanel", () => ({
  default: stubComponent("knowledge-vault-overview-panel"),
}));
vi.mock("@/components/library/OneDriveBrowser", () => ({
  default: stubComponent("onedrive-browser"),
}));
vi.mock("@/components/library/PropertyCatalogPanel", () => ({
  default: stubComponent("property-catalog-panel"),
}));
vi.mock("@/components/library/SavedViewsPanel", () => ({
  default: stubComponent("saved-views-panel"),
}));
vi.mock("@/components/library/TrashPanel", () => ({
  TrashPanel: stubComponent("trash-panel"),
}));
vi.mock("@/components/library/CreateFolderDialog", () => ({
  default: stubComponent("create-folder-dialog"),
}));
vi.mock("@/components/library/ShareLibraryDialog", () => ({
  default: stubComponent("share-library-dialog"),
}));
vi.mock("@/components/LocaleToggle", () => ({
  LocaleToggle: stubComponent("locale-toggle"),
}));
vi.mock("@/components/library/ContextPackManager", () => ({
  default: stubComponent("context-pack-manager"),
}));

import DocumentManagement from "./DocumentManagement";

describe("DocumentManagement page integration", () => {
beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "innerWidth", {
      value: 1600,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 1000,
      configurable: true,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: vi.fn(),
      configurable: true,
    });
    window.history.replaceState(
      {},
      "",
      "/document-management?scope=my_library&mode=library",
    );
    window.localStorage.clear();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("1280"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    clearPrivateVaultAccessToken();
  });

  it("opens the virtual graph automatically after selecting a markdown file from the library", async () => {
    render(<DocumentManagement />);

    fireEvent.click(screen.getByTestId("document-item-101"));

    await waitFor(() => {
      expect(screen.getByText(/virtual graph/i)).toBeTruthy();
    });

    expect(screen.getByRole("button", { name: /collapse virtual graph/i })).toBeTruthy();
    expect(
      screen.getAllByText(knowledgeVaultFixture.activeNote.title).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(knowledgeVaultFixture.inspector.note.title).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Backlinks$/i).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        `Shared-tag neighbors: ${knowledgeVaultFixture.inspector.sharedTags.length}`,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        `Hybrid/vector related: ${knowledgeVaultFixture.inspector.semanticRelated.length}`,
      ).length,
    ).toBeGreaterThan(0);
  });

  it("keeps the knowledge panel dock usable with the shared fixture", async () => {
    render(<DocumentManagement />);

    fireEvent.click(screen.getByTestId("document-item-101"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /collapse virtual graph/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /collapse virtual graph/i }));

    expect(screen.getByRole("button", { name: /expand virtual graph/i })).toBeTruthy();
    expect(screen.getByText(/virtual graph/i)).toBeTruthy();
  });

  it("renders the graphical virtual graph inside the floating panel", async () => {
    render(<DocumentManagement />);

    fireEvent.click(screen.getByTestId("document-item-101"));

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-graph-view")).toBeTruthy();
    });

    expect(
      screen.getByText(`Graph for ${knowledgeVaultFixture.inspector.note.title}`),
    ).toBeTruthy();
  });

  it("finds a document when the query appears inside the file content", async () => {
    render(<DocumentManagement />);

    fireEvent.change(screen.getByPlaceholderText("documentManagement.searchFiles"), {
      target: { value: "alpha-search-only-101" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("document-item-101")).toBeTruthy();
    });
  });

  it("searches across the whole library instead of only the current folder", async () => {
    render(<DocumentManagement />);

    fireEvent.change(screen.getByPlaceholderText("documentManagement.searchFiles"), {
      target: { value: "graph-api-contract" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("document-item-999")).toBeTruthy();
    });

    expect(screen.getByText("Graph API Contract.md")).toBeTruthy();
  });

  it("works from the private vault scope with the same virtual graph flow", async () => {
    setPrivateVaultAccessToken("mock-private-vault-token");
    window.history.replaceState(
      {},
      "",
      "/document-management?scope=private_vault&mode=library",
    );

    render(<DocumentManagement />);

    expect(
      await screen.findByText("documentManagement.privateVault.lockedTitle"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /documentManagement\.privateVault\.unlock/i }),
    ).toBeTruthy();
  });

  it("works from a shared group scope as well", async () => {
    window.history.replaceState(
      {},
      "",
      "/document-management?scope=shared_groups&mode=library",
    );

    render(<DocumentManagement />);

    const list = await screen.findByTestId("document-grid-list");
    fireEvent.click(within(list).getByTestId("document-item-401"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /collapse virtual graph/i })).toBeTruthy();
    });

    expect(
      screen.getAllByText("Shared Group Playbook.md").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/shared group playbook\.md/i).length,
    ).toBeGreaterThan(0);
  });
});
