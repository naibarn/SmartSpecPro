/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { knowledgeVaultFixture } from "@/test/fixtures/knowledgeVaultFixture";

const getItemSharesMock = vi.fn(() => ({
  data: { shares: [] },
}));
const quickSwitchNotesMock = vi.fn(() => ({
  data: { results: [] },
  isLoading: false,
}));
const knowledgeInspectorMock = vi.fn(() => ({
  data: null,
  isLoading: false,
}));
const getMarkdownContentMock = vi.fn(() => ({
  data: null,
  isLoading: false,
}));

const processingMetaMock = vi.fn(() => ({
  label: "Ready",
  className: "bg-emerald-100 text-emerald-800",
  detail: "Should be hidden for media previews",
  searchQuality: "metadata_only",
}));

const shareButtonMock = vi.fn((props: { compact?: boolean }) => (
  <button data-testid="share-button" data-compact={String(Boolean(props.compact))} type="button">
    Share
  </button>
));

const versionHistoryMock = vi.fn((props: { compact?: boolean }) => (
  <button data-testid="version-history" data-compact={String(Boolean(props.compact))} type="button">
    Version History
  </button>
));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    library: {
      getItemShares: {
        useQuery: (...args: any[]) => getItemSharesMock(...args),
      },
      quickSwitchNotes: {
        useQuery: (...args: any[]) => quickSwitchNotesMock(...args),
      },
      getKnowledgeInspector: {
        useQuery: (...args: any[]) => knowledgeInspectorMock(...args),
      },
      getMarkdownContent: {
        useQuery: (...args: any[]) => getMarkdownContentMock(...args),
      },
      exportMarkdownArtifact: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("@/lib/libraryUi", () => ({
  getLibraryItemProcessingMeta: (...args: any[]) => processingMetaMock(...args),
}));

vi.mock("@/lib/previewHostSafety", () => ({
  getOfficePreviewDecision: () => null,
}));

vi.mock("./ShareButton", () => ({
  ShareButton: (props: any) => shareButtonMock(props),
}));

vi.mock("./DocumentVersionHistory", () => ({
  DocumentVersionHistory: (props: any) => versionHistoryMock(props),
}));

vi.mock("./ShareDialog", () => ({
  ShareDialog: () => null,
}));

vi.mock("../editor/UnifiedDocumentSurface", () => ({
  default: ({ surfaceHeaderActions, editorHeaderActions }: { surfaceHeaderActions?: any; editorHeaderActions?: any }) => (
    <div data-testid="unified-document-surface">
      {surfaceHeaderActions}
      {editorHeaderActions}
    </div>
  ),
}));

import DocumentPreviewPanel from "./DocumentPreviewPanel";

function renderPreview(previewType: "image" | "video") {
  return render(
    <DocumentPreviewPanel
      item={{
        id: 1,
        title: previewType === "image" ? "Old1.png" : "Video 01.mp4",
        source_url: `https://example.com/${previewType}`,
        status: "ready",
        item_type: previewType,
        metadata: {},
      } as any}
      previewType={previewType}
      previewText="Preview text"
      documentId={1}
      shareUrl="https://example.com/document-management?scope=my_library&sort=updated_desc&mode=editor&doc=1"
    />,
  );
}

function renderMarkdownPreview(shareUrl?: string) {
  return render(
      <DocumentPreviewPanel
        item={{
          id: knowledgeVaultFixture.activeNote.libraryItemId,
          title: knowledgeVaultFixture.activeNote.title,
          source_url: "https://example.com/notes.md",
          status: "ready",
          item_type: "document",
          metadata: {},
        } as any}
        previewType="markdown"
        markdownValue={knowledgeVaultFixture.markdownById[101]}
        documentId={knowledgeVaultFixture.activeNote.libraryItemId}
        shareUrl={shareUrl}
      />,
    );
  }

describe("DocumentPreviewPanel media previews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
    });
    getItemSharesMock.mockReturnValue({ data: { shares: [] } });
    processingMetaMock.mockReturnValue({
      label: "Ready",
      className: "bg-emerald-100 text-emerald-800",
      detail: "Should be hidden for media previews",
      searchQuality: "metadata_only",
    });
  });

  it.each(["image", "video"] as const)(
    "renders %s preview with a compact header and fit-to-page body",
    (previewType) => {
      renderPreview(previewType);

      expect(screen.getByTestId("media-preview-body").className).toContain("overflow-hidden");
      expect(screen.getByRole("button", { name: /enter fullscreen preview/i })).toBeTruthy();
      expect(screen.getByTestId("share-button").getAttribute("data-compact")).toBe("true");
      expect(screen.getByRole("button", { name: /copy link/i })).toBeTruthy();
      expect(screen.getByTestId("version-history").getAttribute("data-compact")).toBe("true");
      expect(screen.queryByText("Should be hidden for media previews")).toBeNull();
      expect(screen.queryByText("Metadata Search")).toBeNull();
    },
  );

  it.each(["image", "video"] as const)(
    "renders and invokes the Gallery action for eligible %s media",
    async (previewType) => {
    const onAddToGallery = vi.fn().mockResolvedValue(undefined);

    render(
      <DocumentPreviewPanel
        item={{
          id: 1,
          title: previewType === "image" ? "hero.png" : "clip.mp4",
          source_url: `/api/storage/files/library/${previewType}`,
          status: "ready",
          item_type: previewType,
          metadata: {},
        } as any}
        previewType={previewType}
        canAddToGallery
        onAddToGallery={onAddToGallery}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /add to gallery/i }));
    await waitFor(() => expect(onAddToGallery).toHaveBeenCalledTimes(1));
    },
  );

  it("does not render the Gallery action when eligibility is not granted", () => {
    renderPreview("video");

    expect(screen.queryByRole("button", { name: /add to gallery/i })).toBeNull();
  });

  it("renders a markdown download/export heading in the editor header", async () => {
    renderMarkdownPreview("https://example.com/document-management?scope=my_library&sort=updated_desc&mode=editor&doc=1");

    expect(await screen.findByText("ดาวน์โหลด Markdown", { selector: "div" })).toBeTruthy();
    expect(screen.getByLabelText(/ดาวน์โหลดไฟล์ markdown ต้นฉบับ/i)).toBeTruthy();
    expect(screen.getByLabelText(/ส่งออก markdown/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy link/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "https://example.com/document-management?scope=my_library&sort=updated_desc&mode=editor&doc=1",
      );
    });
    expect(screen.getByRole("button", { name: /link copied/i })).toBeTruthy();
  });

  it("shows share button even before a public link exists", () => {
    renderMarkdownPreview("");

    expect(screen.getByTestId("share-button")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /copy link/i })).toBeNull();
  });

  it("renders clickable backlink badges for markdown notes", () => {
    const onOpenKnowledgeItem = vi.fn();

    render(
      <DocumentPreviewPanel
        item={{
          id: knowledgeVaultFixture.activeNote.libraryItemId,
          title: knowledgeVaultFixture.activeNote.title,
          source_url: "https://example.com/notes.md",
          status: "ready",
          item_type: "document",
          metadata: {},
        } as any}
        previewType="markdown"
        markdownValue={knowledgeVaultFixture.markdownById[101]}
        documentId={knowledgeVaultFixture.activeNote.libraryItemId}
        knowledgeBacklinks={knowledgeVaultFixture.inspector.backlinks}
        onOpenKnowledgeItem={onOpenKnowledgeItem}
      />,
    );

    expect(screen.getByText(/backlinks/i)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: /workspace navigation handbook\.md/i,
      }),
    );
    expect(onOpenKnowledgeItem).toHaveBeenCalledWith(
      knowledgeVaultFixture.inspector.backlinks[0].libraryItemId,
      knowledgeVaultFixture.inspector.backlinks[0].title,
    );
  });
});
