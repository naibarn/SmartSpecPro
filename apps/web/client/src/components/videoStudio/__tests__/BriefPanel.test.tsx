/**
 * BriefPanel coverage — topic/audience preset chips (fill-then-edit,
 * product-name interpolation), helper text, and the renamed
 * "draft outline, not a render" init button/caption. Same hand-rolled
 * `@/lib/trpc` mock convention as `QaPanel.test.tsx`.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "th" } }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// The format-migrate confirm (§4.11/AC17) renders an `AlertDialog`, which is
// a native <dialog> under the hood — jsdom doesn't implement showModal()/
// close() (same fix as ScenesPanel.test.tsx/RenderPanel.test.tsx).
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

const updateBriefMutateMock = vi.fn();
const updateBriefMutateAsyncMock = vi.fn().mockResolvedValue(undefined);
const invalidateMock = vi.fn().mockResolvedValue(undefined);
const runAutoDraftMutateMock = vi.fn();
const runContentDraftMutateMock = vi.fn();
const acceptContentDraftMutateMock = vi.fn();
const getContentDraftQueryMock = vi.fn(() => ({ data: null }));
const listRecommendedStageModelsQueryMock = vi.fn(() => ({ data: { models: [] } }));
const getStageEstimateQueryMock = vi.fn(() => ({ data: undefined, isLoading: false, error: undefined }));
const getActiveGenerationJobQueryMock = vi.fn(() => ({ data: undefined }));
const getGenerationJobStatusQueryMock = vi.fn(() => ({ data: undefined }));
let acceptContentDraftResult: unknown = null;

vi.mock("@/lib/trpc", () => ({
  trpc: {
    videoProjects: {
      updateBrief: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: unknown) => updateBriefMutateMock(input, opts),
          mutateAsync: (input: unknown) => updateBriefMutateAsyncMock(input, opts),
          isPending: false,
        }),
      },
      runAutoDraftStage: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: unknown) => runAutoDraftMutateMock(input, opts),
          isPending: false,
        }),
      },
      runContentDraft: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: unknown) => runContentDraftMutateMock(input, opts),
          isPending: false,
        }),
      },
      acceptContentDraft: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: unknown) => {
            acceptContentDraftMutateMock(input, opts);
            if (acceptContentDraftResult !== null) {
              (opts.onSuccess as (result: unknown) => void)?.(acceptContentDraftResult);
            }
          },
          isPending: false,
        }),
      },
      getContentDraft: { useQuery: (...args: unknown[]) => getContentDraftQueryMock(...args) },
      listRecommendedStageModels: { useQuery: (...args: unknown[]) => listRecommendedStageModelsQueryMock(...args) },
      getStageEstimate: { useQuery: (...args: unknown[]) => getStageEstimateQueryMock(...args) },
      getActiveGenerationJob: { useQuery: (...args: unknown[]) => getActiveGenerationJobQueryMock(...args) },
      getGenerationJobStatus: { useQuery: (...args: unknown[]) => getGenerationJobStatusQueryMock(...args) },
    },
    useUtils: () => ({
      videoProjects: {
        get: { invalidate: invalidateMock },
        getContentDraft: { invalidate: invalidateMock },
      },
    }),
  },
}));

import { BriefPanel } from "../BriefPanel";
import { ContentDraftReviewCard } from "../ContentDraftReviewCard";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";

const BASE_DOCUMENT: VideoProjectDocument = {
  schemaVersion: 1,
  format: { width: 1080, height: 1920, fps: 30, durationMs: 8000 },
  content: { language: "th", platformPreset: "tiktok_9_16" },
  brandKitId: null,
  scenes: [],
  audioTracks: [],
  captions: { presetId: "classic_box", burnIn: false, language: "th" },
  claims: [],
  qa: { targetScore: 8, maxLoops: 2 },
};

const BASE_PROJECT = {
  id: 1,
  name: "Test project",
  studioType: "motion",
  brief: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  getContentDraftQueryMock.mockReturnValue({ data: null });
  listRecommendedStageModelsQueryMock.mockReturnValue({ data: { models: [] } });
  acceptContentDraftResult = null;
});

describe("BriefPanel — topic presets", () => {
  it("renders topic preset chips and fills the topic input on click", () => {
    render(
      <BriefPanel
        lang="th"
        project={BASE_PROJECT}
        document={null}
        onDocumentInitialized={vi.fn()}
        onDocumentChange={vi.fn()}
      />,
    );

    const presets = screen.getByTestId("brief-topic-preset");
    fireEvent.click(within(presets).getByRole("button", { name: "รีวิวการใช้งานจริง" }));

    expect(screen.getByLabelText("หัวข้อวิดีโอ")).toHaveValue("รีวิวการใช้งานจริง");
  });

  it("interpolates the product name into the intro preset when the brief has one", () => {
    render(
      <BriefPanel
        lang="th"
        project={{ ...BASE_PROJECT, brief: { productName: "โคมไฟตั้งโต๊ะ" } }}
        document={null}
        onDocumentInitialized={vi.fn()}
        onDocumentChange={vi.fn()}
      />,
    );

    const presets = screen.getByTestId("brief-topic-preset");
    fireEvent.click(within(presets).getByRole("button", { name: "แนะนำสินค้า โคมไฟตั้งโต๊ะ" }));

    expect(screen.getByLabelText("หัวข้อวิดีโอ")).toHaveValue("แนะนำสินค้า โคมไฟตั้งโต๊ะ");
  });

  it("still allows freely typing a custom topic after selecting a preset", () => {
    render(
      <BriefPanel
        lang="th"
        project={BASE_PROJECT}
        document={null}
        onDocumentInitialized={vi.fn()}
        onDocumentChange={vi.fn()}
      />,
    );

    const presets = screen.getByTestId("brief-topic-preset");
    fireEvent.click(within(presets).getByRole("button", { name: "Unboxing เปิดกล่อง" }));

    const topicInput = screen.getByLabelText("หัวข้อวิดีโอ");
    fireEvent.change(topicInput, { target: { value: "หัวข้อของฉันเอง" } });
    expect(topicInput).toHaveValue("หัวข้อของฉันเอง");
  });
});

describe("BriefPanel — audience presets", () => {
  it("renders audience choice chips including a custom option and fills the audience input", () => {
    render(
      <BriefPanel
        lang="th"
        project={BASE_PROJECT}
        document={null}
        onDocumentInitialized={vi.fn()}
        onDocumentChange={vi.fn()}
      />,
    );

    const presets = screen.getByTestId("brief-audience-preset");
    expect(within(presets).getByRole("button", { name: "กำหนดเอง" })).toBeInTheDocument();

    fireEvent.click(within(presets).getByRole("button", { name: "คุณแม่มือใหม่" }));
    expect(screen.getByLabelText("กลุ่มเป้าหมาย")).toHaveValue("คุณแม่มือใหม่");
  });

  it("does not overwrite the audience input when the custom chip is selected", () => {
    render(
      <BriefPanel
        lang="th"
        project={BASE_PROJECT}
        document={null}
        onDocumentInitialized={vi.fn()}
        onDocumentChange={vi.fn()}
      />,
    );

    const presets = screen.getByTestId("brief-audience-preset");
    fireEvent.click(within(presets).getByRole("button", { name: "กำหนดเอง" }));

    const audienceInput = screen.getByLabelText("กลุ่มเป้าหมาย");
    expect(audienceInput).toHaveValue("");
    fireEvent.change(audienceInput, { target: { value: "กลุ่มลูกค้าของฉัน" } });
    expect(audienceInput).toHaveValue("กลุ่มลูกค้าของฉัน");
  });
});

describe("BriefPanel — field helper text", () => {
  it("shows helper text explaining what topic, audience, and notes affect", () => {
    render(
      <BriefPanel
        lang="th"
        project={BASE_PROJECT}
        document={null}
        onDocumentInitialized={vi.fn()}
        onDocumentChange={vi.fn()}
      />,
    );

    expect(screen.getByText("กำหนดแนวเรื่องของฉากที่ AI จะวางแผนให้")).toBeInTheDocument();
    expect(screen.getByText("ปรับโทนภาษาและสไตล์ภาพให้เหมาะกับกลุ่มเป้าหมาย")).toBeInTheDocument();
    expect(
      screen.getByText("ข้อจำกัดหรือสิ่งที่ต้องมีในวิดีโอ เช่น ห้ามพูดเกินจริง ต้องมีโลโก้"),
    ).toBeInTheDocument();
  });
});

describe("BriefPanel — init button clarity", () => {
  it("uses unambiguous copy for the empty-document init button and a caption clarifying no render/credits happen", () => {
    render(
      <BriefPanel
        lang="th"
        project={BASE_PROJECT}
        document={null}
        onDocumentInitialized={vi.fn()}
        onDocumentChange={vi.fn()}
      />,
    );

    const button = screen.getByTestId("video-studio-init-document-button");
    expect(button).toHaveTextContent("เริ่มร่างโครงวิดีโอ (ยังไม่สร้างวิดีโอ)");
    expect(
      screen.getByText(
        "ระบบจะสร้างโครงเอกสารเปล่าเพื่อปลดล็อกแท็บถัดไป ยังไม่ใช้เครดิตและยังไม่เรนเดอร์วิดีโอ",
      ),
    ).toBeInTheDocument();
  });
});

describe("BriefPanel — content draft review render gate", () => {
  it("does not render the launcher when the project has no document yet", () => {
    render(
      <BriefPanel
        lang="th"
        project={BASE_PROJECT}
        document={null}
        onDocumentInitialized={vi.fn()}
        onDocumentChange={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("video-studio-content-draft-card")).not.toBeInTheDocument();
  });

  it("renders the launcher once the project document exists", () => {
    render(
      <BriefPanel
        lang="th"
        project={BASE_PROJECT}
        document={BASE_DOCUMENT}
        onDocumentInitialized={vi.fn()}
        onDocumentChange={vi.fn()}
        projectRevision={3}
        hasUnsavedChanges={false}
        onDocumentSaved={vi.fn()}
      />,
    );

    expect(screen.getByTestId("video-studio-content-draft-card")).toBeInTheDocument();
  });

  it("persists the edited brief and document before launching a draft", async () => {
    listRecommendedStageModelsQueryMock.mockReturnValue({
      data: { models: [{ modelId: "recommended-model", providerName: "Test", isDefault: true }] },
    });
    const onSaveDocument = vi.fn().mockResolvedValue(4);

    render(
      <BriefPanel
        lang="th"
        project={{ ...BASE_PROJECT, brief: { topic: "หัวข้อเดิม" } }}
        document={BASE_DOCUMENT}
        onDocumentInitialized={vi.fn()}
        onDocumentChange={vi.fn()}
        projectRevision={3}
        hasUnsavedChanges
        onSaveDocument={onSaveDocument}
      />,
    );

    fireEvent.change(screen.getByLabelText("หัวข้อวิดีโอ"), { target: { value: "หัวข้อใหม่" } });
    const runButton = screen.getByTestId("video-studio-content-draft-run");
    await waitFor(() => expect(runButton).toBeEnabled());
    fireEvent.click(runButton);

    await waitFor(() => expect(updateBriefMutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 1,
        brief: expect.objectContaining({ topic: "หัวข้อใหม่" }),
      }),
      expect.anything(),
    ));
    expect(onSaveDocument).toHaveBeenCalledTimes(1);
    expect(runContentDraftMutateMock).toHaveBeenCalledWith(expect.objectContaining({
      baseRevision: 4,
      modelId: "recommended-model",
    }), expect.anything());
  });

  it("shows a decision-ready multi-scene draft with duration and full narration", () => {
    getContentDraftQueryMock.mockReturnValue({
      data: {
        status: "ready",
        attempt: 1,
        feedback: null,
        summary: "เปิดด้วยปัญหา สาธิตจุดเด่น และปิดด้วยคำชวนให้ลองใช้",
        totalNarrationCharacters: 132,
        modelId: "openai/gpt-5.6",
        error: null,
        createdAt: "2026-08-04T00:00:00.000Z",
        updatedAt: "2026-08-04T00:00:00.000Z",
        document: {
          ...BASE_DOCUMENT,
          format: { ...BASE_DOCUMENT.format, durationMs: 30000 },
          scenes: [
            {
              sceneId: "scene-1",
              startMs: 0,
              endMs: 5000,
              narration: "เคยไหมที่อยากให้เด็กสนุกกับการเรียนรู้ทุกวัน",
              narrationAudioAssetId: null,
              visual: { kind: "layers" },
              layers: [],
              motion: { intensity: "medium", camera: "push-in" },
              captionCues: [],
            },
            {
              sceneId: "scene-2",
              startMs: 5000,
              endMs: 10000,
              narration: "กล่องหยดผลไม้ช่วยเปลี่ยนเวลาธรรมดาให้เป็นกิจกรรมสร้างสรรค์",
              narrationAudioAssetId: null,
              visual: { kind: "layers" },
              layers: [],
              motion: { intensity: "low", camera: "static" },
              captionCues: [],
            },
          ],
        },
      },
    });
    listRecommendedStageModelsQueryMock.mockReturnValue({
      data: { models: [{ modelId: "openai/gpt-5.6", providerName: "OpenRouter", isDefault: true }] },
    });

    render(
      <ContentDraftReviewCard
        lang="th"
        projectId={1}
        document={BASE_DOCUMENT}
        projectRevision={3}
        hasUnsavedChanges={false}
        onDocumentSaved={vi.fn()}
      />,
    );

    const summary = screen.getByTestId("video-studio-content-draft-summary");
    expect(summary).toHaveTextContent("เปิดด้วยปัญหา สาธิตจุดเด่น และปิดด้วยคำชวนให้ลองใช้");
    expect(summary).toHaveTextContent("ความยาวประมาณ 30 วินาที");
    expect(screen.getByTestId("video-studio-content-draft-duration")).toBeInTheDocument();
    expect(screen.getByTestId("video-studio-content-draft-voice-tone")).toBeInTheDocument();
    expect(screen.getByTestId("video-studio-content-draft-motion-style")).toBeInTheDocument();
    expect(screen.getByText("เคยไหมที่อยากให้เด็กสนุกกับการเรียนรู้ทุกวัน")).toBeInTheDocument();
    expect(screen.getByText("กล่องหยดผลไม้ช่วยเปลี่ยนเวลาธรรมดาให้เป็นกิจกรรมสร้างสรรค์")).toBeInTheDocument();
  });

  it("hands the promoted document and revision back to the workspace on accept", () => {
    const acceptedDocument = {
      ...BASE_DOCUMENT,
      scenes: [{
        sceneId: "scene-1",
        startMs: 0,
        endMs: 5000,
        narration: "บทพูดที่ยืนยันแล้ว",
        narrationAudioAssetId: null,
        visual: { kind: "layers" as const },
        layers: [],
        motion: { intensity: "medium" as const, camera: "static" },
        captionCues: [],
      }],
    };
    getContentDraftQueryMock.mockReturnValue({
      data: {
        status: "ready",
        attempt: 1,
        feedback: null,
        document: acceptedDocument,
        summary: "draft",
        totalNarrationCharacters: 17,
        durationLimitSeconds: 30,
        voiceTone: "friendly_conversational",
        motionStyle: "auto",
        modelId: "test-model",
        error: null,
        createdAt: "2026-08-04T00:00:00.000Z",
        updatedAt: "2026-08-04T00:00:00.000Z",
      },
    });
    listRecommendedStageModelsQueryMock.mockReturnValue({
      data: { models: [{ modelId: "test-model", providerName: "Test", isDefault: true }] },
    });
    acceptContentDraftResult = { document: acceptedDocument, revision: 7 };
    const onDocumentSaved = vi.fn();

    render(
      <ContentDraftReviewCard
        lang="th"
        projectId={1}
        document={BASE_DOCUMENT}
        projectRevision={6}
        hasUnsavedChanges={false}
        onDocumentSaved={onDocumentSaved}
      />,
    );

    fireEvent.click(screen.getByTestId("video-studio-content-draft-accept"));

    expect(onDocumentSaved).toHaveBeenCalledWith(acceptedDocument, 7);
  });

  it("prepares unsaved changes before creating a draft", async () => {
    listRecommendedStageModelsQueryMock.mockReturnValue({
      data: { models: [{ modelId: "recommended-model", providerName: "Test", isDefault: true }] },
    });
    const onPrepareForDraft = vi.fn().mockResolvedValue(9);

    render(
      <ContentDraftReviewCard
        lang="th"
        projectId={1}
        document={BASE_DOCUMENT}
        projectRevision={8}
        hasUnsavedChanges
        onPrepareForDraft={onPrepareForDraft}
      />,
    );

    const runButton = screen.getByTestId("video-studio-content-draft-run");
    expect(runButton).toBeEnabled();
    fireEvent.click(runButton);

    await waitFor(() => expect(onPrepareForDraft).toHaveBeenCalledTimes(1));
    expect(runContentDraftMutateMock).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 1,
      baseRevision: 9,
      modelId: "recommended-model",
    }), expect.anything());
  });
});

describe("BriefPanel — format-change confirm (§4.11/AC17)", () => {
  function docWithOneLayer(): VideoProjectDocument {
    return {
      ...BASE_DOCUMENT,
      scenes: [
        {
          sceneId: "scene-1",
          startMs: 0,
          endMs: 8000,
          narration: null,
          narrationAudioAssetId: null,
          visual: { kind: "layers" },
          layers: [
            {
              id: "vsclip_1",
              type: "text",
              startFrame: 30,
              durationFrames: 60,
              x: 10,
              y: 10,
              width: 30,
              height: 10,
              rotationDeg: 0,
              opacity: 1,
              zIndex: 200,
              content: "hi",
              fontFamily: "Inter",
              fontSizePx: 48,
              color: "#fff",
              textAlign: "center",
              fontWeight: "normal",
            },
          ],
          motion: { intensity: "medium", camera: "static" },
          captionCues: [],
        },
      ],
    } as unknown as VideoProjectDocument;
  }

  it("applies a width/height/fps edit directly (no confirm) when there are no hand-authored layers", () => {
    const onDocumentChange = vi.fn();
    render(
      <BriefPanel
        lang="th"
        project={BASE_PROJECT}
        document={BASE_DOCUMENT}
        onDocumentInitialized={vi.fn()}
        onDocumentChange={onDocumentChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("FPS"), { target: { value: "24" } });
    expect(onDocumentChange).toHaveBeenCalledWith(
      expect.objectContaining({ format: expect.objectContaining({ fps: 24 }) }),
    );
    // The `AlertDialog`'s native <dialog> is always present in the tree
    // (Astryx toggles it via showModal()/close(), not conditional render) —
    // "not shown" is asserted via the `open` attribute, not testid absence.
    expect(screen.getByTestId("vs-format-migrate-confirm")).not.toHaveAttribute("open");
  });

  it("shows the confirm dialog instead of applying directly when the project has hand-authored layers, and migrates on confirm", () => {
    const onDocumentChange = vi.fn();
    const doc = docWithOneLayer();
    render(
      <BriefPanel
        lang="th"
        project={BASE_PROJECT}
        document={doc}
        onDocumentInitialized={vi.fn()}
        onDocumentChange={onDocumentChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("FPS"), { target: { value: "24" } });
    // Not applied yet — the confirm dialog is showing instead.
    expect(onDocumentChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("vs-format-migrate-confirm")).toHaveAttribute("open");

    fireEvent.click(within(screen.getByTestId("vs-format-migrate-confirm")).getByText("ปรับและเปลี่ยนรูปแบบ"));

    expect(onDocumentChange).toHaveBeenCalledTimes(1);
    const migrated = onDocumentChange.mock.calls[0][0] as VideoProjectDocument;
    expect(migrated.format.fps).toBe(24);
    // Absolute timing preserved: 30 frames @30fps == 1000ms == 24 frames @24fps.
    expect(migrated.scenes[0].layers[0].startFrame).toBe(24);
    // 60 frames @30fps == 2000ms == 48 frames @24fps.
    expect(migrated.scenes[0].layers[0].durationFrames).toBe(48);
  });

  it("does not open the confirm dialog when the field is set to its current value", () => {
    const onDocumentChange = vi.fn();
    const doc = docWithOneLayer();
    render(
      <BriefPanel
        lang="th"
        project={BASE_PROJECT}
        document={doc}
        onDocumentInitialized={vi.fn()}
        onDocumentChange={onDocumentChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("FPS"), { target: { value: String(doc.format.fps) } });
    expect(onDocumentChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("vs-format-migrate-confirm")).not.toHaveAttribute("open");
  });
});
