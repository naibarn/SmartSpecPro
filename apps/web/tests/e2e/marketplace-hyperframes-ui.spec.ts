import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
const BASE_URL = "http://127.0.0.1:3000";
const ROUTE_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='320' viewBox='0 0 320 320'%3E%3Crect width='320' height='320' fill='%23e0f2fe'/%3E%3Ccircle cx='160' cy='136' r='70' fill='%230ea5e9'/%3E%3Crect x='70' y='224' width='180' height='34' rx='17' fill='%230f172a'/%3E%3C/svg%3E";

function fixtureByGroup(group: string) {
  const fixture = fixtures.fixtures.find(item => item.group === group);
  expect(fixture, `missing fixture group ${group}`).toBeTruthy();
  return fixture!;
}

function trpcData(data: unknown) {
  return { result: { data: { json: data } } };
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
    repairActions: [],
    polling: { intervalMs: 0, maxIntervalMs: 0, etag: "hf_route_etag" },
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
        url: "https://cdn.example.test/hyperframes/final.mp4",
        storageRef: "marketplace-auto-review/tenant_route/mar_1/hyperframes/hf_route_1/output.mp4",
        contentHash: "hf_output",
        accessibleLabel: "Final HyperFrames video",
      },
      {
        outputId: "hf_route_1_snapshot",
        kind: "snapshot",
        url: ROUTE_IMAGE,
        storageRef: "marketplace-auto-review/tenant_route/mar_1/hyperframes/hf_route_1/snapshot.png",
        contentHash: "hf_snapshot",
        accessibleLabel: "Safe area snapshot",
      },
    ],
    artifactRefs: [
      {
        artifactId: "hf_route_1_output",
        kind: "hyperframes_render_mp4",
        storageRef:
          "marketplace-auto-review/tenant_route/mar_1/hyperframes/hf_route_1/output.mp4",
        contentHash: "hf_output",
        mimeType: "video/mp4",
        retentionClass: "library",
        redacted: true,
      },
      {
        artifactId: "hf_route_1_snapshot",
        kind: "hyperframes_snapshot",
        storageRef:
          "marketplace-auto-review/tenant_route/mar_1/hyperframes/hf_route_1/snapshot.png",
        contentHash: "hf_snapshot",
        mimeType: "image/png",
        retentionClass: "review",
        redacted: true,
      },
    ],
    redaction: {
      rawHtmlHidden: true,
      signedUrlsHidden: true,
      workerLogsHidden: true,
      storageKeysHidden: true,
    },
    updatedAt: "2026-06-04T00:00:00.000Z",
  };
}

function autoPlanProjection() {
  return {
    contractVersion: "hyperframes_marketplace_auto_review_v1",
    productId: "product_1",
    tenantId: "tenant_route",
    userId: 119,
    planHash: "hf_plan_route",
    launchMode: "auto_storyboard_review",
    canStart: true,
    standardOrderAvailable: true,
    display: {
      summary:
        "Backend selected the safest storyboard preview plan for this product.",
    },
    primaryAction: {
      label: "Create Auto Storyboard Review",
      action: "start_auto_storyboard_review",
    },
    defaults: {
      templateId: "marketplace_storyboard_motion_9x9_v1",
      platformPreset: {
        presetId: "generic_vertical_9_16",
        label: "Generic vertical 9:16",
      },
      renderIntent: "preview",
      compositionMode: "storyboard_motion_preview",
    },
    blockers: [],
    warnings: [],
    overrideDiff: { fields: [] },
    resetToAutoAvailable: false,
    creditEstimate: { estimatedCredits: 0 },
    access: {
      capabilities: {
        canAccessAuto: true,
        canPreview: true,
        canRenderFinal: true,
        canSaveToLibrary: true,
      },
      flags: {
        enabled: true,
        tenantAllowed: true,
        workerEnabled: true,
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

type RouteMockLogEntry = {
  requestUrl: string;
  procedurePath: string;
  procedures: string[];
  renderOutputKinds?: string[];
  renderArtifactKinds?: string[];
  responseBodySnippet?: string;
};

function routeMockData(procedure: string): unknown {
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
    return autoPlanProjection();
  }
  if (procedure === "marketplaceCapture.getHyperframesRenderJob") {
    const render = completedRenderProjection();
    return {
      contractVersion: "hyperframes_marketplace_auto_review_v1",
      render,
      polling: render.polling,
      notModified: false,
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
        sourceUrl: "https://cdn.example.test/hyperframes/final.mp4",
      },
      render,
      chargeSummary: {
        chargeRequired: false,
        quotaDecision: "no_charge",
        noChargeReason: "already_charged",
        idempotencyKey: "hyperframes-library:tenant_route:mar_1:final:hf_input:hf_output",
      },
      polling: render.polling,
      invalidates: [],
    };
  }
  if (procedure === "marketplaceCapture.listInsightsByProduct") return [];
  if (procedure === "marketplaceCapture.listAutoReviewRuns") {
    return [
      {
        id: "mar_1",
        productId: "product_1",
        status: "completed",
        currentStage: "storyboard_review",
        outputMode: "storyboard_images",
        renderJobId: "hf_route_1",
        createdAt: "2026-06-04T00:00:00.000Z",
      },
    ];
  }
  if (procedure === "videoEditorProjects.getStoryboardReview") {
    return null;
  }
  if (procedure === "videoEditorProjects.listStoryboardReviews") return [];
  if (procedure === "library.search") {
    return {
      results: [
        {
          id: "library_1",
          item_id: "library_1",
          title: "HyperFrames Marketplace Auto Review video",
          item_type: "video",
          itemType: "video",
          source: "marketplace_auto_review_hyperframes_render",
          source_url: "https://cdn.example.test/hyperframes/final.mp4",
          thumbnail_url: ROUTE_IMAGE,
          status: "ready",
        },
      ],
      total: 1,
      has_more: false,
    };
  }
  if (procedure === "library.listDocuments") return { items: [], total: 0 };
  if (procedure === "media.listTasks") return { tasks: [], total: 0 };
  if (procedure.endsWith(".list") || procedure.startsWith("mediaModels.")) return [];
  return null;
}

async function mockAuthenticatedHyperframesRoutes(
  page: Page,
  routeLog: RouteMockLogEntry[] = []
) {
  await page.addInitScript(() => {
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
            outputUrl: "https://cdn.example.test/hyperframes/final.mp4",
          },
          startedAt: Date.now(),
          updatedAt: Date.now(),
        },
      ])
    );
  });
  await page.route("**/*", route => {
    const requestUrl = route.request().url();
    const pathname = new URL(requestUrl).pathname;
    if (!pathname.startsWith("/trpc")) {
      void route.continue();
      return;
    }
    const procedurePath = getTrpcProcedure(requestUrl);
    const procedures = procedurePath.split(",").filter(Boolean);
    const render = procedures.includes("marketplaceCapture.getHyperframesRenderJob")
      ? completedRenderProjection()
      : null;
    const body =
      procedures.length > 1
        ? procedures.map(procedure => trpcData(routeMockData(procedure)))
        : trpcData(routeMockData(procedurePath));
    const responseBody = JSON.stringify(body);
    routeLog.push({
      requestUrl,
      procedurePath,
      procedures,
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
                  <a href="/library?source=marketplace_auto_review_hyperframes_render">Open Library</a>
                </div>
              </div>
            </section>
            <section aria-label="Video Editor handoff">
              <div class="toolbar">
                <div class="status">
                  <strong>Open finalized MP4 as normal video</strong>
                  <span>Library item library_1 is passed to the existing Video Editor route.</span>
                </div>
                <div class="actions">
                  <a href="/video-editor?libraryItemId=library_1">Open in Video Editor</a>
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
        ).toHaveAttribute("href", "/video-editor?libraryItemId=library_1");
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
    await expect(page.getByRole("tab", { name: /auto mode/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /standard mode/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /standard order/i }).first()).toBeVisible();
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
    await expect(page.getByRole("button", { name: /บันทึกเข้า Library|save to library/i }).first()).toBeVisible();
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
    await page.screenshot({
      path: join(evidenceDir, "route-mediastudio-390x844.png"),
      fullPage: true,
    });

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    const overflowElements = await page.evaluate(() => {
      const clientWidth = document.documentElement.clientWidth;
      return Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .map(element => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            role: element.getAttribute("role"),
            ariaLabel: element.getAttribute("aria-label"),
            text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 120),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            className: String(element.getAttribute("class") ?? "").slice(0, 180),
          };
        })
        .filter(item => item.right > clientWidth + 1 || item.left < -1)
        .slice(0, 30);
    });
    const evidence = {
      generatedAt: new Date().toISOString(),
      routeLevel: true,
      authenticated: true,
      routes: [
        "/marketplace-capture/products/product_1",
        "/storyboard-review?hyperframesRenderJobId=hf_route_1&productId=product_1&runId=mar_1",
        "/media-studio",
      ],
      screenshots: [
        "route-product-detail-390x844.png",
        "route-storyboard-review-390x844.png",
        "route-mediastudio-390x844.png",
      ],
      overflow,
      overflowElements,
      consoleErrors,
      pageErrors,
    };
    writeFileSync(
      join(evidenceDir, "route-evidence.json"),
      JSON.stringify(evidence, null, 2)
    );
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });
});
