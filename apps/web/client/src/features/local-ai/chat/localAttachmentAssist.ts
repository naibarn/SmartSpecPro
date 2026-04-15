import type {
  CapabilityResult,
  LocalAiCatalogEntry,
  LocalAiPlatform,
  LocalAiSyncedPreferences,
  MessageRuntimeMetadata,
} from "../types/capability";
import type { LocalAiDeviceStateScope } from "../types/deviceState";
import { readLocalAiDeviceState } from "../state/localAiDeviceStateStorage";
import { generateTextWithBrowserLocalRuntime } from "../adapters/browserLocalRuntime";
import {
  executeExternalLocalChatCompletion,
  executeExternalLocalTextCompletion,
  readLocalAiLocalEnginePreference,
  readConfiguredExternalLocalTextBackend,
  shouldAllowExternalLocalBackend,
  shouldAllowOnDeviceLocalEngine,
} from "../adapters/externalLocalTextBackend";
import {
  executeTauriLocalGemmaImageAnalysis,
  executeTauriLocalGemmaText,
  type TauriLocalSkillRuntimeStatus,
} from "../skills/tauriSkillRuntime";

const MAX_ASSIST_FETCH_BYTES = 12 * 1024 * 1024;
const MAX_OCR_TEXT_CHARS = 6_000;

export interface AttachmentAssistAttachment {
  url: string;
  fileType: string;
  fileName: string;
}

export interface HybridAttachmentAssistResult {
  providerContext: string | null;
  localReplyContext: string | null;
  localOnlyCompatible: boolean;
  runtimeMetadataHint: Partial<MessageRuntimeMetadata> | null;
  ocrResult: {
    extractedText: string;
    caption: string | null;
    warning: string | null;
    extractor: string | null;
    metadata: Record<string, unknown>;
  } | null;
}

type DocumentCaptureIntent = "receipt" | "transfer_slip" | "statement";

interface AttachmentAssistServerResult {
  kind: "vision" | "document_ocr" | "extract_text";
  extractedText: string | null;
  extractor: string | null;
  caption: string | null;
  ocrText: string | null;
  warning: string | null;
  searchQuality: "full_text" | "metadata_only";
  metadata: Record<string, unknown>;
}

type AttachmentAssistServerMode =
  | "auto"
  | "real_world_vision"
  | "document_ocr"
  | "extract_text";

function trimText(value: string, limit: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function shouldAttemptAttachmentAssist(input: {
  preferences: LocalAiSyncedPreferences;
  forceCloudOnly: boolean;
  attachments: AttachmentAssistAttachment[];
  userText: string;
}): boolean {
  if (input.forceCloudOnly) return false;
  if (input.attachments.length === 0) return false;

  const wantsOcr = input.attachments.some((attachment) =>
    looksLikeDocumentAttachment({ attachment, userText: input.userText }),
  );
  return (
    wantsOcr ||
    (input.preferences.enabled && input.preferences.useForImageTasks)
  );
}

function inferDocumentCaptureIntent(input: {
  attachment: AttachmentAssistAttachment;
  userText: string;
}): DocumentCaptureIntent | null {
  const normalized = `${input.attachment.fileName} ${input.userText}`.toLowerCase();
  if (
    normalized.includes("statement") ||
    normalized.includes("ยอดคงเหลือ") ||
    normalized.includes("ยอดบัญชี")
  ) {
    return "statement";
  }
  if (
    normalized.includes("slip") ||
    normalized.includes("transfer") ||
    normalized.includes("transfer_slip") ||
    normalized.includes("สลิป") ||
    normalized.includes("โอน") ||
    normalized.includes("promptpay") ||
    normalized.includes("พร้อมเพย์")
  ) {
    return "transfer_slip";
  }
  if (
    normalized.includes("receipt") ||
    normalized.includes("invoice") ||
    normalized.includes("bill") ||
    normalized.includes("ใบเสร็จ") ||
    normalized.includes("ใบกำกับ") ||
    normalized.includes("บิล") ||
    normalized.includes("ใบแจ้งหนี้")
  ) {
    return "receipt";
  }
  return null;
}

function pickInstalledBrowserTextProfile(input: {
  preferredProfileId: string | null;
  eligibleProfileIds: string[];
  installedProfileIds: string[];
  catalog: LocalAiCatalogEntry[];
}): LocalAiCatalogEntry | null {
  const supported = input.catalog.filter(
    (entry) =>
      entry.status === "allowed" &&
      entry.supportedPlatforms.includes("web") &&
      entry.modalities.text &&
      input.eligibleProfileIds.includes(entry.id) &&
      input.installedProfileIds.includes(entry.id),
  );

  if (input.preferredProfileId) {
    const preferred = supported.find(
      (entry) => entry.id === input.preferredProfileId,
    );
    if (preferred) {
      return preferred;
    }
  }

  return (
    supported.find((entry) => entry.id === "gemma4-e2b-web-fast") ??
    supported.find((entry) => entry.id === "gemma4-e4b-web-balanced") ??
    supported[0] ??
    null
  );
}

function pickInstalledTauriProfile(input: {
  preferredProfileId: string | null;
  installedProfileIds: string[];
  catalog: LocalAiCatalogEntry[];
  requireImage?: boolean;
}): LocalAiCatalogEntry | null {
  const supported = input.catalog.filter(
    (entry) =>
      entry.status === "allowed" &&
      entry.supportedPlatforms.includes("tauri") &&
      entry.modalities.text &&
      (!input.requireImage || entry.modalities.image) &&
      input.installedProfileIds.includes(entry.id),
  );

  if (input.preferredProfileId) {
    const preferred = supported.find(
      (entry) => entry.id === input.preferredProfileId,
    );
    if (preferred) {
      return preferred;
    }
  }

  return (
    supported.find((entry) => entry.id === "gemma4-e4b-tauri-balanced") ??
    supported.find((entry) => entry.id === "gemma4-e2b-tauri-fast") ??
    supported[0] ??
    null
  );
}

function isSameOriginAttachment(url: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const resolved = new URL(url, window.location.origin);
    return resolved.origin === window.location.origin;
  } catch {
    return false;
  }
}

async function attachmentToBase64(
  attachment: AttachmentAssistAttachment,
): Promise<{
  contentBase64: string;
  mimeType: string;
}> {
  if (!isSameOriginAttachment(attachment.url)) {
    throw new Error("attachment_origin_not_allowed");
  }

  const response = await fetch(new URL(attachment.url, window.location.origin), {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`attachment_fetch_failed:${response.status}`);
  }
  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error("attachment_blob_empty");
  }
  if (blob.size > MAX_ASSIST_FETCH_BYTES) {
    throw new Error("attachment_blob_too_large");
  }
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return {
    contentBase64: btoa(binary),
    mimeType: blob.type || attachment.fileType,
  };
}

export function looksLikeDocumentAttachment(input: {
  attachment: AttachmentAssistAttachment;
  userText: string;
}): boolean {
  const fileName = input.attachment.fileName.toLowerCase();
  const mimeType = input.attachment.fileType.toLowerCase();
  const userText = input.userText.toLowerCase();

  if (mimeType === "application/pdf") {
    return true;
  }
  if (
    /(receipt|invoice|bill|document|scan|statement|voucher|slip|ใบเสร็จ|ใบกำกับ|เอกสาร|สลิป|บิล|ใบแจ้งหนี้)/u.test(
      `${fileName} ${userText}`,
    )
  ) {
    return true;
  }
  return /(ocr|อ่านข้อความ|อ่านข้อความในรูป|extract|scan|อ่านใบเสร็จ|สรุปใบเสร็จ)/u.test(
    userText,
  );
}

function buildLocalImagePrompt(userText: string): string {
  return [
    "You are SmartAIHub running locally with Gemma 4.",
    "Describe the attached image for chat assistance.",
    "Focus on screenshot explanation, receipt pre-read, scene understanding, visible UI, and any clearly visible text.",
    "Keep the result concise and factual.",
    userText.trim() ? `User request: ${trimText(userText, 400)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildHybridOcrPrompt(input: {
  userText: string;
  extractedText: string;
  caption: string | null;
}): string {
  return [
    "You are SmartAIHub running locally with Gemma 4.",
    "Interpret OCR or document extraction results for chat assistance.",
    "If this looks like a receipt or invoice, highlight merchant, date, total, tax, and payment clues when visible.",
    "If it looks like a screenshot or document, summarize the purpose and most important facts.",
    "Return concise bullet-style plain text only.",
    input.userText.trim()
      ? `User request: ${trimText(input.userText, 400)}`
      : "",
    input.caption ? `Vision caption: ${trimText(input.caption, 600)}` : "",
    `OCR / extracted text:\n${trimText(input.extractedText, MAX_OCR_TEXT_CHARS)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function summarizeWithLocalTextRuntime(input: {
  platform: LocalAiPlatform;
  preferredProfileId: string | null;
  catalog: LocalAiCatalogEntry[];
  capability: CapabilityResult | null | undefined;
  scope?: LocalAiDeviceStateScope | null;
  tauriRuntimeStatus: TauriLocalSkillRuntimeStatus;
  prompt: string;
}): Promise<{ text: string; profileId: string } | null> {
  const localEnginePreference = readLocalAiLocalEnginePreference(input.scope);
  const externalBackend = shouldAllowExternalLocalBackend(localEnginePreference)
    ? readConfiguredExternalLocalTextBackend(input.scope)
    : null;
  if (externalBackend) {
    const response = await executeExternalLocalTextCompletion({
      config: externalBackend,
      prompt: input.prompt,
      maxTokens: 384,
      temperature: 0.15,
      systemPrompt:
        "You are SmartAIHub using a local multimodal backend. Summarize the provided OCR or extracted text faithfully in concise plain text.",
    });
    const text = response.text.trim();
    if (!text) {
      return null;
    }
    return {
      text,
      profileId: response.model,
    };
  }

  if (
    input.platform === "tauri" &&
    shouldAllowOnDeviceLocalEngine(localEnginePreference)
  ) {
    if (!input.tauriRuntimeStatus.supportsGemma4Text) {
      return null;
    }
    const profile = pickInstalledTauriProfile({
      preferredProfileId: input.preferredProfileId,
      installedProfileIds: input.tauriRuntimeStatus.installedGemmaProfileIds ?? [],
      catalog: input.catalog,
    });
    if (!profile) {
      return null;
    }
    const response = await executeTauriLocalGemmaText({
      profileId: profile.id,
      prompt: input.prompt,
    });
    return response.success
      ? {
          text: response.text.trim(),
          profileId: response.profileId,
        }
      : null;
  }

  if (!input.scope) {
    return null;
  }
  if (!shouldAllowOnDeviceLocalEngine(localEnginePreference)) {
    return null;
  }
  const deviceState = readLocalAiDeviceState(input.scope);
  const installedProfileIds = deviceState.installedModelIds;
  const profile = pickInstalledBrowserTextProfile({
    preferredProfileId: input.preferredProfileId,
    eligibleProfileIds: input.capability?.eligibleProfiles ?? [],
    installedProfileIds,
    catalog: input.catalog,
  });
  if (!profile) {
    return null;
  }

  const response = await generateTextWithBrowserLocalRuntime({
    prompt: input.prompt,
    profile,
    maxTokens: 384,
    topK: 32,
    temperature: 0.15,
    disableExperimentalSubgroups:
      deviceState.preferStableBrowserRuntime !== false,
    avoidExplicitPowerPreference:
      deviceState.preferStableBrowserRuntime !== false,
  });
  const text = response.text.trim();
  if (!text) {
    return null;
  }
  return {
    text,
    profileId: response.profileId,
  };
}

export async function buildHybridAttachmentAssist(input: {
  platform: LocalAiPlatform;
  preferences: LocalAiSyncedPreferences;
  forceCloudOnly: boolean;
  preferRawDocumentOcr?: boolean;
  forceDocumentOcr?: boolean;
  catalog: LocalAiCatalogEntry[];
  capability?: CapabilityResult | null;
  scope?: LocalAiDeviceStateScope | null;
  tauriRuntimeStatus: TauriLocalSkillRuntimeStatus;
  attachments: AttachmentAssistAttachment[];
  userText: string;
  analyzeAttachmentAssist: (payload: {
    fileName: string;
    mimeType: string;
    contentBase64: string;
    mode: AttachmentAssistServerMode;
    analysisProfile?: "document_ocr" | "real_world_vision" | "extract_text";
    captureIntent?: DocumentCaptureIntent | null;
  }) => Promise<AttachmentAssistServerResult>;
}): Promise<HybridAttachmentAssistResult | null> {
  if (
    !shouldAttemptAttachmentAssist({
      preferences: input.preferences,
      forceCloudOnly: input.forceCloudOnly,
      attachments: input.attachments,
      userText: input.userText,
    })
  ) {
    return null;
  }

  const targetAttachment =
    input.attachments.find((attachment) =>
      attachment.fileType.toLowerCase().startsWith("image/"),
    ) ??
    input.attachments.find((attachment) =>
      attachment.fileType.toLowerCase() === "application/pdf",
    );

  if (!targetAttachment) {
    return null;
  }

  let stagedContent: { contentBase64: string; mimeType: string } | null = null;
  const providerContextSections: string[] = [];
  const localOnlyContextSections: string[] = [];
  let localOnlyCompatible = true;
  let lastProfileId: string | null = null;
  let taskClass: MessageRuntimeMetadata["taskClass"] | null = null;
  let ocrResult: HybridAttachmentAssistResult["ocrResult"] = null;
  const localEnginePreference = readLocalAiLocalEnginePreference(input.scope);

  const ensureAttachmentContent = async () => {
    if (!stagedContent) {
      stagedContent = await attachmentToBase64(targetAttachment);
    }
    return stagedContent;
  };

  const externalBackend = shouldAllowExternalLocalBackend(localEnginePreference)
    ? readConfiguredExternalLocalTextBackend(input.scope)
    : null;
  const canUseLocalImagePath =
    shouldAllowOnDeviceLocalEngine(localEnginePreference) &&
    !externalBackend &&
    input.platform === "tauri" &&
    input.tauriRuntimeStatus.supportsGemma4Image &&
    targetAttachment.fileType.toLowerCase().startsWith("image/");

  if (
    externalBackend &&
    targetAttachment.fileType.toLowerCase().startsWith("image/")
  ) {
    try {
      const content = await ensureAttachmentContent();
      const localImageSummary = await executeExternalLocalChatCompletion({
        config: externalBackend,
        messages: [
          {
            role: "system",
            content:
              "You are SmartAIHub using a local multimodal backend. Describe the attached image for local chat assistance. Focus on screenshot explanation, receipt pre-read, scene understanding, visible UI, and any clearly visible text. Keep the result concise and factual.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: buildLocalImagePrompt(input.userText),
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${content.mimeType};base64,${content.contentBase64}`,
                },
              },
            ],
          },
        ],
        maxTokens: 512,
        temperature: 0.2,
      });
      if (localImageSummary.text.trim()) {
        const section = `[Local AI multimodal backend]\n${trimText(
          localImageSummary.text,
          1_400,
        )}`;
        providerContextSections.push(section);
        localOnlyContextSections.push(section);
        lastProfileId = localImageSummary.model;
        taskClass = "image_understanding";
      }
    } catch {
      // Best-effort only — fall through to other local/hybrid paths.
    }
  }

  if (canUseLocalImagePath) {
    const imageProfile = pickInstalledTauriProfile({
      preferredProfileId: input.preferences.defaultModelId,
      installedProfileIds: input.tauriRuntimeStatus.installedGemmaProfileIds ?? [],
      catalog: input.catalog,
      requireImage: true,
    });
    if (imageProfile) {
      try {
        const content = await ensureAttachmentContent();
        const localImageSummary = await executeTauriLocalGemmaImageAnalysis({
          profileId: imageProfile.id,
          imageBase64: content.contentBase64,
          mimeType: content.mimeType,
          prompt: buildLocalImagePrompt(input.userText),
        });
        if (localImageSummary.success && localImageSummary.text.trim()) {
          const section = `[On-device image understanding]\n${trimText(
            localImageSummary.text,
            1_400,
          )}`;
          providerContextSections.push(section);
          localOnlyContextSections.push(section);
          lastProfileId = localImageSummary.profileId;
          taskClass = "image_understanding";
        }
      } catch {
        // Best-effort only — fall back to cloud/hybrid flow below when needed.
      }
    }
  }

  if (
    input.forceDocumentOcr ||
    looksLikeDocumentAttachment({ attachment: targetAttachment, userText: input.userText })
  ) {
    try {
      const content = await ensureAttachmentContent();
      const inferredCaptureIntent = inferDocumentCaptureIntent({
        attachment: targetAttachment,
        userText: input.userText,
      });
      const captureIntent =
        inferredCaptureIntent ??
        (input.forceDocumentOcr && content.mimeType.toLowerCase().startsWith("image/")
          ? "transfer_slip"
          : null);
      const ocrMode =
        content.mimeType.toLowerCase() === "application/pdf"
          ? "extract_text"
          : "document_ocr";
      const ocrAssist = await input.analyzeAttachmentAssist({
        fileName: targetAttachment.fileName,
        mimeType: content.mimeType,
        contentBase64: content.contentBase64,
        mode: ocrMode,
        analysisProfile: "document_ocr",
        captureIntent,
      });

      const extractedText =
        ocrAssist.ocrText?.trim() ||
        ocrAssist.extractedText?.trim() ||
        "";
      if (extractedText) {
        ocrResult = {
          extractedText,
          caption: ocrAssist.caption,
          warning: ocrAssist.warning,
          extractor: ocrAssist.extractor,
          metadata: ocrAssist.metadata,
        };

        let resolvedSummaryText = "";
        if (input.preferRawDocumentOcr) {
          resolvedSummaryText = [
            ocrAssist.caption ? `Caption: ${ocrAssist.caption}` : null,
            trimText(extractedText, 1_800),
          ]
            .filter(Boolean)
            .join("\n\n");
        } else {
          const localSummary = await summarizeWithLocalTextRuntime({
            platform: input.platform,
            preferredProfileId: input.preferences.defaultModelId,
            catalog: input.catalog,
            capability: input.capability,
            scope: input.scope,
            tauriRuntimeStatus: input.tauriRuntimeStatus,
            prompt: buildHybridOcrPrompt({
              userText: input.userText,
              extractedText,
              caption: ocrAssist.caption,
            }),
          }).catch(() => null);
          resolvedSummaryText =
            localSummary?.text ||
            [
              ocrAssist.caption ? `Caption: ${ocrAssist.caption}` : null,
              trimText(extractedText, 1_800),
            ]
              .filter(Boolean)
              .join("\n\n");
          lastProfileId = localSummary?.profileId ?? lastProfileId;
        }

        if (resolvedSummaryText.trim()) {
          providerContextSections.push(
            `[Hybrid OCR pre-read]\n${trimText(resolvedSummaryText, 2_200)}`,
          );
          localOnlyCompatible = false;
          taskClass = "document_ocr";
        }
      }
    } catch {
      // Best-effort only — keep the original attachment flow unchanged.
    }
  }

  if (providerContextSections.length === 0 && localOnlyContextSections.length === 0) {
    return null;
  }

  return {
    providerContext:
      providerContextSections.length > 0
        ? providerContextSections.join("\n\n")
        : null,
    localReplyContext:
      localOnlyCompatible && localOnlyContextSections.length > 0
        ? localOnlyContextSections.join("\n\n")
        : null,
    localOnlyCompatible,
    runtimeMetadataHint: taskClass
      ? {
          source: "hybrid",
          taskClass,
          profileId: lastProfileId,
        }
      : null,
    ocrResult,
  };
}
