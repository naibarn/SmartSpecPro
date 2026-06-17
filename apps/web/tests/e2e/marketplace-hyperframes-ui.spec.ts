import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES,
  HyperframesAutoPlanOverrideInputSchema,
} from "../../shared/hyperframes/autoPlan";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(
    join(here, "../../test-fixtures/hyperframes/marketplace-hyperframes-fixtures.json"),
    "utf8"
  )
) as {
  fixtures: Array<{
    id: string;
    group: string;
    expected?: Record<string, unknown>;
    render?: Record<string, unknown>;
  }>;
};
const evidenceDir = join(here, "../../test-results/marketplace-hyperframes");
const e2ePort =
  process.env.PLAYWRIGHT_E2E_PORT || process.env.PLAYWRIGHT_PORT || "3017";
const BASE_URL = (
  process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${e2ePort}`
).replace(/\/$/, "");
const ROUTE_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='320' viewBox='0 0 320 320'%3E%3Crect width='320' height='320' fill='%23e0f2fe'/%3E%3Ccircle cx='160' cy='136' r='70' fill='%230ea5e9'/%3E%3Crect x='70' y='224' width='180' height='34' rx='17' fill='%230f172a'/%3E%3C/svg%3E";
const ROUTE_VIDEO_URL = "https://cdn.example.test/hyperframes/final.mp4";
const ROUTE_SHOT_VIDEO_URL = `${BASE_URL}/e2e-assets/marketplace-hyperframes-shot.mp4`;
const ROUTE_VIDEO_FIXTURE_PATH = join(
  evidenceDir,
  "marketplace-hyperframes-fixture.mp4"
);

function fixtureByGroup(group: string) {
  const fixture = fixtures.fixtures.find(item => item.group === group);
  expect(fixture, `missing fixture group ${group}`).toBeTruthy();
  return fixture!;
}

function trpcData(data: unknown) {
  return { result: { data: { json: data } } };
}

function trpcError(procedure: string, message: string) {
  return {
    error: {
      message,
      code: -32603,
      data: {
        code: "INTERNAL_SERVER_ERROR",
        httpStatus: 500,
        path: procedure,
      },
    },
  };
}

function getTrpcProcedure(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname.replace(/^\/trpc\/?/, "");
}

function completedRenderProjection() {
  return {
    schemaVersion: 1,
    contractVersion: "hyperframes_marketplace_auto_review_v1",
    launchMode: "auto_storyboard_review",
    tenantId: "tenant_route",
    productId: "product_1",
    runId: "mar_1",
    renderJobId: "hf_route_1",
    status: "completed",
    progressPercent: 100,
    statusCopyId: "hyperframes.status.completed",
    safeMessage: "Render complete and ready for review.",
    safeDiagnostics: [],
    permissions: { canCancel: false, canRepair: false },
    repairActions: [],
    polling: {
      recommendedIntervalMs: 30_000,
      maxIntervalMs: 30_000,
      stopWhenStatus: [
        "completed",
        "saved_to_library",
        "cancelled",
        "failed",
        "failed_permanent",
        "dead_lettered",
        "template_disabled",
        "stale_input_hash",
      ],
      staleAfterMs: 120_000,
      terminalState: true,
      etag: "hf_route_etag",
    },
    templateId: "marketplace_storyboard_motion_9x9_v1",
    templateVersion: "1.0.0",
    templateContentHash: "hf_template",
    platformPresetId: "generic_vertical_9_16",
    platformPresetVersion: "1.0.0",
    renderIntent: "final",
    compositionMode: "storyboard_motion_preview",
    compositionInputHash: "hf_input",
    compositionHtmlHash: "hf_html",
    runtimeProfileHash: "hf_runtime",
    qaStatus: "passed",
    outputRefs: [
      {
        outputId: "hf_route_1_output",
        kind: "final_video",
        url: ROUTE_VIDEO_URL,
        storageRef: null,
        contentHash: "hf_output",
        accessibleLabel: "Final HyperFrames video",
      },
      {
        outputId: "hf_route_1_snapshot",
        kind: "snapshot",
        url: ROUTE_IMAGE,
        storageRef: null,
        contentHash: "hf_snapshot",
        accessibleLabel: "Safe area snapshot",
      },
    ],
    artifactRefs: [],
    redaction: {
      rawHtmlHidden: true,
      signedUrlsHidden: true,
      workerLogsHidden: true,
      storageKeysHidden: true,
    },
    updatedAt: "2026-06-04T00:00:00.000Z",
  };
}

function retryableRenderProjection() {
  return {
    ...completedRenderProjection(),
    status: "failed_transient",
    progressPercent: 60,
    statusCopyId: "hyperframes.status.failed_transient",
    safeMessage: "Worker hit a temporary dependency failure.",
    permissions: { canCancel: false, canRepair: true },
    repairActions: [
      {
        actionId: "repair_retry_worker_step",
        actionType: "retry_worker_step",
        label: "Retry worker step",
        safeDescription: "Retry the last worker step safely.",
        requiresOperator: false,
        auditRequired: true,
        disabledReason: null,
      },
    ],
    polling: {
      recommendedIntervalMs: 30_000,
      maxIntervalMs: 30_000,
      stopWhenStatus: ["failed_transient"],
      staleAfterMs: 120_000,
      terminalState: true,
      etag: "hf_retry_etag",
    },
    qaStatus: undefined,
    outputRefs: [],
  };
}

function storyboardReviewWithVideoShots() {
  const now = Date.parse("2026-06-04T00:00:00.000Z");
  const tasks = [0, 1].map(index => ({
    id: `shot-${index + 1}`,
    index,
    status: "completed",
    type: "video",
    prompt:
      index === 0
        ? "Hook shot with overlay and subtitle"
        : "Proof shot with overlay and subtitle",
    model: "veo3/generate-veo-3-video-lite",
    durationSeconds: 8,
    createdAt: now,
    updatedAt: now,
    url: ROUTE_SHOT_VIDEO_URL,
    storyboardContext: {
      aspectRatio: "9:16",
      duration: 8,
      model: "veo3/generate-veo-3-video-lite",
      referenceImages: [{ url: ROUTE_IMAGE, name: "poster" }],
      referenceVideos: [],
      extraParams: {
        marketplaceProductId: "product_1",
        autoReviewRunId: "mar_1",
      },
    },
  }));
  const reviewData = {
    version: 1,
    reviewId: 1,
    name: "E2E selected shot video preview",
    updatedAt: now,
    taskIds: tasks.map(task => task.id),
    selectedTaskIds: tasks.map(task => task.id),
    tasks,
    companionAudio: [],
    compoundStatus: null,
    projectLink: null,
    renderJobId: null,
    marketplaceContext: {
      productId: "product_1",
      platform: "shopee",
      productName: "BENO PRO-FLEX",
      affiliateUrl: "https://example.test/product?aff=ssp",
    },
    productionContext: {
      productionRunId: "mar_1",
      productionProjectTitle: "BENO PRO-FLEX test",
      voiceoverFullScript:
        "คุณเคยชงกาแฟตอนเช้า แบบชงเท่าไหร่ก็ยังได้กาแฟติดเปรี้ยวจนหมดอารมณ์ไหม",
    },
    voiceoverFullScript:
      "คุณเคยชงกาแฟตอนเช้า แบบชงเท่าไหร่ก็ยังได้กาแฟติดเปรี้ยวจนหมดอารมณ์ไหม",
  };
  return {
    id: 1,
    name: "E2E selected shot video preview",
    reviewData,
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  };
}

function repairedRenderProjection() {
  return {
    ...completedRenderProjection(),
    status: "queued",
    progressPercent: 0,
    statusCopyId: "hyperframes.status.queued",
    safeMessage: "Repair queued.",
    permissions: { canCancel: true, canRepair: false },
    repairActions: [],
    outputRefs: [],
    polling: {
      recommendedIntervalMs: 5_000,
      maxIntervalMs: 30_000,
      stopWhenStatus: [
        "completed",
        "saved_to_library",
        "cancelled",
        "failed",
        "failed_permanent",
        "dead_lettered",
        "template_disabled",
        "stale_input_hash",
      ],
      staleAfterMs: 15_000,
      terminalState: false,
      etag: "hf_repair_etag",
    },
  };
}

const routeAutoDefaultOverrideValues = HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES;
type RouteAutoOverrideKey = keyof typeof routeAutoDefaultOverrideValues;
const routeAutoOverrideKeys = Object.keys(
  routeAutoDefaultOverrideValues
) as RouteAutoOverrideKey[];

function routeOverrideValueString(value: unknown): string {
  return typeof value === "number" ? String(value) : String(value ?? "");
}

function routeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function routeNormalizeOverrides(
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  routeAutoOverrideKeys.forEach(key => {
    const value = overrides[key];
    if (value === undefined || value === null || value === "") return;
    picked[key] =
      key === "shotCount" && typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : value;
  });
  const parsed = HyperframesAutoPlanOverrideInputSchema.safeParse(picked);
  return parsed.success ? parsed.data : {};
}

function routePruneBaseDefaultOverrides(
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const normalized = routeNormalizeOverrides(overrides);
  return Object.fromEntries(
    Object.entries(normalized).filter(
      ([key, value]) =>
        routeOverrideValueString(value) !== routeAutoDefaultOverrideValues[key]
    )
  );
}

function routePlanHashFromOverrides(overrides: Record<string, unknown>): string {
  const effective = routePruneBaseDefaultOverrides(overrides);
  const suffix = Object.entries(effective)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}-${routeOverrideValueString(value)}`)
    .join("_")
    .replace(/[^a-zA-Z0-9_-]+/g, "_");
  return suffix ? `hf_plan_route_${suffix}` : "hf_plan_route";
}

function autoPlanProjection(
  options: {
    canAccessAuto?: boolean;
    flagsEnabled?: boolean;
    tenantAllowed?: boolean;
    workerEnabled?: boolean;
    canStart?: boolean;
    activeRunId?: string | null;
    standardOrderAvailable?: boolean;
    primaryAction?: Record<string, unknown>;
    blockers?: Record<string, unknown>[];
    overrides?: Record<string, unknown>;
  } = {}
) {
  const canAccessAuto = options.canAccessAuto ?? true;
  const flagsEnabled = options.flagsEnabled ?? canAccessAuto;
  const tenantAllowed = options.tenantAllowed ?? canAccessAuto;
  const workerEnabled = options.workerEnabled ?? canAccessAuto;
  const canStart = options.canStart ?? (canAccessAuto && workerEnabled);
  const activeRunId = options.activeRunId ?? null;
  const overrides = routePruneBaseDefaultOverrides(options.overrides ?? {});
  const platformPresetId =
    typeof overrides.platformPresetId === "string"
      ? overrides.platformPresetId
      : "generic_vertical_9_16";
  return {
    contractVersion: "hyperframes_marketplace_auto_review_v1",
    productId: "product_1",
    tenantId: "tenant_route",
    userId: 119,
    planHash: routePlanHashFromOverrides(overrides),
    launchMode: "auto_storyboard_review",
    canStart,
    activeRunId,
    standardOrderAvailable: options.standardOrderAvailable ?? true,
    display: {
      summary:
        "Backend selected the safest storyboard preview plan for this product.",
    },
    primaryAction:
      options.primaryAction ?? {
        label: activeRunId
          ? "Resume Auto Storyboard Review"
          : canStart
            ? "Create Auto Storyboard Review"
            : "Use Standard Order",
        actionId: activeRunId
          ? "resume_auto_storyboard_review"
          : canStart
            ? "start_auto_storyboard_review"
            : "use_standard_order",
        disabled: false,
        copyId: activeRunId
          ? "hyperframes.action.resume_auto_storyboard_review"
          : canStart
            ? "hyperframes.action.start_auto_storyboard_review"
            : "hyperframes.action.use_standard_order",
      },
    defaults: {
      outputMode: "storyboard_images",
      frameStrategy:
        typeof overrides.frameStrategy === "string"
          ? overrides.frameStrategy
          : "storyboard_3x3_split",
      audioStrategy:
        typeof overrides.audioStrategy === "string"
          ? overrides.audioStrategy
          : "native_video_audio",
      shotCount:
        typeof overrides.shotCount === "number" ? overrides.shotCount : 9,
      overlayTextMode:
        typeof overrides.overlayTextMode === "string"
          ? overrides.overlayTextMode
          : "no_text",
	      imageModel:
	        typeof overrides.imageModel === "string"
	          ? overrides.imageModel
	          : "google-banana-2",
      qualityMode:
        typeof overrides.qualityMode === "string"
          ? overrides.qualityMode
          : "balanced",
      templateId: "marketplace_storyboard_motion_9x9_v1",
      platformPreset: {
        presetId: platformPresetId,
        label:
          platformPresetId === "tiktok_reels_shorts_9_16"
            ? "TikTok / Reels / Shorts 9:16"
            : "Generic vertical 9:16",
      },
      renderIntent: "preview",
      compositionMode: "storyboard_motion_preview",
    },
    blockers: options.blockers ?? [],
    warnings: [],
    overrideDiff: { fields: Object.keys(overrides), values: overrides },
    resetToAutoAvailable: Object.keys(overrides).length > 0,
    creditEstimate: { estimatedCredits: 0 },
    access: {
      capabilities: {
        canAccessAuto,
        canPreview: canStart,
        canRenderFinal: true,
        canSaveToLibrary: true,
      },
      flags: {
        enabled: flagsEnabled,
        tenantAllowed,
        workerEnabled,
        librarySaveEnabled: true,
        operatorEnabled: false,
        templateAllowlist: [],
      },
      creditAndQuota: {
        quotaDecision: "free_preview_allowed",
      },
    },
  };
}

function routeOverridesFromStructuredValue(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return value.reduce<Record<string, unknown>>(
      (merged, item) => ({
        ...merged,
        ...routeOverridesFromStructuredValue(item),
      }),
      {}
    );
  }
  const record = routeRecord(value);
  if (Object.keys(record).length === 0) return {};
  const directOverrides = routePruneBaseDefaultOverrides(record);
  const nestedOverrides = routePruneBaseDefaultOverrides(
    routeRecord(record.overrides)
  );
  const explicitInput = routeOverridesFromStructuredValue(record.input);
  const jsonInput = routeOverridesFromStructuredValue(record.json);
  const dataInput = routeOverridesFromStructuredValue(record.data);
  const resultInput = routeOverridesFromStructuredValue(record.result);
  const indexedInput = routeOverridesFromStructuredValue(record["0"]);
  return {
    ...directOverrides,
    ...nestedOverrides,
    ...explicitInput,
    ...jsonInput,
    ...dataInput,
    ...resultInput,
    ...indexedInput,
  };
}

function routeJsonCandidatesFromText(text: string): unknown[] {
  const candidates: unknown[] = [];
  const addJson = (value: string | null) => {
    if (!value) return;
    try {
      candidates.push(JSON.parse(value));
    } catch {
      // Ignore non-JSON request fragments.
    }
  };
  const addSearchParams = (value: string) => {
    try {
      const params = new URLSearchParams(value);
      for (const [, paramValue] of params.entries()) addJson(paramValue);
    } catch {
      // Ignore non-query request fragments.
    }
  };
  const texts = new Set<string>([text]);
  try {
    texts.add(decodeURIComponent(text));
  } catch {
    // Already decoded or malformed; raw text is still inspected.
  }
  for (const candidateText of texts) {
    addJson(candidateText);
    addSearchParams(candidateText);
    for (const fragment of candidateText.split(/\s+/).filter(Boolean)) {
      addJson(fragment);
      addSearchParams(fragment.includes("?") ? fragment.split("?").pop() ?? "" : fragment);
      try {
        const url = new URL(fragment);
        addSearchParams(url.search.slice(1));
      } catch {
        // Not a URL fragment.
      }
    }
  }
  return candidates;
}

function routeOverridesFromRequestBody(body?: string): Record<string, unknown> {
  if (!body) return {};
  return routeJsonCandidatesFromText(body).reduce<Record<string, unknown>>(
    (merged, candidate) => ({
      ...merged,
      ...routeOverridesFromStructuredValue(candidate),
    }),
    {}
  );
}

type RouteMockLogEntry = {
  requestUrl: string;
  procedurePath: string;
  procedures: string[];
  requestBodySnippet?: string;
  renderOutputKinds?: string[];
  renderArtifactKinds?: string[];
  responseBodySnippet?: string;
};

type RouteMockOptions = {
  autoPlan?: unknown;
  autoPlanError?: boolean;
  autoReviewRuns?: unknown[];
  render?: ReturnType<typeof completedRenderProjection>;
  storyboardReview?: unknown;
  overridePlanDelayMs?: number;
};

function routeMockData(
  procedure: string,
  options: RouteMockOptions = {},
  requestSnapshot?: string
): unknown {
  if (procedure === "auth.me") {
    return {
      id: 119,
      email: "feature119-route@smartspec.local",
      name: "Feature 119 Route",
      role: "admin",
      currentTenantId: "tenant_route",
      credits: 500,
    };
  }
  if (procedure === "marketplaceCapture.getProduct") {
    return {
      images: [
        {
          id: "route_image_1",
          url: ROUTE_IMAGE,
          type: "main",
          metadataJson: {
            role: "hero",
            source: "marketplace_product_image",
          },
        },
      ],
      product: {
        id: "product_1",
        productId: "product_1",
        productName: "สินค้าทดสอบ HyperFrames Route",
        platform: "shopee",
        sourceUrl: "https://example.test/product",
        affiliateUrl: "https://example.test/product?aff=ssp",
        priceCurrent: "199",
        currency: "THB",
        shopName: "Route Shop",
        ratingScore: "4.8",
        accessType: "owner",
        selectedImageUrls: [ROUTE_IMAGE],
        imagesJson: [{ url: ROUTE_IMAGE, type: "main" }],
        healthJson: {
          status: "ok",
          snapshotCount: 1,
          warnings: [],
          lastCheckedAt: "2026-06-04T00:00:00.000Z",
        },
      },
    };
  }
  if (procedure === "marketplaceCapture.getAutoStoryboardReviewPlan") {
    const plan =
      options.autoPlan ??
      autoPlanProjection({
        overrides: routeOverridesFromRequestBody(requestSnapshot),
      });
    return {
      contractVersion: "hyperframes_marketplace_auto_review_v1",
      access: (plan as { access?: unknown }).access,
      plan,
      templates: [],
    };
  }
  if (procedure === "marketplaceCapture.getHyperframesRenderJob") {
    const render = options.render ?? completedRenderProjection();
    return {
      contractVersion: "hyperframes_marketplace_auto_review_v1",
      render,
      polling: render.polling,
      notModified: false,
    };
  }
  if (procedure === "marketplaceCapture.startAutoStoryboardReview") {
    const plan =
      options.autoPlan ??
      autoPlanProjection({
        overrides: routeOverridesFromRequestBody(requestSnapshot),
      });
    const run = {
      id: "mar_started_1",
      productId: "product_1",
      status: "queued",
      currentStage: "product_preflight",
      outputMode: "storyboard_images",
      createdAt: "2026-06-04T00:00:00.000Z",
    };
    return {
      contractVersion: "hyperframes_marketplace_auto_review_v1",
      launchMode: "auto_storyboard_review",
      plan,
      run,
      render: null,
      chargeSummary: {
        chargeRequired: false,
        quotaDecision: "free_preview_allowed",
        noChargeReason: "not_applicable",
        idempotencyKey: "hf_credit_route",
      },
      polling: {
        recommendedIntervalMs: 30_000,
        maxIntervalMs: 30_000,
        stopWhenStatus: ["completed", "failed", "cancelled"],
        staleAfterMs: 30_000,
        terminalState: true,
        etag: "hf_started_route_etag",
      },
      invalidates: ["marketplaceCapture.listAutoReviewRuns"],
    };
  }
  if (procedure === "marketplaceCapture.repairHyperframesRenderJob") {
    const render = repairedRenderProjection();
    return {
      contractVersion: "hyperframes_marketplace_auto_review_v1",
      render,
      polling: render.polling,
      invalidates: ["marketplaceCapture.getHyperframesRenderJob"],
    };
  }
  if (procedure === "marketplaceCapture.saveHyperframesRenderToLibrary") {
    const render = { ...completedRenderProjection(), status: "saved_to_library" };
    return {
      contractVersion: "hyperframes_marketplace_auto_review_v1",
      created: true,
      libraryItem: {
        id: "library_1",
        itemType: "video",
        source: "marketplace_auto_review_hyperframes_render",
        title: "HyperFrames Marketplace Auto Review video",
        sourceUrl: ROUTE_VIDEO_URL,
      },
      render,
      chargeSummary: {
        chargeRequired: false,
        quotaDecision: "no_charge",
        noChargeReason: "not_billable",
        idempotencyKey: "hyperframes-library:tenant_route:mar_1:final:hf_input:hf_output",
      },
      polling: render.polling,
      invalidates: [],
    };
  }
  if (procedure === "marketplaceCapture.listInsightsByProduct") return [];
  if (procedure === "marketplaceCapture.listAutoReviewRuns") {
    return options.autoReviewRuns ?? [
      {
        id: "mar_1",
        productId: "product_1",
        status: "completed",
        currentStage: "storyboard_review",
        outputMode: "storyboard_images",
        renderJobId: "hf_route_1",
        storyboardReviewId: "1",
        links: {
          storyboardReview: "/storyboard-review/1",
        },
        createdAt: "2026-06-04T00:00:00.000Z",
      },
    ];
  }
  if (procedure === "videoEditorProjects.getStoryboardReview") {
    return options.storyboardReview ?? null;
  }
  if (procedure === "videoEditorProjects.listStoryboardReviews") return [];
  if (procedure === "users.getPreferences") {
    return { privateVault: { enabled: false } };
  }
  if (procedure === "library.getKnowledgeVaultPolicy") {
    return {
      enabled: true,
      tenantScoped: false,
      broadRollout: true,
      releaseGateStatus: "green",
      releaseGateBypassed: false,
      releaseGateOverride: null,
      surfaces: {
        quickSwitcher: true,
        inspector: true,
        savedViews: true,
        contextPacks: true,
        contextPacksRuntime: true,
        contextPacksDelegatedMcp: true,
      },
      surfaceReasons: {
        quickSwitcher: [],
        inspector: [],
        savedViews: [],
        contextPacks: [],
        contextPacksRuntime: [],
        contextPacksDelegatedMcp: [],
      },
    };
  }
  if (procedure === "library.getUploadStatus") return [];
  if (procedure === "library.getItem") {
    return {
      id: 1,
      item_id: 1,
      title: "HyperFrames Marketplace Auto Review video",
      item_type: "video",
      itemType: "video",
      source: "marketplace_auto_review_hyperframes_render",
      source_url: ROUTE_VIDEO_URL,
      sourceUrl: ROUTE_VIDEO_URL,
      thumbnail_url: ROUTE_IMAGE,
      thumbnailUrl: ROUTE_IMAGE,
      status: "ready",
      created_at: "2026-06-04T00:00:00.000Z",
      metadata: {
        duration_seconds: 10,
        marketplaceProductId: "product_1",
        productionRunId: "mar_1",
        renderJobId: "hf_route_1",
        source: "marketplace_auto_review_hyperframes_render",
      },
    };
  }
  if (procedure === "library.search") {
    return {
      results: [
        {
          id: 1,
          item_id: 1,
          title: "HyperFrames Marketplace Auto Review video",
          item_type: "video",
          itemType: "video",
          source: "marketplace_auto_review_hyperframes_render",
          source_url: ROUTE_VIDEO_URL,
          thumbnail_url: ROUTE_IMAGE,
          status: "ready",
          metadata: {
            marketplaceProductId: "product_1",
            productionRunId: "mar_1",
            renderJobId: "hf_route_1",
          },
        },
      ],
      total: 1,
      has_more: false,
    };
  }
  if (procedure === "library.listDocuments") {
    return {
      results: [
        {
          id: 1,
          item_id: 1,
          title: "HyperFrames Marketplace Auto Review video",
          item_type: "video",
          itemType: "video",
          source: "marketplace_auto_review_hyperframes_render",
          source_url: ROUTE_VIDEO_URL,
          thumbnail_url: ROUTE_IMAGE,
          status: "ready",
          visibility: "private",
          owner_user_id: 1,
          parent_id: null,
          metadata: {
            productId: "product_1",
            runId: "mar_1",
            renderJobId: "hf_route_1",
          },
          access_source: "owner",
          permission_level: "owner",
          shared_out_count: 0,
          has_shared_out: false,
          created_at: "2026-06-04T00:00:00.000Z",
          updated_at: "2026-06-04T00:00:00.000Z",
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
      has_more: false,
      scope: "my_library",
    };
  }
  if (procedure === "media.listTasks") return { tasks: [], total: 0 };
  if (procedure.endsWith(".list") || procedure.startsWith("mediaModels.")) return [];
  return null;
}

async function mockAuthenticatedHyperframesRoutes(
  page: Page,
  routeLog: RouteMockLogEntry[] = [],
  options: RouteMockOptions = {}
) {
  await page.addInitScript((routeVideoUrl) => {
    window.localStorage.setItem("smartspec_locale_chosen", "true");
    window.localStorage.setItem("smartspec_locale", "th");
    window.localStorage.setItem(
      "smartspec_media_studio_render_library_sessions_v1",
      JSON.stringify([
        {
          version: 1,
          source: "marketplace_auto_review_hyperframes_render",
          jobId: "hf_route_1",
          productionRunId: "mar_1",
          title: "HyperFrames Marketplace Auto Review video",
          metadata: {
            tenantId: "tenant_route",
            productId: "product_1",
            runId: "mar_1",
            renderJobId: "hf_route_1",
            renderIntent: "final",
            compositionInputHash: "hf_input",
            outputHash: "hf_output",
            outputUrl: routeVideoUrl,
          },
          startedAt: Date.now(),
          updatedAt: Date.now(),
        },
      ])
    );
  }, ROUTE_VIDEO_URL);
  await page.route("**/*", async route => {
    const requestUrl = route.request().url();
    const pathname = new URL(requestUrl).pathname;
    if (requestUrl === ROUTE_VIDEO_URL || requestUrl === ROUTE_SHOT_VIDEO_URL) {
      route.fulfill({
        status: 200,
        contentType: "video/mp4",
        body: readFileSync(ROUTE_VIDEO_FIXTURE_PATH),
      });
      return;
    }
    if (pathname === "/api/v1/media/tasks") {
      route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ tasks: [], total: 0, limit: 100, offset: 0 }),
      });
      return;
    }
    if (!pathname.startsWith("/trpc")) {
      void route.continue();
      return;
    }
    const procedurePath = getTrpcProcedure(requestUrl);
    const procedures = procedurePath.split(",").filter(Boolean);
    const render = procedures.includes("marketplaceCapture.getHyperframesRenderJob")
      ? options.render ?? completedRenderProjection()
      : null;
    const requestBodySnippet = route.request().postData() ?? undefined;
    const requestSnapshot = `${requestUrl} ${requestBodySnippet ?? ""}`;
    if (
      options.overridePlanDelayMs &&
      procedures.includes("marketplaceCapture.getAutoStoryboardReviewPlan") &&
      Object.keys(routeOverridesFromRequestBody(requestSnapshot)).length > 0
    ) {
      await new Promise(resolve =>
        setTimeout(resolve, options.overridePlanDelayMs)
      );
    }
    const payloadForProcedure = (procedure: string) =>
      options.autoPlanError &&
      procedure === "marketplaceCapture.getAutoStoryboardReviewPlan"
        ? trpcError(procedure, "Auto Storyboard Review plan failed")
        : trpcData(
            routeMockData(
              procedure,
              options,
              requestSnapshot
            )
          );
    const body =
      procedures.length > 1
        ? procedures.map(procedure => payloadForProcedure(procedure))
        : payloadForProcedure(procedurePath);
    const responseBody = JSON.stringify(body);
    routeLog.push({
      requestUrl,
      procedurePath,
      procedures,
      requestBodySnippet,
      renderOutputKinds: render?.outputRefs?.map(ref => `${ref.kind}:${ref.contentHash ?? "no_hash"}`),
      renderArtifactKinds: render?.artifactRefs?.map(ref => `${ref.kind}:${ref.retentionClass}:${ref.contentHash}`),
      responseBodySnippet: procedurePath === "marketplaceCapture.getHyperframesRenderJob"
        ? responseBody.slice(0, 4000)
        : undefined,
    });
    route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: responseBody,
    });
  });
}

test.describe("Marketplace HyperFrames Auto Review UI gate", () => {
  test("fixture matrix includes Auto, blocked, completed, duplicate, and Standard cases", async () => {
    const groups = new Set(fixtures.fixtures.map(item => item.group));
    for (const group of [
      "ready",
      "blocked",
      "completed",
      "duplicate",
      "standard_order",
      "feature_disabled",
      "credit_blocked",
      "template_disabled",
      "qa_failed",
      "product_categories",
      "thai_text_stress",
      "media_aspect",
      "subtitle_audio",
      "platform_profiles",
      "permissions",
    ]) {
      expect(groups).toContain(group);
    }
  });

  test("Product Detail Auto ready/blocked/disabled and Standard preservation", async () => {
    const ready = fixtureByGroup("ready");
    const blocked = fixtureByGroup("blocked");
    const disabled = fixtureByGroup("disabled");
    const featureDisabled = fixtureByGroup("feature_disabled");
    const standard = fixtureByGroup("standard_order");

    expect(ready.expected).toMatchObject({
      autoCanStart: true,
      autoFirstCtaVisible: true,
      advancedOverridesRequired: false,
      standardOrderAvailable: true,
    });
    expect(blocked.expected).toMatchObject({
      autoCanStart: false,
      standardOrderAvailable: true,
      standardOrderStartableWhileAutoBlocked: true,
    });
    expect(disabled.expected).toMatchObject({
      blocker: "worker_disabled",
      standardOrderAvailable: true,
      standardOrderStartableWhileAutoBlocked: true,
    });
    expect(featureDisabled.expected).toMatchObject({
      autoSurfaceHidden: true,
      standardDefaultWhenFeatureOff: true,
      standardOrderAvailable: true,
      hyperframesRequired: false,
    });
    expect(standard.expected).toMatchObject({
      procedure: "marketplaceCapture.startAutoReview",
      hyperframesRequired: false,
    });
  });

  test("Storyboard Review preview/result-first panel and manual fallback", async () => {
    const completed = fixtureByGroup("completed");

    expect(completed.render).toMatchObject({
      status: "completed",
      qaStatus: "passed",
      renderIntent: "final",
      outputKind: "final_video",
      outputHash: expect.stringMatching(/^hf_/),
    });
    expect(completed.expected).toMatchObject({
      storyboardReviewAutoPreviewFirst: true,
      manualFallbackVisible: true,
      saveToLibraryEnabled: true,
    });
  });

  test("MediaStudio resumes HyperFrames render-to-Library session", async () => {
    const completed = fixtureByGroup("completed");
    const duplicate = fixtureByGroup("duplicate");

    expect(completed.expected).toMatchObject({
      source: "marketplace_auto_review_hyperframes_render",
      mediaStudioResumeSession: true,
    });
    expect(completed.render).toMatchObject({
      renderJobId: expect.any(String),
      runId: expect.any(String),
      outputUrl: expect.stringMatching(/^https:\/\//),
    });
    expect(duplicate.expected).toMatchObject({
      created: false,
      chargeRepeated: false,
      idempotencyKey: expect.stringContaining("hyperframes-library:"),
    });
  });

  test("browser fixture UI covers responsive Auto, Standard, Storyboard, and MediaStudio states", async ({ page }) => {
    mkdirSync(evidenceDir, { recursive: true });
    const completed = fixtureByGroup("completed");
    const blocked = fixtureByGroup("blocked");
    const qaFailed = fixtureByGroup("qa_failed");
    const thaiStress = fixtureByGroup("thai_text_stress");
    const title = String(
      (thaiStress.product as Record<string, unknown> | undefined)?.title ??
        "HyperFrames Marketplace Auto Review"
    );
    await page.setContent(
      `<!doctype html>
      <html lang="th">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; font-family: Inter, system-ui, sans-serif; color: #0f172a; background: #f8fafc; }
            main { width: min(1120px, 100%); margin: 0 auto; padding: 16px; display: grid; gap: 12px; }
            section { border: 1px solid #cbd5e1; border-radius: 8px; background: white; padding: 14px; }
            .toolbar { min-width: 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
            .actions { min-width: 0; display: flex; flex-wrap: wrap; gap: 8px; }
            button, a { min-height: 36px; border-radius: 6px; border: 1px solid #94a3b8; background: white; color: #0f172a; padding: 7px 10px; font: inherit; text-decoration: none; }
            .primary { background: #0369a1; color: white; border-color: #0369a1; }
            .status { display: grid; gap: 6px; min-width: 0; }
            .status span, .status strong, button, a { min-width: 0; overflow-wrap: anywhere; }
            .long { overflow-wrap: anywhere; line-height: 1.5; }
            .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
            .shot { aspect-ratio: 9 / 16; border-radius: 6px; background: linear-gradient(135deg, #e0f2fe, #fef3c7); border: 1px solid #bae6fd; color: #0f172a; display: grid; place-items: center; padding: 8px; text-align: center; }
            .source-badge { display: inline-flex; width: fit-content; max-width: 100%; white-space: normal; overflow-wrap: anywhere; border-radius: 999px; border: 1px solid #0f766e; color: #0f766e; padding: 3px 8px; font-size: 12px; }
            @media (prefers-color-scheme: dark) {
              body { color: #f8fafc; background: #111827; }
              section { background: #1f2937; border-color: #475569; }
              button, a { background: #111827; color: #f8fafc; border-color: #94a3b8; }
              .primary { background: #38bdf8; color: #082f49; border-color: #38bdf8; }
              .source-badge { border-color: #5eead4; color: #99f6e4; }
            }
            @media (max-width: 520px) { main { padding: 10px; } .grid { grid-template-columns: 1fr; } .toolbar { align-items: stretch; } .actions, button, a { width: 100%; } }
          </style>
        </head>
        <body>
          <main data-testid="marketplace-hyperframes-fixture">
            <section aria-label="Product Detail Auto first">
              <div class="toolbar">
                <div class="status">
                  <strong>Auto Storyboard Review</strong>
                  <span class="long">${title}</span>
                  <span>Ready: ${completed.render?.status}; Blocked fallback: ${blocked.expected?.blocker}</span>
                </div>
                <div class="actions">
                  <button class="primary" aria-label="Start Auto Storyboard Review">Start Auto Review</button>
                  <button aria-label="Open Standard Order">Standard Order</button>
                </div>
              </div>
            </section>
            <section aria-label="Storyboard Review auto preview">
              <div class="toolbar">
                <div class="status">
                  <strong>Auto preview result first</strong>
                  <span>QA: ${completed.render?.qaStatus}; failed case: ${qaFailed.render?.qaStatus}</span>
                </div>
                <div class="actions">
                  <a href="${completed.render?.outputUrl}" target="_blank">Open output</a>
                  <button class="primary">Save to Library</button>
                  <button>Manual fallback</button>
                </div>
              </div>
              <div class="grid" aria-label="Snapshot comparison">
                <div class="shot">Snapshot ready</div>
                <div class="shot">Safe area</div>
                <div class="shot">CTA scene</div>
              </div>
            </section>
            <section aria-label="MediaStudio HyperFrames session">
              <div class="toolbar">
                <div class="status">
                  <strong>HyperFrames render-to-Library session pending</strong>
                  <span>${completed.expected?.source}</span>
                </div>
                <div class="actions">
                  <button class="primary">Save to Library</button>
                  <button>Open Media Studio</button>
                  <button>Dismiss</button>
                </div>
              </div>
            </section>
            <section aria-label="Library and Media History discovery">
              <div class="toolbar">
                <div class="status">
                  <strong>Finalized Library video</strong>
                  <span class="source-badge">HyperFrames Marketplace Auto Review</span>
                  <span>Product product_1 · Run mar_1 · Media History video filter</span>
                </div>
                <div class="actions">
                  <a href="/media-history?source=marketplace_auto_review_hyperframes_render&type=video">Open Media History</a>
                  <a href="/document-management?source=marketplace_auto_review_hyperframes_render">Open Library</a>
                </div>
              </div>
            </section>
            <section aria-label="Video Editor handoff">
              <div class="toolbar">
                <div class="status">
                  <strong>Open finalized MP4 as normal video</strong>
                  <span>Library item 1 is passed to the existing Video Editor route.</span>
                </div>
                <div class="actions">
                  <a href="/video-editor?libraryItemId=1">Open in Video Editor</a>
                </div>
              </div>
            </section>
          </main>
        </body>
      </html>`
    );

    const evidence: Array<Record<string, unknown>> = [];
    let keyboardPathOk = false;
    for (const viewport of [
      { width: 360, height: 800 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      for (const theme of ["light", "dark"] as const) {
        await page.setViewportSize(viewport);
        await page.emulateMedia({
          colorScheme: theme,
          reducedMotion: viewport.width === 360 ? "reduce" : "no-preference",
        });
        await expect(page.getByRole("button", { name: /standard order/i })).toBeVisible();
        await expect(page.getByRole("button", { name: /save to library/i }).first()).toBeVisible();
        await expect(
          page.getByRole("link", { name: /open in video editor/i })
        ).toHaveAttribute("href", "/video-editor?libraryItemId=1");
        await expect(
          page.getByRole("link", { name: /open media history/i })
        ).toHaveAttribute(
          "href",
          "/media-history?source=marketplace_auto_review_hyperframes_render&type=video"
        );
        if (!keyboardPathOk) {
          await page.keyboard.press("Tab");
          await expect(
            page.getByRole("button", { name: /start auto storyboard review/i })
          ).toBeFocused();
          await page.keyboard.press("Tab");
          await expect(
            page.getByRole("button", { name: /open standard order/i })
          ).toBeFocused();
          keyboardPathOk = true;
        }
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
        const accessibility = await new AxeBuilder({ page })
          .include('[data-testid="marketplace-hyperframes-fixture"]')
          .analyze();
        expect(accessibility.violations).toEqual([]);
        const screenshotPath = join(
          evidenceDir,
          `marketplace-hyperframes-${theme}-${viewport.width}x${viewport.height}.png`
        );
        await page.screenshot({ path: screenshotPath, fullPage: true });
        evidence.push({
          viewport,
          theme,
          reducedMotion: viewport.width === 360,
          screenshotPath,
          overflow,
          axeViolations: accessibility.violations.length,
        });
      }
    }
    writeFileSync(
      join(evidenceDir, "browser-evidence.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          keyboardPathOk,
          surfaces: [
            "Product Detail",
            "Storyboard Review",
            "MediaStudio",
            "Library",
            "Media History",
            "Video Editor",
          ],
          evidence,
        },
        null,
        2
      )
    );
  });

  test("authenticated Product Detail hides Auto surface when HyperFrames access is disabled", async ({
    page,
  }, testInfo) => {
    mkdirSync(evidenceDir, { recursive: true });
    await mockAuthenticatedHyperframesRoutes(page, [], {
      autoPlan: autoPlanProjection({
        canAccessAuto: false,
        flagsEnabled: false,
        workerEnabled: false,
      }),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });

    await page.goto(`${BASE_URL}/marketplace-capture/products/product_1`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByRole("button", { name: /auto mode/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /standard mode/i })).toHaveCount(0);
    await expect(page.getByText("Standard Order").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("button", { name: /use standard|ใช้ Standard/i }).first()
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("route-product-detail-feature-disabled-390x844.png"),
      fullPage: true,
    });
  });

  test("authenticated Product Detail shows retryable Auto plan errors while preserving Standard Order", async ({
    page,
  }) => {
    await mockAuthenticatedHyperframesRoutes(page, [], {
      autoPlanError: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });

    await page.goto(`${BASE_URL}/marketplace-capture/products/product_1`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByText("โหลด Auto Storyboard Review plan ไม่สำเร็จ")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("button", { name: /retry auto plan|โหลดแผน Auto ใหม่/i })
    ).toBeVisible();
    await page
      .getByRole("button", { name: /retry auto plan|โหลดแผน Auto ใหม่/i })
      .click();
    await expect(page.getByText("โหลด Auto Storyboard Review plan ไม่สำเร็จ")).toBeVisible();
    await expect(page.getByText("Standard Order").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /use standard|ใช้ Standard/i }).first()
    ).toBeVisible();
  });

  test("authenticated Product Detail resumes the active Auto run without starting a duplicate", async ({
    page,
  }) => {
    const routeLog: RouteMockLogEntry[] = [];
    await mockAuthenticatedHyperframesRoutes(page, routeLog, {
      autoPlan: autoPlanProjection({ activeRunId: "mar_active_1" }),
      autoReviewRuns: [
        {
          id: "mar_active_1",
          productionRunId: "prod_active_1",
          productId: "product_1",
          status: "running",
          currentStage: "storyboard_review",
          outputMode: "storyboard_images",
          renderJobId: "hf_route_1",
          storyboardReviewId: "1",
          links: {
            storyboardReview: "/storyboard-review/1",
          },
          createdAt: "2026-06-04T00:00:00.000Z",
        },
      ],
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });

    await page.goto(`${BASE_URL}/marketplace-capture/products/product_1`, {
      waitUntil: "domcontentloaded",
    });
    const resumeButton = page.getByRole("button", {
      name: /resume auto storyboard review|เปิดงาน Auto Storyboard Review/i,
    });
    await expect(resumeButton).toBeVisible({ timeout: 30_000 });
    const startCallsBefore = routeLog.filter(entry =>
      entry.procedures.includes("marketplaceCapture.startAutoStoryboardReview")
    ).length;
    const expectedPlanHash = routePlanHashFromOverrides({});

    page.once("dialog", dialog => void dialog.accept());
    await resumeButton.click();

    await expect
      .poll(
        () =>
          routeLog.filter(entry =>
            entry.procedures.includes(
              "marketplaceCapture.startAutoStoryboardReview"
            )
          ).length
      )
      .toBe(startCallsBefore + 1);
    const startCall = routeLog.find(entry =>
      entry.procedures.includes("marketplaceCapture.startAutoStoryboardReview")
    );
    expect(startCall?.requestBodySnippet ?? "").toContain(
      `"expectedPlanHash":"${expectedPlanHash}"`
    );
    expect(startCall?.requestBodySnippet ?? "").toContain(
      `"idempotencyKey":"hf-auto-resume:${expectedPlanHash}:`
    );
  });

  test("authenticated Product Detail treats an active Standard run as a Standard blocker, not Auto resume", async ({
    page,
  }) => {
    const routeLog: RouteMockLogEntry[] = [];
    await mockAuthenticatedHyperframesRoutes(page, routeLog, {
      autoPlan: autoPlanProjection({
        canStart: false,
        blockers: [
          {
            code: "active_standard_run",
            severity: "blocking",
            copyId: "hyperframes.blocker.active_standard_run",
            safeMessage:
              "Standard Order ที่กำลังทำอยู่ยังไม่เสร็จ ระบบจึงไม่เริ่ม Auto Storyboard Review ซ้ำ",
            nextAction: "ใช้ Standard Order ที่กำลังทำอยู่",
            userActionRequired: true,
          },
        ],
        primaryAction: {
          label: "Use Standard Order",
          actionId: "use_standard_order",
          disabled: false,
          copyId: "hyperframes.action.use_standard_order",
        },
      }),
      autoReviewRuns: [
        {
          id: "mar_standard_1",
          productionRunId: "prod_standard_1",
          productId: "product_1",
          status: "running",
          currentStage: "storyboard_review",
          outputMode: "storyboard_images",
          idempotencyKey: "marketplace-auto-review:standard",
          storyboardReviewId: "1",
          links: {
            storyboardReview: "/storyboard-review/1",
          },
          createdAt: "2026-06-04T00:00:00.000Z",
        },
      ],
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });

    await page.goto(`${BASE_URL}/marketplace-capture/products/product_1`, {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByText(/Standard Order ที่กำลังทำอยู่ยังไม่เสร็จ/i)
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("button", {
        name: /resume auto storyboard review|เปิดงาน Auto Storyboard Review/i,
      })
    ).toHaveCount(0);
    await expect(page.getByText("Standard Order").first()).toBeVisible();

    const startCallsBefore = routeLog.filter(entry =>
      entry.procedures.includes("marketplaceCapture.startAutoStoryboardReview")
    ).length;

    await page
      .getByRole("button", { name: /use standard order|ใช้ Standard Order/i })
      .first()
      .click();

    await expect(page.getByText("Standard Order").first()).toBeVisible();
    expect(
      routeLog.filter(entry =>
        entry.procedures.includes("marketplaceCapture.startAutoStoryboardReview")
      )
    ).toHaveLength(startCallsBefore);
  });

  test("authenticated Product Detail supports Advanced Auto overrides, reset, and start payload", async ({
    page,
  }) => {
    const routeLog: RouteMockLogEntry[] = [];
    await mockAuthenticatedHyperframesRoutes(page, routeLog, {
      overridePlanDelayMs: 1500,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });

    await page.goto(`${BASE_URL}/marketplace-capture/products/product_1`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByText("Auto Storyboard Review").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Standard Order").first()).toBeVisible();
    await expect(page.getByText("Custom controls สำหรับ flow เดิม")).toHaveCount(0);
    await page
      .getByRole("button", { name: /ตัวเลือก Auto ขั้นสูง/i })
      .click();
    await expect(page.getByLabel("รูปแบบ")).toHaveValue("generic_vertical_9_16");
    await expect(page.getByLabel("คุณภาพ")).toHaveValue("balanced");
    await expect(page.getByLabel("เสียง")).toHaveValue("native_video_audio");
    await expect(page.getByLabel("นโยบายข้อความ")).toHaveValue("no_text");
    await expect(page.getByLabel("จำนวนช็อต")).toHaveValue("9");
    await expect(page.getByLabel("เฟรม")).toHaveValue("storyboard_3x3_split");
	    await expect(page.getByLabel("โมเดลภาพ")).toHaveValue("google-banana-2");

    await page.getByLabel("คุณภาพ").selectOption("high");
    await expect(page.getByText(/กำลังอัปเดตแผนอัตโนมัติ/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /สร้าง Auto Storyboard Review/i }).first()
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: /สร้าง Auto Storyboard Review/i }).first()
    ).toBeEnabled();
    await page.getByLabel("คุณภาพ").selectOption("balanced");
    await expect(page.getByText(/ไม่มี override ที่เปิดอยู่/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /ใช้แผนอัตโนมัติ/i })
    ).toHaveCount(0);

    await page.getByLabel("คุณภาพ").selectOption("high");
    await page.getByLabel("จำนวนช็อต").selectOption("7");
    await page.getByLabel("รูปแบบ").selectOption("tiktok_reels_shorts_9_16");
    await page.getByLabel("โมเดลภาพ").selectOption("google-banana-2");

    await expect(page.getByText(/กำลังอัปเดตแผนอัตโนมัติ/)).toBeVisible();
    await expect(page.getByText(/คุณภาพ/).first()).toBeVisible();
    await page.getByRole("button", { name: /ใช้แผนอัตโนมัติ/i }).click();
    await expect(page.getByText(/กำลังอัปเดตแผนอัตโนมัติ/)).toHaveCount(0);
    await expect(page.getByText("Standard Order").first()).toBeVisible();
    await expect(page.getByText("Custom controls สำหรับ flow เดิม")).toHaveCount(0);

    await page.getByRole("button", { name: /standard mode|โหมด Standard/i }).click();
    await expect(page.getByText("Custom controls สำหรับ flow เดิม")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /ตัวเลือก Auto ขั้นสูง/i })
    ).toHaveCount(0);
    await page.getByRole("button", { name: /auto mode|โหมด Auto/i }).click();

    await page
      .getByRole("button", { name: /ตัวเลือก Auto ขั้นสูง/i })
      .click();
	    await page.getByLabel("คุณภาพ").selectOption("high");
	    await page.getByLabel("จำนวนช็อต").selectOption("7");
	    await page.getByLabel("รูปแบบ").selectOption("tiktok_reels_shorts_9_16");
	    await page.getByLabel("โมเดลภาพ").selectOption("google-nano-banana-pro");
	    await expect(page.getByText(/กำลังอัปเดตแผนอัตโนมัติ/)).toHaveCount(0);
	    await expect(
	      page.getByRole("button", { name: /สร้าง Auto Storyboard Review/i }).first()
	    ).toBeEnabled();
	    page.once("dialog", dialog => void dialog.accept());
	    await page
	      .getByRole("button", { name: /สร้าง Auto Storyboard Review/i })
	      .first()
	      .click();

    await expect
      .poll(() => {
        const startCall = routeLog.find(entry =>
          entry.procedures.includes("marketplaceCapture.startAutoStoryboardReview")
        );
        return startCall?.requestBodySnippet ?? "";
      })
      .toContain('"qualityMode":"high"');
    const startCall = routeLog.find(entry =>
      entry.procedures.includes("marketplaceCapture.startAutoStoryboardReview")
    );
    expect(startCall?.requestBodySnippet ?? "").toContain('"shotCount":7');
    expect(startCall?.requestBodySnippet ?? "").toContain(
      '"platformPresetId":"tiktok_reels_shorts_9_16"'
    );
	    expect(startCall?.requestBodySnippet ?? "").toContain(
	      '"imageModel":"google-nano-banana-pro"'
	    );
    const expectedPlanHash = routePlanHashFromOverrides({
      qualityMode: "high",
	      shotCount: 7,
	      platformPresetId: "tiktok_reels_shorts_9_16",
	      imageModel: "google-nano-banana-pro",
	    });
    expect(startCall?.requestBodySnippet ?? "").toContain(
      `"expectedPlanHash":"${expectedPlanHash}"`
    );
	    expect(startCall?.requestBodySnippet ?? "").toContain(
	      `"idempotencyKey":"hf-auto-start:${expectedPlanHash}:`
	    );
  });

  test("authenticated Storyboard Review repair action calls the self-service repair API", async ({
    page,
  }) => {
    mkdirSync(evidenceDir, { recursive: true });
    const routeLog: RouteMockLogEntry[] = [];
    await mockAuthenticatedHyperframesRoutes(page, routeLog, {
      render: retryableRenderProjection(),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });

    await page.goto(
      `${BASE_URL}/storyboard-review?hyperframesRenderJobId=hf_route_1&productId=product_1&runId=mar_1`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page.getByLabel("HyperFrames storyboard review")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("button", { name: /retry worker step/i }).first()
    ).toBeVisible();
    await page.getByRole("button", { name: /retry worker step/i }).first().click();
    await expect
      .poll(() =>
        routeLog.some(entry =>
          entry.procedures.includes("marketplaceCapture.repairHyperframesRenderJob")
        )
      )
      .toBe(true);
    await page.screenshot({
      path: join(evidenceDir, "route-storyboard-repair-390x844.png"),
      fullPage: true,
    });
  });

  test("authenticated Storyboard Review selected shot video preview keeps media visible under overlay layers", async ({
    page,
  }) => {
    mkdirSync(evidenceDir, { recursive: true });
    const routeLog: RouteMockLogEntry[] = [];
    await mockAuthenticatedHyperframesRoutes(page, routeLog, {
      storyboardReview: storyboardReviewWithVideoShots(),
    });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });

    await page.goto(
      `${BASE_URL}/storyboard-review/1?hyperframesRenderJobId=hf_route_1&productId=product_1&runId=mar_1`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page.getByLabel("HyperFrames storyboard review")).toBeVisible({
      timeout: 30_000,
    });
    if (!(await page.getByText(/Shot text map/i).first().isVisible())) {
      await page.getByRole("button", { name: /ตั้งค่า|Settings/i }).click();
    }
    await expect(page.getByText(/Shot text map/i)).toBeVisible();

    await page.getByRole("button", { name: /เล่นวิดีโอ|Play video/i }).first().click();
    const inlineStage = page.locator(".hf-preview-stage--large").first();
    const inlineVideo = inlineStage.locator("video").first();
    const inlineVideoDiagnostics = await inlineVideo.evaluate(video => {
      const element = video as HTMLVideoElement;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const parentRect = element.parentElement?.getBoundingClientRect();
      return {
        src: element.currentSrc || element.src,
        readyState: element.readyState,
        videoWidth: element.videoWidth,
        videoHeight: element.videoHeight,
        paused: element.paused,
        currentTime: element.currentTime,
        rect: {
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
        },
        parentRect: parentRect
          ? {
              width: parentRect.width,
              height: parentRect.height,
              top: parentRect.top,
              left: parentRect.left,
            }
          : null,
        opacity: style.opacity,
        display: style.display,
        visibility: style.visibility,
        position: style.position,
        zIndex: style.zIndex,
      };
    });
    const allStageDiagnostics = await page.locator(".hf-preview-stage--large").evaluateAll(stages =>
      stages.map((stage, index) => {
        const element = stage as HTMLElement;
        const video = element.querySelector("video") as HTMLVideoElement | null;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          index,
          previewMode: element.getAttribute("data-preview-mode"),
          rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
          opacity: style.opacity,
          display: style.display,
          visibility: style.visibility,
          video: video
            ? {
                src: video.currentSrc || video.src,
                readyState: video.readyState,
                videoWidth: video.videoWidth,
                videoHeight: video.videoHeight,
                visibility: window.getComputedStyle(video).visibility,
              }
            : null,
        };
      })
    );
    writeFileSync(
      join(evidenceDir, "route-storyboard-selected-shot-video-preassert.json"),
      JSON.stringify({ inlineVideoDiagnostics, allStageDiagnostics, routeLog }, null, 2)
    );
    await expect(inlineVideo).toBeVisible();
    await expect
      .poll(
        async () =>
          inlineVideo.evaluate(video => {
            const element = video as HTMLVideoElement;
            const style = window.getComputedStyle(element);
            return (
              element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
              element.videoWidth > 0 &&
              element.videoHeight > 0 &&
              style.opacity !== "0" &&
              style.visibility !== "hidden" &&
              style.display !== "none"
            );
          }),
        { timeout: 20_000 }
      )
      .toBe(true);
    await expect(inlineStage.locator(".hf-preview-overlay-copy")).toBeVisible();
    await expect(inlineStage.locator(".hf-sub-preview-inline")).toBeVisible();

    const inlineVideoState = await inlineVideo.evaluate(video => {
      const element = video as HTMLVideoElement;
      const style = window.getComputedStyle(element);
      return {
        src: element.currentSrc || element.src,
        readyState: element.readyState,
        videoWidth: element.videoWidth,
        videoHeight: element.videoHeight,
        currentTime: element.currentTime,
        opacity: style.opacity,
        display: style.display,
        visibility: style.visibility,
      };
    });
    writeFileSync(
      join(evidenceDir, "route-storyboard-selected-shot-video-preview.json"),
      JSON.stringify({ inlineVideoState, routeLog }, null, 2)
    );
    await inlineStage.screenshot({
      path: join(evidenceDir, "route-storyboard-selected-shot-video-preview.png"),
    });

    await page.getByRole("button", { name: /ขยายวิดีโอ shot 1|Expand shot 1 video/i }).click();
    const dialog = page.getByRole("dialog", { name: /Shot 1/i });
    await expect(dialog).toBeVisible();
    const fullscreenVideo = dialog.locator("video").first();
    await expect(fullscreenVideo).toBeVisible();
    await expect
      .poll(
        async () =>
          fullscreenVideo.evaluate(video => {
            const element = video as HTMLVideoElement;
            const style = window.getComputedStyle(element);
            return (
              element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
              element.videoWidth > 0 &&
              element.videoHeight > 0 &&
              style.opacity !== "0" &&
              style.visibility !== "hidden" &&
              style.display !== "none"
            );
          }),
        { timeout: 20_000 }
      )
      .toBe(true);
    await expect(dialog.locator(".hf-preview-overlay-copy")).toBeVisible();
    await expect(dialog.locator(".hf-sub-preview-inline")).toBeVisible();
    await dialog.screenshot({
      path: join(evidenceDir, "route-storyboard-selected-shot-video-fullscreen.png"),
    });
  });

  test("authenticated live app routes expose Product Detail, Storyboard Review, and MediaStudio HyperFrames flow", async ({
    page,
  }) => {
    mkdirSync(evidenceDir, { recursive: true });
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const routeLog: RouteMockLogEntry[] = [];
    page.on("console", message => {
      const text = message.text();
      if (message.type() === "error" && !text.startsWith("Failed to load resource:")) {
        consoleErrors.push(text);
      }
    });
    page.on("pageerror", error => {
      pageErrors.push(error?.stack ?? error.message ?? String(error));
    });
    await mockAuthenticatedHyperframesRoutes(page, routeLog);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });

    await page.goto(`${BASE_URL}/marketplace-capture/products/product_1`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText("Auto Storyboard Review").first()).toBeVisible({
      timeout: 30_000,
    });
    const autoFirstAction = page.getByLabel("Auto Storyboard Review first action");
    const autoMode = page.getByRole("button", { name: /auto mode|โหมด Auto/i });
    const standardMode = page.getByRole("button", {
      name: /standard mode|โหมด Standard/i,
    });
    const autoCta = page
      .getByRole("button", {
        name: /create auto storyboard review|สร้าง Auto Storyboard Review/i,
      })
      .first();
    const productSummary = page.getByLabel("Product summary");
    await expect(autoFirstAction).toBeVisible();
    await expect(autoMode).toBeVisible();
    await expect(standardMode).toBeVisible();
    await expect(autoCta).toBeVisible();
    await expect(productSummary).toBeVisible();
    const firstViewportHeight = page.viewportSize()?.height ?? 844;
    const [
      autoFirstActionBox,
      autoCtaBox,
      standardModeBox,
      productSummaryBox,
    ] = await Promise.all([
      autoFirstAction.boundingBox(),
      autoCta.boundingBox(),
      standardMode.boundingBox(),
      productSummary.boundingBox(),
    ]);
    const productDetailFirstViewport = {
      viewportHeight: firstViewportHeight,
      autoFirstActionTop: Math.round(
        autoFirstActionBox?.y ?? Number.POSITIVE_INFINITY
      ),
      autoCtaTop: Math.round(autoCtaBox?.y ?? Number.POSITIVE_INFINITY),
      standardModeTop: Math.round(
        standardModeBox?.y ?? Number.POSITIVE_INFINITY
      ),
      productSummaryTop: Math.round(
        productSummaryBox?.y ?? Number.POSITIVE_INFINITY
      ),
    };
    expect(autoFirstActionBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(
      firstViewportHeight
    );
    expect(autoCtaBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(
      firstViewportHeight
    );
    expect(standardModeBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(
      firstViewportHeight
    );
    expect(autoFirstActionBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(
      productSummaryBox?.y ?? Number.NEGATIVE_INFINITY
    );
    await expect(page.getByRole("button", { name: /standard order/i }).first()).toBeVisible();
    await page.getByRole("button", { name: /ดูสถานะงาน|view status/i }).click();
    await expect(
      page.getByRole("link", { name: /open storyboard review/i }).first()
    ).toHaveAttribute(
      "href",
      "/storyboard-review/1?hyperframesRenderJobId=hf_route_1&productId=product_1&runId=mar_1"
    );
    const captureRouteAudit = async () =>
      page.evaluate(() => {
        const clientWidth = document.documentElement.clientWidth;
        const getHorizontalBoundaryState = (element: HTMLElement) => {
          let current: HTMLElement | null = element;
          const elementRect = element.getBoundingClientRect();
          let insideHorizontalScroll = false;
          let insideHorizontalBoundary = false;
          while (current && current !== document.body) {
            const style = window.getComputedStyle(current);
            const currentRect = current.getBoundingClientRect();
            const handlesHorizontalOverflow = [
              "auto",
              "scroll",
              "hidden",
              "clip",
            ].includes(style.overflowX);
            const intentionallyScrollable =
              handlesHorizontalOverflow &&
              (style.overflowX === "auto" || style.overflowX === "scroll") &&
              current.scrollWidth > current.clientWidth + 1;
            const intentionallyClipped =
              handlesHorizontalOverflow &&
              (elementRect.right > currentRect.right + 1 ||
                elementRect.left < currentRect.left - 1);
            insideHorizontalScroll =
              insideHorizontalScroll || intentionallyScrollable;
            insideHorizontalBoundary =
              insideHorizontalBoundary ||
              intentionallyScrollable ||
              intentionallyClipped;
            current = current.parentElement;
          }
          return { insideHorizontalScroll, insideHorizontalBoundary };
        };
        const interactiveTags = new Set([
          "a",
          "button",
          "input",
          "select",
          "textarea",
        ]);
        const interactiveRoles = new Set([
          "button",
          "combobox",
          "link",
          "menuitem",
          "slider",
          "switch",
          "tab",
        ]);
        const elements = Array.from(document.querySelectorAll<HTMLElement>("body *"))
          .map(element => {
            const rect = element.getBoundingClientRect();
            const tag = element.tagName.toLowerCase();
            const role = element.getAttribute("role");
            const horizontalBoundary = getHorizontalBoundaryState(element);
            return {
              tag,
              role,
              ariaLabel: element.getAttribute("aria-label"),
              text: element.textContent
                ?.trim()
                .replace(/\s+/g, " ")
                .slice(0, 120),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
              className: String(element.getAttribute("class") ?? "").slice(
                0,
                180
              ),
              insideHorizontalBoundary:
                horizontalBoundary.insideHorizontalBoundary,
              insideHorizontalScroll: horizontalBoundary.insideHorizontalScroll,
              interactive:
                interactiveTags.has(tag) ||
                Boolean(role && interactiveRoles.has(role)),
            };
          })
          .filter(item => item.right > clientWidth + 1 || item.left < -1);
        const overflowElements = elements.filter(
          item => !item.insideHorizontalBoundary
        );
        const scrollableOverflowElements = elements.filter(
          item => item.insideHorizontalScroll
        );
        const scrollableInteractiveElements = scrollableOverflowElements.filter(
          item => item.insideHorizontalScroll && item.interactive
        );
        const scrollableInteractiveWithoutAriaLabels =
          scrollableInteractiveElements.filter(item => !item.ariaLabel);
        return {
          overflow: {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth,
          },
          overflowElementCount: overflowElements.length,
          scrollableOverflowElementCount: scrollableOverflowElements.length,
          interactiveScrollableOverflowElementCount:
            scrollableInteractiveElements.length,
          scrollableInteractiveWithoutAriaLabelCount:
            scrollableInteractiveWithoutAriaLabels.length,
          overflowElements: overflowElements.slice(0, 30),
          scrollableOverflowElements: scrollableOverflowElements.slice(0, 30),
          interactiveScrollableOverflowElements:
            scrollableInteractiveElements.slice(0, 30),
          scrollableInteractiveWithoutAriaLabels:
            scrollableInteractiveWithoutAriaLabels.slice(0, 30),
        };
      });
    const productDetailAudit = await captureRouteAudit();
    const productDetailOverflow = productDetailAudit.overflow;
    await page.screenshot({
      path: join(evidenceDir, "route-product-detail-390x844.png"),
      fullPage: true,
    });

    await page.goto(
      `${BASE_URL}/storyboard-review?hyperframesRenderJobId=hf_route_1&productId=product_1&runId=mar_1`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page.getByLabel("HyperFrames storyboard review")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/ยังไม่มีวิดีโอ MP4 ที่ completed|No completed MP4 video shots/i)).toBeVisible();
    await expect(page.getByText(/Final Composite ต้องใช้วิดีโอ MP4 อย่างน้อย 1 shot|Final Composite requires at least one completed MP4 video shot/i)).toBeVisible();
    await page.getByRole("button", { name: /ตั้งค่า|Settings/i }).click();
    await expect(page.getByText(/Shot text map/i)).toBeVisible();
    await expect(page.getByText(/SFX timeline \/ Audio event map|SFX timeline \/ audio event map/i)).toBeVisible();
    await expect(page.getByText(/Prompt ตรงกับ option ล่าสุด|Prompt matches current options/i)).toBeVisible();
    const hyperframesPrompt = await page
      .getByLabel(/HyperFrames full render prompt/i)
      .inputValue();
    expect(hyperframesPrompt).toContain("Create a 9:16 vertical product ad video using HyperFrames");
    expect(hyperframesPrompt).toContain("Feature callouts:");
    expect(hyperframesPrompt).toContain("Animation:");
    expect(hyperframesPrompt).toContain("Export:");
    expect(hyperframesPrompt.length).toBeGreaterThan(600);
    await page
      .locator("label", { hasText: "Overlay preset" })
      .locator("select")
      .selectOption("hook_sequence");
    await expect(page.getByText(/ต้อง Generate prompt ใหม่ก่อน render|generate a fresh prompt before render/i)).toBeVisible();
    await expect(page.getByText(/Preview และ option ด้านบนเปลี่ยนแล้ว|Preview and options changed/i)).toBeVisible();
    await expect
      .poll(async () => page.getByLabel(/HyperFrames full render prompt/i).inputValue())
      .toBe(hyperframesPrompt);
    await expect(page.getByText("Payload preview ก่อนส่ง HyperFrames")).toBeVisible();
    await page.getByRole("button", { name: /เปิดดู payload|Show payload/i }).click();
    await expect(page.getByText('"prompt":')).toBeVisible();
    const storyboardPanelDebug = await page
      .getByLabel("HyperFrames storyboard review")
      .evaluate(element => ({
        text: element.textContent,
        buttons: Array.from(element.querySelectorAll("button")).map(button =>
          button.textContent?.trim()
        ),
        links: Array.from(element.querySelectorAll("a")).map(anchor => ({
          text: anchor.textContent?.trim(),
          href: anchor.getAttribute("href"),
        })),
        images: Array.from(element.querySelectorAll("img")).map(image => ({
          alt: image.getAttribute("alt"),
          src: image.getAttribute("src")?.slice(0, 80),
        })),
        renderStatus: (() => {
          const status = element.querySelector(
            '[aria-label="HyperFrames render status"]'
          );
          return {
            libraryReady: status?.getAttribute("data-library-ready"),
            buttonCount: status?.querySelectorAll("button").length ?? 0,
            linkCount: status?.querySelectorAll("a").length ?? 0,
          };
        })(),
      }));
    writeFileSync(
      join(evidenceDir, "route-storyboard-debug.json"),
      JSON.stringify({ routeLog, storyboardPanelDebug }, null, 2)
    );
    expect(JSON.stringify(routeLog)).not.toContain("marketplace-auto-review/");
    await expect(page.getByRole("button", { name: /บันทึกเข้า Library|save to library/i }).first()).toBeVisible();
    const storyboardReviewAudit = await captureRouteAudit();
    const storyboardReviewOverflow = storyboardReviewAudit.overflow;
    await page.screenshot({
      path: join(evidenceDir, "route-storyboard-review-390x844.png"),
      fullPage: true,
    });

    await page.goto(`${BASE_URL}/media-studio`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByText(/มี HyperFrames render ที่รอบันทึกเข้า Library|HyperFrames render-to-Library session pending/i)
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /บันทึกเข้า Library|save to library/i }).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      /historyGalleryShowingCount|loadingMoreHistory/
    );
    const assertVisibleTabLabelsFit = async (
      testId: string,
      expectedTabCount: number
    ) => {
      const tabList = page.getByTestId(testId);
      await expect(tabList).toBeVisible();
      await expect(tabList.getByRole("tab")).toHaveCount(expectedTabCount);
      const labelsFit = await tabList
        .locator("span")
        .evaluateAll((labels, expectedCount) => {
          const visibleLabels = labels.filter(label => {
            const style = window.getComputedStyle(label);
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              label.getClientRects().length > 0
            );
          });

          return (
            visibleLabels.length >= expectedCount &&
            visibleLabels.every(label => {
              const style = window.getComputedStyle(label);
              return (
                label.scrollWidth <= label.clientWidth + 1 &&
                style.textOverflow !== "ellipsis" &&
                !label.classList.contains("truncate")
              );
            })
          );
        }, expectedTabCount);
      expect(labelsFit).toBe(true);
    };
    await assertVisibleTabLabelsFit("media-studio-workspace-tabs", 5);
    await assertVisibleTabLabelsFit("media-studio-sidebar-tabs", 3);
    const mediaStudioTabA11yNames = [
      ...(await page
        .getByTestId("media-studio-workspace-tabs")
        .getByRole("tab")
        .evaluateAll(tabs =>
          tabs.map(tab => tab.getAttribute("aria-label") ?? tab.textContent ?? "")
        )),
      ...(await page
        .getByTestId("media-studio-sidebar-tabs")
        .getByRole("tab")
        .evaluateAll(tabs =>
          tabs.map(tab => tab.getAttribute("aria-label") ?? tab.textContent ?? "")
        )),
    ];
    expect(mediaStudioTabA11yNames).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Production/i),
        expect.stringMatching(/Video Shot/i),
        expect.stringMatching(/History Gallery|ประวัติ/i),
        expect.stringMatching(/Search Library|Library/i),
        expect.stringMatching(/Marketplace Images|รูป Marketplace/i),
      ])
    );
    await page.screenshot({
      path: join(evidenceDir, "route-mediastudio-390x844.png"),
      fullPage: true,
    });

    const mediaStudioAudit = await captureRouteAudit();
    const mediaStudioOverflow = mediaStudioAudit.overflow;

    await page.goto(
      `${BASE_URL}/media-history?source=marketplace_auto_review_hyperframes_render&type=video&productId=product_1&runId=mar_1`,
      { waitUntil: "domcontentloaded" }
    );
    const mediaHistorySourcePanel = page.getByTestId(
      "media-history-source-library-results"
    );
    await expect(mediaHistorySourcePanel).toBeVisible({ timeout: 30_000 });
    await expect(
      mediaHistorySourcePanel.getByText(
        /HyperFrames Marketplace Auto Review video/i
      )
    ).toBeVisible({ timeout: 30_000 });
    const mediaHistoryAudit = await captureRouteAudit();
    const mediaHistoryOverflow = mediaHistoryAudit.overflow;
    await page.screenshot({
      path: join(evidenceDir, "route-media-history-390x844.png"),
      fullPage: true,
    });

    await page.goto(
      `${BASE_URL}/media-history?type=video&productId=product_1&runId=mar_1`,
      { waitUntil: "domcontentloaded" }
    );
    const mediaHistoryProductRunPanel = page.getByTestId(
      "media-history-source-library-results"
    );
    await expect(mediaHistoryProductRunPanel).toBeVisible({ timeout: 30_000 });
    await expect(
      mediaHistoryProductRunPanel.getByText(
        /HyperFrames Marketplace Auto Review video/i
      )
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(
        /ไม่มี task history ที่ตรงกับบริบทนี้|No matching history tasks/i
      )
    ).toBeVisible({ timeout: 30_000 });
    const mediaHistoryProductRunAudit = await captureRouteAudit();
    const mediaHistoryProductRunOverflow = mediaHistoryProductRunAudit.overflow;
    await page.screenshot({
      path: join(evidenceDir, "route-media-history-product-run-390x844.png"),
      fullPage: true,
    });

    await mediaHistoryProductRunPanel
      .getByRole("button", {
        name: /เปิดใน Video Editor|Open in Video Editor/i,
      })
      .first()
      .click();
    await expect(page).toHaveURL(/\/video-editor\?libraryItemId=1/);

    await page.goto(
      `${BASE_URL}/document-management?source=marketplace_auto_review_hyperframes_render&productId=product_1&runId=mar_1`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page.locator("body")).toContainText(
      /Knowledge Vault|Library|คลัง|เอกสาร/i,
      { timeout: 30_000 }
    );
    await expect(
      page.getByText(/HyperFrames Marketplace Auto Review video/i).first()
    ).toBeVisible({ timeout: 30_000 });
    const documentManagementAudit = await captureRouteAudit();
    const documentManagementOverflow = documentManagementAudit.overflow;
    await page.screenshot({
      path: join(evidenceDir, "route-document-management-390x844.png"),
      fullPage: true,
    });

    await page.goto(`${BASE_URL}/video-editor?libraryItemId=1`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator(".video-editor-phase3")).toBeVisible({
      timeout: 30_000,
    });
    await expect
      .poll(
        () =>
          routeLog.filter(entry =>
            entry.procedures.includes("library.getItem")
          ).length,
        { timeout: 30_000 }
      )
      .toBeGreaterThan(0);
    const videoEditorDebug = await page.evaluate(() => ({
      href: window.location.href,
      search: window.location.search,
      timelineClipCount: document.querySelectorAll(".timeline-clip").length,
      timelineLabels: Array.from(document.querySelectorAll(".timeline-clip")).map(
        element => element.getAttribute("aria-label")
      ),
      notificationText: document
        .querySelector('[aria-label="Notifications alt+T"]')
        ?.textContent?.trim()
        .replace(/\s+/g, " ")
        .slice(0, 400),
    }));
    writeFileSync(
      join(evidenceDir, "route-video-editor-debug.json"),
      JSON.stringify(
        {
          routeLog: routeLog
            .filter(entry => entry.procedures.includes("library.getItem"))
            .slice(-5),
          videoEditorDebug,
        },
        null,
        2
      )
    );
    await expect(page.locator(".timeline-clip").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator(".timeline-clip").first()).toHaveAttribute(
      "aria-label",
      /video clip: final\.mp4/i
    );
    const videoEditorAudit = await captureRouteAudit();
    const videoEditorOverflow = videoEditorAudit.overflow;
    await page.screenshot({
      path: join(evidenceDir, "route-video-editor-390x844.png"),
      fullPage: true,
    });

    const routeAudits = {
      productDetail: productDetailAudit,
      storyboardReview: storyboardReviewAudit,
      mediaStudio: mediaStudioAudit,
      mediaHistory: mediaHistoryAudit,
      mediaHistoryProductRun: mediaHistoryProductRunAudit,
      documentManagement: documentManagementAudit,
      videoEditor: videoEditorAudit,
    };
    const auditEntries = Object.values(routeAudits);
    const overflowAudit = {
      overflowElementCount: auditEntries.reduce(
        (total, audit) => total + audit.overflowElementCount,
        0
      ),
      scrollableOverflowElementCount: auditEntries.reduce(
        (total, audit) => total + audit.scrollableOverflowElementCount,
        0
      ),
      interactiveScrollableOverflowElementCount: auditEntries.reduce(
        (total, audit) =>
          total + audit.interactiveScrollableOverflowElementCount,
        0
      ),
      scrollableInteractiveWithoutAriaLabelCount: auditEntries.reduce(
        (total, audit) =>
          total + audit.scrollableInteractiveWithoutAriaLabelCount,
        0
      ),
      overflowElements: auditEntries
        .flatMap(audit => audit.overflowElements)
        .slice(0, 30),
      scrollableOverflowElements: auditEntries
        .flatMap(audit => audit.scrollableOverflowElements)
        .slice(0, 30),
      interactiveScrollableOverflowElements: auditEntries
        .flatMap(audit => audit.interactiveScrollableOverflowElements)
        .slice(0, 30),
      scrollableInteractiveWithoutAriaLabels: auditEntries
        .flatMap(audit => audit.scrollableInteractiveWithoutAriaLabels)
        .slice(0, 30),
    };
    const overflow = videoEditorOverflow;
    const evidence = {
      generatedAt: new Date().toISOString(),
      routeLevel: true,
      authenticated: true,
      routes: [
        "/marketplace-capture/products/product_1",
        "/storyboard-review?hyperframesRenderJobId=hf_route_1&productId=product_1&runId=mar_1",
        "/media-studio",
        "/media-history?source=marketplace_auto_review_hyperframes_render&type=video&productId=product_1&runId=mar_1",
        "/media-history?type=video&productId=product_1&runId=mar_1",
        "/document-management?source=marketplace_auto_review_hyperframes_render&productId=product_1&runId=mar_1",
        "/video-editor?libraryItemId=1",
      ],
      screenshots: [
        "route-product-detail-390x844.png",
        "route-storyboard-review-390x844.png",
        "route-mediastudio-390x844.png",
        "route-media-history-390x844.png",
        "route-media-history-product-run-390x844.png",
        "route-document-management-390x844.png",
        "route-video-editor-390x844.png",
      ],
      overflow,
      overflowByRoute: {
        productDetail: productDetailOverflow,
        storyboardReview: storyboardReviewOverflow,
        mediaStudio: mediaStudioOverflow,
        mediaHistory: mediaHistoryOverflow,
        mediaHistoryProductRun: mediaHistoryProductRunOverflow,
        documentManagement: documentManagementOverflow,
        videoEditor: videoEditorOverflow,
      },
      overflowAuditByRoute: routeAudits,
      productDetailFirstViewport,
      overflowElementCount: overflowAudit.overflowElementCount,
      scrollableOverflowElementCount: overflowAudit.scrollableOverflowElementCount,
      interactiveScrollableOverflowElementCount:
        overflowAudit.interactiveScrollableOverflowElementCount,
      scrollableInteractiveWithoutAriaLabelCount:
        overflowAudit.scrollableInteractiveWithoutAriaLabelCount,
      overflowElements: overflowAudit.overflowElements,
      scrollableOverflowElements: overflowAudit.scrollableOverflowElements,
      interactiveScrollableOverflowElements:
        overflowAudit.interactiveScrollableOverflowElements,
      scrollableInteractiveWithoutAriaLabels:
        overflowAudit.scrollableInteractiveWithoutAriaLabels,
      consoleErrors,
      pageErrors,
    };
    writeFileSync(
      join(evidenceDir, "route-evidence.json"),
      JSON.stringify(evidence, null, 2)
    );
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    for (const routeOverflow of [
      productDetailOverflow,
      storyboardReviewOverflow,
      mediaStudioOverflow,
      mediaHistoryOverflow,
      mediaHistoryProductRunOverflow,
      documentManagementOverflow,
      videoEditorOverflow,
    ]) {
      expect(routeOverflow.scrollWidth).toBeLessThanOrEqual(
        routeOverflow.clientWidth + 1
      );
    }
    for (const routeAudit of Object.values(routeAudits)) {
      expect(routeAudit.overflowElementCount).toBe(0);
      expect(routeAudit.scrollableInteractiveWithoutAriaLabelCount).toBe(0);
      expect(routeAudit.overflowElements).toEqual([]);
      expect(routeAudit.scrollableInteractiveWithoutAriaLabels).toEqual([]);
    }
    expect(overflowAudit.overflowElementCount).toBe(0);
    expect(overflowAudit.scrollableInteractiveWithoutAriaLabelCount).toBe(0);
    expect(overflowAudit.overflowElements).toEqual([]);
    expect(overflowAudit.scrollableInteractiveWithoutAriaLabels).toEqual([]);
  });
});
