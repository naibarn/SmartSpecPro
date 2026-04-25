/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getKnowledgeGraphFixture,
  getKnowledgeScopedDocumentsFixture,
  knowledgeVaultFixture,
} from "@/test/fixtures/knowledgeVaultFixture";

let mockPrivateVaultToken: string | null = null;

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
  return getKnowledgeScopedDocumentsFixture(scope);
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

vi.mock("@/lib/privateVault", () => ({
  getPrivateVaultAccessToken: () => mockPrivateVaultToken,
  setPrivateVaultAccessToken: (token: string) => {
    mockPrivateVaultToken = token.trim() || null;
  },
  clearPrivateVaultAccessToken: () => {
    mockPrivateVaultToken = null;
  },
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
      listDocuments: {
        useQuery: (input: { scope?: string }) =>
          mockQuery({
            results: getDocumentsForScope(getScopeFromSearch(input)),
          }),
      },
      search: {
        useQuery: (input: { scope?: string }) =>
          mockQuery({ results: getDocumentsForScope(getScopeFromSearch(input)) }),
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
          mockQuery(getKnowledgeGraphFixture(itemId)),
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

describe("DocumentManagement private vault gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrivateVaultToken = null;
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
      "/document-management?scope=private_vault&mode=library",
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

  it("shows the locked private vault gate when the vault is not unlocked", () => {
    render(<DocumentManagement />);

    expect(
      screen.getByRole("heading", { name: /documentManagement\.privateVault\.lockedTitle/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /documentManagement\.privateVault\.unlock/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("document-grid-list")).not.toBeInTheDocument();
  });

  it("ships private vault fixture data for future scope tests", () => {
    const privateVaultDocuments = getKnowledgeScopedDocumentsFixture("private_vault");

    expect(privateVaultDocuments).toHaveLength(2);
    expect(privateVaultDocuments.some(doc => doc.item_type === "md")).toBe(true);
    expect(privateVaultDocuments.some(doc => doc.item_type !== "md")).toBe(true);
    expect(getKnowledgeGraphFixture(301).note.title).toBe("Private Vault Design.md");
    render(<DocumentManagement />);

    expect(
      screen.getByRole("heading", { name: /documentManagement\.privateVault\.lockedTitle/i }),
    ).toBeInTheDocument();
  });
});
