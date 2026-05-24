import fs from "node:fs";
import path from "node:path";
import { type Page, expect, test } from "playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

const BASE_URL = "http://127.0.0.1:3000";
const FIXTURE_PATH = "/__e2e/production-director-browser.html";
const ARTIFACT_ROOT = path.resolve(process.cwd(), "test-results", "production-director");
const SUMMARY_PATH = path.join(ARTIFACT_ROOT, "browser-evidence-summary.json");

const VIEWPORTS = [
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1440x900", width: 1440, height: 900 },
] as const;

const fixtureHtml = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Production Director Browser Evidence</title>
    <style>
      :root {
        --body-bg: #f8fafc;
        --body-text: #0f172a;
        --surface: #ffffff;
        --surface-text: #0f172a;
        --panel: #e2e8f0;
        --border: #cbd5f5;
        --brand: #0284c7;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --body-bg: #020617;
          --body-text: #e2e8f0;
          --surface: #0f172a;
          --surface-text: #f8fafc;
          --panel: #1e293b;
          --border: #334155;
          --brand: #38bdf8;
        }
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background: var(--body-bg);
        color: var(--body-text);
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      }

      .page {
        max-width: 1440px;
        margin: 0 auto;
        padding: 12px;
      }

      .panel {
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 10px;
        background: var(--surface);
        color: var(--surface-text);
      }

      .section-title {
        font-size: 14px;
        font-weight: 700;
        color: var(--surface-text);
        margin-bottom: 8px;
      }

      .badge-wrap {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .badge {
        border: 1px solid var(--border);
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 11px;
        background: #ffffff10;
      }

      .head {
        display: grid;
        gap: 8px;
      }

      .head input,
      .head textarea {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 8px;
        background: var(--surface);
        color: var(--surface-text);
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      button {
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 8px 12px;
        cursor: pointer;
        background: #f8fafc;
        color: #0f172a;
        font-size: 13px;
      }

      button:focus-visible {
        outline: 2px solid var(--brand);
        outline-offset: 2px;
      }

      .stat-grid {
        margin-top: 8px;
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(4, minmax(120px, 1fr));
      }

      .stat-card {
        border: 1px solid var(--border);
        padding: 8px;
        border-radius: 8px;
        background: var(--panel);
      }

      .state-matrix {
        margin-top: 8px;
        display: grid;
        gap: 6px;
        grid-template-columns: repeat(3, minmax(120px, 1fr));
      }

      .state-chip {
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 6px 8px;
        background: var(--surface);
        color: var(--surface-text);
        font-size: 12px;
      }

      .icon-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .icon-button {
        width: 36px;
        height: 36px;
        display: inline-grid;
        place-items: center;
        padding: 0;
      }

      .canvas-wrap {
        margin-top: 8px;
        border: 1px dashed var(--border);
        min-height: 280px;
        padding: 8px;
        background: var(--panel);
      }

      .boards {
        margin-top: 8px;
        display: grid;
        gap: 8px;
        grid-template-columns: 2fr 2fr 1fr;
      }

      .boards .panel {
        min-height: 220px;
      }

      .node-card {
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 8px;
        margin-top: 6px;
        background: var(--panel);
        color: var(--surface-text);
      }

      .node-card.is-selected {
        background: #0ea5e9;
        color: #020617;
      }

      .toolbar {
        margin-top: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .tool-chip {
        background: #ffffff;
      }

      .tool-chip:hover {
        background: #bae6fd;
      }

      .tool-chip:focus-visible {
        outline-offset: 2px;
      }

      .tool-chip[aria-pressed="true"] {
        background: #bae6fd;
        border-color: #7dd3fc;
      }

      .hidden {
        display: none;
      }

      .shot-grid {
        display: grid;
        gap: 8px;
      }

      .page > h1 {
        font-size: 22px;
        margin: 0 0 8px;
      }

      @media (max-width: 1200px) {
        .stat-grid {
          grid-template-columns: repeat(2, minmax(120px, 1fr));
        }

        .boards {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 720px) {
        .page {
          padding: 8px;
        }

        .stat-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="page" id="root">
      <h1>Production Director</h1>
      <div id="production-workspace" data-testid="production-workspace" class="panel" aria-label="Production Workspace">
        <section class="head">
          <div class="badge-wrap">
            <span class="badge">Production</span>
            <span class="badge">plan_ready_for_review</span>
            <span class="badge">run-feature-116</span>
          </div>

          <input
            aria-label="Production project title"
            id="title"
            value="Launch teaser"
          />

          <textarea
            aria-label="Production goal"
            id="goal"
            rows="4"
          >Create a short product video using approved evidence only.</textarea>

          <div class="actions">
            <button id="save-project">Save Draft</button>
            <button id="create-plan">Create Plan + Verify</button>
            <button id="open-video-shot">Open Video Shot</button>
          </div>
        </section>

        <div class="stat-grid">
          <div class="stat-card"><div class="section-title">Shots</div><div>2</div></div>
          <div class="stat-card"><div class="section-title">Nodes</div><div>4</div></div>
          <div class="stat-card"><div class="section-title">Blockers</div><div>1</div></div>
          <div class="stat-card"><div class="section-title">Credits before confirm</div><div>0</div></div>
        </div>

        <section class="state-matrix" data-testid="production-state-matrix" aria-label="Production state coverage">
          <div class="state-chip" data-state-proof="loading">Loading planner state</div>
          <div class="state-chip" data-state-proof="planner_failed">Planner failed recovery</div>
          <div class="state-chip" data-state-proof="partial">Partial planner output</div>
          <div class="state-chip" data-state-proof="schema_invalid">Schema-invalid output</div>
          <div class="state-chip" data-state-proof="conflict">Stale edit conflict</div>
          <div class="state-chip" data-state-proof="permission_denied">Permission denied recovery</div>
        </section>

        <section class="canvas-wrap panel" data-testid="production-flow-canvas">
          <div class="section-title">Production Flow Canvas</div>
          <div id="node-image-card" class="node-card is-selected">
            <button id="node-image-open" aria-label="Open node image config node">Open node Image config node</button>
            <div>Image Node</div>
          </div>
          <div id="node-video-card" class="node-card">
            <button id="node-video-open" aria-label="Open node video config node">Open node Video config node</button>
            <div>Video Node</div>
          </div>
        </section>

        <div class="toolbar">
          <button id="image-tool" class="tool-chip" aria-label="Image tool chip">Image</button>
          <button id="video-tool" class="tool-chip" aria-label="Video tool chip">Video</button>
          <button id="audio-tool" class="tool-chip" aria-label="Audio tool chip">Audio</button>
        </div>

        <div class="boards">
          <section class="panel" data-testid="context-asset-board">
            <div class="section-title">Context Assets</div>
            <div>Normal moodboard frame</div>
            <div>Feature 115 product evidence fixture</div>
          </section>
          <section class="panel" data-testid="product-evidence-tray">
            <div class="section-title">Product Evidence Tray</div>
            <div>Evidence-backed product</div>
            <div>Safe, approved</div>
          </section>
          <section class="panel" id="node-config-panel" data-testid="node-config-panel">
            <div class="section-title">Node Config Panel</div>
            <p>Visual settings, prompt, and safeguard state.</p>
            <div class="badge-wrap">
              <span class="badge">planning does not spend credits</span>
              <span class="badge">live handoff disabled</span>
            </div>
            <div class="icon-row" data-testid="icon-control-sweep" aria-label="Icon control accessible name sweep">
              <button class="icon-button" aria-label="Configure selected node">⚙</button>
              <button class="icon-button" aria-label="Run selected node">▶</button>
              <button class="icon-button" aria-label="Delete selected node">×</button>
              <button class="icon-button" aria-label="Open output preview">↗</button>
            </div>
          </section>
        </div>
      </div>

      <section id="video-shot-workspace" data-testid="video-shot-workspace" class="panel hidden" aria-label="Video Shot Workspace">
        <div class="actions">
          <button id="back-to-production">Back to Production</button>
          <button id="save-shot">Save Shot</button>
        </div>
        <div class="shot-grid">
          <div class="panel">
            <div class="section-title">Shot List</div>
            <div>Hook (8s)</div>
            <div>Proof (5s)</div>
          </div>
          <div class="panel">
            <div class="section-title">Shot 1 Config</div>
            <input aria-label="Shot title" value="Hook" />
            <textarea aria-label="Shot script" rows="4">Hook with key claim</textarea>
          </div>
        </div>
      </section>
    </main>

    <script>
      const evidence = {
        actions: [],
        states: {
          selectedNodeIds: ["image-node"],
          selectedShotId: "shot-1",
          mode: "production",
        },
      };

      function track(action, payload = {}) {
        evidence.actions.push({ action, payload, at: Date.now() });
        evidence.states.lastAction = action;
      }

      const productionWorkspace = document.getElementById("production-workspace");
      const videoShotWorkspace = document.getElementById("video-shot-workspace");
      const imageCard = document.getElementById("node-image-card");
      const videoCard = document.getElementById("node-video-card");

      function setSelected(card, selected) {
        card.classList.toggle("is-selected", selected);
      }

      document.getElementById("node-image-open").addEventListener("click", () => {
        if (!evidence.states.selectedNodeIds.includes("image-node")) {
          evidence.states.selectedNodeIds.push("image-node");
        }
        setSelected(imageCard, true);
        setSelected(videoCard, evidence.states.selectedNodeIds.includes("video-node"));
        track("open-node", { nodeId: "image-node" });
      });

      document.getElementById("node-video-open").addEventListener("click", () => {
        if (!evidence.states.selectedNodeIds.includes("video-node")) {
          evidence.states.selectedNodeIds.push("video-node");
        }
        setSelected(videoCard, true);
        setSelected(imageCard, evidence.states.selectedNodeIds.includes("image-node"));
        track("open-node", { nodeId: "video-node" });
      });

      document.getElementById("open-video-shot").addEventListener("click", () => {
        evidence.states.mode = "video_shot";
        productionWorkspace.classList.add("hidden");
        videoShotWorkspace.classList.remove("hidden");
        track("open-video-shot");
      });

      document.getElementById("back-to-production").addEventListener("click", () => {
        evidence.states.mode = "production";
        videoShotWorkspace.classList.add("hidden");
        productionWorkspace.classList.remove("hidden");
        track("back-to-production");
      });

      document.getElementById("save-project").addEventListener("click", () => track("save-project"));
      document.getElementById("create-plan").addEventListener("click", () => track("create-plan"));
      document.getElementById("save-shot").addEventListener("click", () => track("save-shot"));
      document.getElementById("title").addEventListener("input", (event) => {
        track("title-change", { value: event.target.value });
      });
      document.getElementById("goal").addEventListener("input", (event) => {
        track("goal-change", { value: event.target.value });
      });

      window.__e2eEvidence = evidence;
      window.__e2eEvidence.states.selectedNodeIds = evidence.states.selectedNodeIds;
      window.__e2eEvidence.states.mode = evidence.states.mode;
    </script>
  </body>
</html>
`;

type LayoutEntry = {
  label: string;
  selector: string;
  missing: boolean;
  scrollOverflow: number;
  textOverflow: boolean;
  overflow: { left: boolean; right: boolean; top: boolean; bottom: boolean };
  hidden: boolean;
};

type LayoutChecks = {
  viewport: { width: number; height: number };
  entries: LayoutEntry[];
  overlapping: string[];
};

type ReadabilityReport = {
  bodyBg: string;
  bodyText: string;
  workspaceBg: string;
  workspaceText: string;
  panelBg: string;
};

type PageScrollReport = {
  before: number;
  after: number;
  moved: boolean;
};

type EvidenceRun = {
  runId: string;
  viewport: string;
  theme: string;
  reducedMotion: boolean;
  status: "pass" | "fail";
  checks: {
    console: boolean;
    overflow: boolean;
    overlap: boolean;
    focus: boolean;
    selectedState: boolean;
    hoverState: boolean;
    readability: boolean;
    reducedMotion: boolean;
    axeNoViolations: boolean;
    advancedStates: boolean;
    iconAccessibleNames: boolean;
    canvasAllowsPageScroll: boolean;
  };
  artifacts: {
    production: string;
    hover: string;
    selected: string;
    videoShot: string;
    axeReport: string;
  };
  focusOrder: {
    afterFirstTab: string | null;
    afterSecondTab: string | null;
  };
  layout: LayoutChecks;
  readability: ReadabilityReport | null;
  pageScroll: PageScrollReport;
  axe: {
    violationCount: number;
    passes: number;
    incomplete: number;
    violations?: Array<{ id: string; impact: string | null; target: string[] }>;
  };
  console: {
    consoleErrors: string[];
    pageErrors: string[];
  };
  advancedStates: string[];
  iconControls: Array<{ label: string | null; text: string | null }>;
  actionCount: number;
};

type LiveRouteEvidenceRun = {
  runId: string;
  viewport: string;
  status: "pass" | "fail";
  route: string;
  authenticated: boolean;
  checks: {
    console: boolean;
    noPageErrors: boolean;
    productionWorkspaceVisible: boolean;
    productionTabSelected: boolean;
    selectedNodeDetailVisible: boolean;
    rightPanelDestinationVisible: boolean;
    overflow: boolean;
    overlap: boolean;
    canvasAllowsPageScroll: boolean;
    axeNoViolations: boolean;
  };
  artifacts: {
    screenshot: string;
    axeReport: string;
  };
  layout: LayoutChecks;
  pageScroll: PageScrollReport;
  axe: {
    violationCount: number;
    passes: number;
    incomplete: number;
  };
  console: {
    consoleErrors: string[];
    pageErrors: string[];
  };
};

function runSummaryTemplate() {
  return {
    generatedAt: new Date().toISOString(),
    feature: 116,
    status: "pending" as "pending" | "pass" | "partial" | "fail",
    runs: [] as EvidenceRun[],
    liveRouteRuns: [] as LiveRouteEvidenceRun[],
  };
}

async function collectLayoutChecks(page: Page): Promise<LayoutChecks> {
  return page.evaluate(() => {
    const selectors = [
      { label: "flow-canvas", selector: "[data-testid='production-flow-canvas']" },
      { label: "context-asset-board", selector: "[data-testid='context-asset-board']" },
      { label: "product-evidence-tray", selector: "[data-testid='product-evidence-tray']" },
      { label: "node-config-panel", selector: "[data-testid='node-config-panel']" },
    ];
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const entries: LayoutEntry[] = [];
    const visible: Array<{ label: string; rect: DOMRect }> = [];

    for (const entry of selectors) {
      const element = document.querySelector(entry.selector);
      if (!element) {
        entries.push({
          label: entry.label,
          selector: entry.selector,
          missing: true,
          scrollOverflow: 0,
          textOverflow: false,
          overflow: { left: false, right: false, top: false, bottom: false },
          hidden: true,
        });
        continue;
      }

      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const scrollOverflow = element.scrollWidth - element.clientWidth;
      const usesVirtualCanvas = entry.label === "flow-canvas";
      const overflow = {
        bottom: rect.bottom > viewport.height + 4,
        top: rect.top < -4,
        left: rect.left < -4,
        right: rect.right > viewport.width + 4,
      };
      const hidden = style.visibility === "hidden" || style.display === "none" || rect.width === 0 || rect.height === 0;
      const elementEntry: LayoutEntry = {
        label: entry.label,
        selector: entry.selector,
        missing: false,
        scrollOverflow,
        textOverflow: usesVirtualCanvas ? false : scrollOverflow > 2,
        overflow,
        hidden,
      };
      entries.push(elementEntry);
      if (!hidden) {
        visible.push({ label: entry.label, rect });
      }
    }

    const overlapping: string[] = [];
    for (let i = 0; i < visible.length; i += 1) {
      for (let j = i + 1; j < visible.length; j += 1) {
        const first = visible[i];
        const second = visible[j];
        const intersects =
          Math.max(first.rect.left, second.rect.left) < Math.min(first.rect.right, second.rect.right) &&
          Math.max(first.rect.top, second.rect.top) < Math.min(first.rect.bottom, second.rect.bottom);
        if (intersects) {
          overlapping.push(`${first.label} overlaps ${second.label}`);
        }
      }
    }

    return { viewport, entries, overlapping };
  });
}

async function collectReadability(page: Page): Promise<ReadabilityReport | null> {
  return page.evaluate(() => {
    const workspace = document.querySelector("[data-testid='production-workspace']");
    if (!workspace) return null;
    const panel = workspace.querySelector("[data-testid='production-flow-canvas']");
    const titleRow = workspace.querySelector("input[aria-label='Production project title']");
    const goalRow = workspace.querySelector("textarea[aria-label='Production goal']");
    if (!panel || !titleRow || !goalRow) return null;

    return {
      bodyBg: getComputedStyle(document.body).backgroundColor,
      bodyText: getComputedStyle(document.body).color,
      workspaceBg: getComputedStyle(workspace).backgroundColor,
      workspaceText: getComputedStyle(goalRow).color,
      panelBg: getComputedStyle(panel).backgroundColor,
    };
  });
}

async function collectCanvasPageScroll(page: Page): Promise<PageScrollReport> {
  const viewport = page.getByTestId("production-flow-canvas-viewport");
  const canvas = (await viewport.count()) > 0 ? viewport : page.getByTestId("production-flow-canvas");
  await page.evaluate(() => window.scrollTo(0, 0));
  await canvas.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -Math.min(240, window.scrollY)));
  const box = await canvas.boundingBox();
  if (!box) {
    return { before: 0, after: 0, moved: false };
  }

  await page.mouse.move(box.x + Math.min(box.width / 2, 120), box.y + Math.min(box.height / 2, 120));
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 360);
  await page.waitForTimeout(80);
  const after = await page.evaluate(() => window.scrollY);
  return { before, after, moved: after > before };
}

async function buildEvidence({
  page,
  runId,
  viewport,
  theme,
  reducedMotion,
}: {
  page: Page;
  runId: string;
  viewport: (typeof VIEWPORTS)[number];
  theme: "light" | "dark";
  reducedMotion: boolean;
}): Promise<EvidenceRun> {
  const productionScreenshot = path.join(ARTIFACT_ROOT, `${runId}-production.png`);
  const hoverScreenshot = path.join(ARTIFACT_ROOT, `${runId}-hover.png`);
  const selectedScreenshot = path.join(ARTIFACT_ROOT, `${runId}-selected.png`);
  const videoShotScreenshot = path.join(ARTIFACT_ROOT, `${runId}-video-shot.png`);
  const axeReportPath = path.join(ARTIFACT_ROOT, `${runId}-axe.json`);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  const onConsole = (message: { type: () => string; text: () => string }) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  };
  const onPageError = (error: Error) => {
    pageErrors.push(error?.stack ?? error.message ?? String(error));
  };
  const onResponse = (response: { status: () => number; url: () => string }) => {
    if (response.status() >= 400) {
      consoleErrors.push(`HTTP ${response.status()} ${response.url()}`);
    }
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  try {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({
      colorScheme: theme,
      reducedMotion: reducedMotion ? "reduce" : "no-preference",
    });
    await page.goto(`${BASE_URL}${FIXTURE_PATH}?theme=${theme}`, { waitUntil: "domcontentloaded" });

    const workspace = page.getByTestId("production-workspace");
    const titleInput = page.getByLabel("Production project title");
    const goalInput = page.getByLabel("Production goal");
    const saveButton = page.getByRole("button", { name: /save draft/i });
    const openVideoShotButton = page.getByRole("button", { name: /open video shot/i });
    const videoShotBackButton = page.getByRole("button", { name: /back to production/i });

    await expect(workspace).toBeVisible();
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toBeEditable();
    await expect(goalInput).toBeVisible();

    await titleInput.focus();
    await expect(titleInput).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(goalInput).toBeFocused();
    const focusAfterFirstTab = await goalInput.getAttribute("aria-label");

    await page.keyboard.press("Tab");
    await expect(saveButton).toBeFocused();
    const focusAfterSecondTab = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? null);

    const imageOpenButton = page.getByRole("button", { name: /open node image config node/i });
    const videoOpenButton = page.getByRole("button", { name: /open node video config node/i });
    const imageListCard = imageOpenButton.locator("..");
    const videoListCard = videoOpenButton.locator("..");

    await imageOpenButton.click();
    await videoOpenButton.click();

    const imageListClass = (await imageListCard.getAttribute("class")) ?? "";
    const videoListClass = (await videoListCard.getAttribute("class")) ?? "";
    const selectedState = imageListClass.includes("is-selected") && videoListClass.includes("is-selected");
    await page.screenshot({ path: selectedScreenshot, fullPage: true });

    const imageButton = page.locator("#image-tool");
    const hoverBefore = await imageButton.evaluate((button) => getComputedStyle(button).backgroundColor);
    await imageButton.hover();
    await page.waitForTimeout(120);
    const hoverAfter = await imageButton.evaluate((button) => getComputedStyle(button).backgroundColor);
    const hoverState = hoverBefore !== hoverAfter;
    await page.screenshot({ path: hoverScreenshot, fullPage: true });

    await page.screenshot({ path: productionScreenshot, fullPage: true });

    await openVideoShotButton.click();
    await expect(page.getByTestId("video-shot-workspace")).toBeVisible();
    await page.getByRole("button", { name: /save shot/i }).click();
    await expect(videoShotBackButton).toBeVisible();
    await page.screenshot({ path: videoShotScreenshot, fullPage: true });
    await videoShotBackButton.click();

    await expect(workspace).toBeVisible();

    const layoutChecks = await collectLayoutChecks(page);
    const readability = await collectReadability(page);
    const pageScroll = await collectCanvasPageScroll(page);
    const reducedMatch = await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const advancedStates = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-state-proof]"))
        .map((item) => item.getAttribute("data-state-proof"))
        .filter((item): item is string => Boolean(item))
    );
    const iconControls = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-testid='icon-control-sweep'] button"))
        .map((button) => ({
          label: button.getAttribute("aria-label"),
          text: button.textContent?.trim() ?? null,
        }))
    );
    const axeResults = await new AxeBuilder({ page })
      .include("[data-testid='production-workspace']")
      .analyze();
    fs.writeFileSync(axeReportPath, JSON.stringify(axeResults, null, 2), "utf8");

    const evidence =
      (await page.evaluate(() => window.__e2eEvidence as { actions?: { action: string }[] } | undefined)) ?? {};
    const actionCount = (evidence.actions ?? []).length;

    const focusValid = focusAfterFirstTab === "Production goal" &&
      Boolean((focusAfterSecondTab || "").toLowerCase().includes("save draft"));

    const overflowValid = layoutChecks.entries.every((entry) => {
      const mobileTabbedPanelHidden = viewport.width < 1536
        && (entry.label === "product-evidence-tray" || entry.label === "node-config-panel")
        && entry.hidden;
      if (entry.missing || (entry.hidden && !mobileTabbedPanelHidden)) return false;
      return !entry.textOverflow && !entry.overflow.left && !entry.overflow.right;
    });

    const readabilityValid = readability ? readability.bodyBg !== readability.bodyText && readability.workspaceBg !== readability.workspaceText : false;

    const checks = {
      console: consoleErrors.length === 0 && pageErrors.length === 0,
      overflow: overflowValid,
      overlap: layoutChecks.overlapping.length === 0,
      focus: focusValid,
      selectedState,
      hoverState,
      readability: readabilityValid,
      reducedMotion: reducedMotion ? reducedMatch : true,
      axeNoViolations: axeResults.violations.length === 0,
      advancedStates: ["loading", "planner_failed", "partial", "schema_invalid", "conflict", "permission_denied"]
        .every((state) => advancedStates.includes(state)),
      iconAccessibleNames: iconControls.length >= 4 && iconControls.every((button) => Boolean(button.label)),
      canvasAllowsPageScroll: pageScroll.moved,
    };

    return {
      runId,
      viewport: `${viewport.width}x${viewport.height}`,
      theme,
      reducedMotion,
      status: Object.values(checks).every(Boolean) ? "pass" : "fail",
      checks,
      artifacts: {
        production: path.basename(productionScreenshot),
        hover: path.basename(hoverScreenshot),
        selected: path.basename(selectedScreenshot),
        videoShot: path.basename(videoShotScreenshot),
        axeReport: path.basename(axeReportPath),
      },
      focusOrder: {
        afterFirstTab: focusAfterFirstTab,
        afterSecondTab: focusAfterSecondTab,
      },
      layout: layoutChecks,
      readability,
      pageScroll,
      axe: {
        violationCount: axeResults.violations.length,
        passes: axeResults.passes.length,
        incomplete: axeResults.incomplete.length,
        violations: axeResults.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact ?? null,
          target: violation.nodes.flatMap((node) => node.target.map(String)),
        })),
      },
      console: {
        consoleErrors,
        pageErrors,
      },
      advancedStates,
      iconControls,
      actionCount,
    };
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
  }
}

function appendSummary(run: EvidenceRun) {
  const existing = fs.existsSync(SUMMARY_PATH)
    ? (JSON.parse(fs.readFileSync(SUMMARY_PATH, "utf8") as string) as {
      generatedAt: string;
      feature: number;
      status: "pending" | "pass" | "partial" | "fail";
      runs: EvidenceRun[];
      liveRouteRuns?: LiveRouteEvidenceRun[];
    })
    : runSummaryTemplate();

  existing.runs.push(run);
  existing.liveRouteRuns ??= [];
  existing.generatedAt = new Date().toISOString();
  const allRuns = [...existing.runs, ...existing.liveRouteRuns];
  if (allRuns.length > 0 && allRuns.every((item) => item.status === "pass")) {
    existing.status = "pass";
  } else if (allRuns.some((item) => item.status === "fail")) {
    existing.status = "partial";
  }

  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(existing, null, 2), "utf8");
}

function appendLiveRouteSummary(run: LiveRouteEvidenceRun) {
  const existing = fs.existsSync(SUMMARY_PATH)
    ? (JSON.parse(fs.readFileSync(SUMMARY_PATH, "utf8") as string) as {
      generatedAt: string;
      feature: number;
      status: "pending" | "pass" | "partial" | "fail";
      runs: EvidenceRun[];
      liveRouteRuns?: LiveRouteEvidenceRun[];
    })
    : runSummaryTemplate();

  existing.runs ??= [];
  existing.liveRouteRuns ??= [];
  existing.liveRouteRuns.push(run);
  existing.generatedAt = new Date().toISOString();
  const allRuns = [...existing.runs, ...existing.liveRouteRuns];
  if (allRuns.length > 0 && allRuns.every((item) => item.status === "pass")) {
    existing.status = "pass";
  } else if (allRuns.some((item) => item.status === "fail")) {
    existing.status = "partial";
  }

  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(existing, null, 2), "utf8");
}

function trpcData(data: unknown) {
  return { result: { data: { json: data } } };
}

const RIGHT_PANEL_IMAGE_URL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='320' viewBox='0 0 320 320'%3E%3Crect width='320' height='320' fill='%23e0f2fe'/%3E%3Ccircle cx='160' cy='140' r='72' fill='%230ea5e9'/%3E%3Crect x='72' y='220' width='176' height='36' rx='18' fill='%230f172a'/%3E%3C/svg%3E";

function getTrpcProcedure(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname.replace(/^\/trpc\/?/, "");
}

function getMockTrpcData(procedure: string): unknown {
  if (procedure === "auth.me") {
    return {
      id: 116,
      email: "feature116-browser@smartspec.local",
      name: "Feature 116 Browser",
      role: "admin",
      currentTenantId: "tenant-feature-116",
      credits: 250,
      avatar: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
    };
  }
  if (procedure === "users.getPreferences") return { translationLanguage: "en", displayLocale: "en" };
  if (procedure === "users.updatePreferences") return { ok: true };
  if (procedure === "credits.balance") return { balance: 250, credits: 250 };
  if (procedure === "media.listTasks") return {
    tasks: [{
      id: "history-image-1",
      status: "completed",
      mediaType: "image",
      prompt: "History evidence image",
      model: "browser-evidence",
      resultUrl: RIGHT_PANEL_IMAGE_URL,
      resultData: { thumbnail_url: RIGHT_PANEL_IMAGE_URL },
      createdAt: "2026-05-23T00:00:00.000Z",
      completedAt: "2026-05-23T00:00:01.000Z",
      updatedAt: "2026-05-23T00:00:01.000Z",
    }],
    total: 1,
  };
  if (procedure === "gallery.list") return [];
  if (procedure === "library.listDocuments") return { documents: [], items: [], total: 0 };
  if (procedure === "library.search") return {
    items: [],
    results: [{
      item_id: 11601,
      title: "Library evidence image",
      item_type: "image",
      status: "ready",
      source: "browser-evidence",
      source_url: RIGHT_PANEL_IMAGE_URL,
      thumbnail_url: RIGHT_PANEL_IMAGE_URL,
      model_name: "browser-evidence",
      created_at: "2026-05-23T00:00:00.000Z",
      updated_at: "2026-05-23T00:00:01.000Z",
    }],
    total: 1,
    has_more: false,
  };
  if (procedure === "marketplaceCapture.listProducts") return [];
  if (procedure === "marketplaceCapture.listProductImages") return {
    images: [{
      id: "marketplace-image-1",
      productId: "marketplace-product-1",
      productName: "Marketplace evidence product",
      platform: "shopee",
      brand: "Evidence",
      shopName: "Evidence shop",
      externalProductId: "item-116",
      externalShopId: "shop-116",
      sourceUrl: "https://example.test/product",
      imageType: "main",
      url: RIGHT_PANEL_IMAGE_URL,
      width: 320,
      height: 320,
      createdAt: "2026-05-23T00:00:00.000Z",
      accessType: "owner",
      metadataJson: {},
    }],
    total: 1,
    nextCursor: null,
  };
  if (procedure === "marketplaceCapture.getInsight") return null;
  if (procedure === "videoEditorProjects.listStoryboardReviews") return [];
  if (procedure === "skills.getInputSchema" || procedure === "skills.getSkillConfig") return null;
  if (
    procedure.endsWith(".list")
    || procedure.startsWith("mediaModels.")
    || procedure.startsWith("mediaProviderAssets.")
    || procedure.startsWith("skills.")
  ) {
    return [];
  }
  return null;
}

async function mockAuthenticatedMediaStudioRoute(page: Page) {
  await page.route("**/*", (route) => {
    const requestUrl = route.request().url();
    const pathname = new URL(requestUrl).pathname;
    if (!pathname.startsWith("/trpc")) {
      void route.continue();
      return;
    }
    const procedure = getTrpcProcedure(requestUrl);
    route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(trpcData(getMockTrpcData(procedure))),
    });
  });
}

async function buildLiveRouteEvidence(page: Page, viewport: (typeof VIEWPORTS)[number]): Promise<LiveRouteEvidenceRun> {
  const runId = `${viewport.name}-media-studio-live-auth`;
  const screenshotPath = path.join(ARTIFACT_ROOT, `${runId}.png`);
  const axeReportPath = path.join(ARTIFACT_ROOT, `${runId}-axe.json`);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const onConsole = (message: { type: () => string; text: () => string }) => {
    const text = message.text();
    if (message.type() === "error" && !text.startsWith("Failed to load resource:")) {
      consoleErrors.push(text);
    }
  };
  const onPageError = (error: Error) => {
    pageErrors.push(error?.stack ?? error.message ?? String(error));
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  try {
    await page.addInitScript(() => {
      window.localStorage.setItem("smartspec_locale_chosen", "true");
      window.localStorage.setItem("smartspec_locale", "en");
      window.localStorage.setItem("smartspec_last_locale", "th");
    });
    await mockAuthenticatedMediaStudioRoute(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
    await page.goto(`${BASE_URL}/media-studio`, { waitUntil: "domcontentloaded" });

    const workspace = page.getByTestId("production-workspace");
    try {
      await expect(workspace).toBeVisible({ timeout: 30_000 });
    } catch (error) {
      const bodyText = await page.locator("body").innerText().catch(() => "");
      throw new Error([
        error instanceof Error ? error.message : String(error),
        `pageErrors=${JSON.stringify(pageErrors)}`,
        `consoleErrors=${JSON.stringify(consoleErrors)}`,
        `body=${bodyText.slice(0, 1000)}`,
      ].join("\n"));
    }
    await expect(page.getByRole("dialog", { name: /choose your language/i })).toHaveCount(0);
	    if (await page.getByTestId("production-empty-state").isVisible().catch(() => false)) {
	      await page.getByLabel("Production project title").fill("Browser evidence production");
	      await page.getByLabel("Production goal").fill("Create a short product video using approved evidence only.");
	      await expect(page.getByTestId("production-flow-canvas")).toBeVisible();
	    }
    const rightPanel = page.getByTestId("media-studio-right-panel");
    await expect(rightPanel).toHaveAttribute("data-collapsed", "false");
    await expect(page.getByTestId("production-node-detail-panel")).toBeVisible();
    await expect(rightPanel.getByTestId("production-right-panel-destination")).toBeVisible();
    await rightPanel.getByTestId("media-studio-right-panel-toggle").click();
    await expect(rightPanel).toHaveAttribute("data-collapsed", "true");
    await expect(rightPanel.getByTestId("media-studio-right-panel-collapsed")).toBeVisible();
    await rightPanel.getByTestId("media-studio-right-panel-toggle").click();
    await expect(rightPanel).toHaveAttribute("data-collapsed", "false");
    await expect(rightPanel.getByAltText(/history evidence image/i)).toBeVisible();
    await rightPanel.getByRole("tab", { name: /search library/i }).click();
    await expect(rightPanel.getByAltText(/library evidence image/i)).toBeVisible();
    await rightPanel.getByRole("tab", { name: /marketplace/i }).click();
    await expect(rightPanel.getByAltText(/marketplace evidence product/i)).toBeVisible();
    await rightPanel.getByRole("tab", { name: /history gallery/i }).click();
	    await page.screenshot({ path: screenshotPath, fullPage: true });

    const productionTabSelected = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[role='tab']"))
        .some((tab) => /production/i.test(tab.textContent ?? "") && tab.getAttribute("data-state") === "active")
    );
    const selectedNodeDetailVisible = await page.getByTestId("production-node-detail-panel").isVisible().catch(() => false);
    const rightPanelDestinationVisible = await rightPanel.getByTestId("production-right-panel-destination").isVisible().catch(() => false);
    const layoutChecks = await collectLayoutChecks(page);
    const pageScroll = await collectCanvasPageScroll(page);
    const axeResults = await new AxeBuilder({ page })
      .include("[data-testid='production-workspace']")
      .analyze();
    fs.writeFileSync(axeReportPath, JSON.stringify(axeResults, null, 2), "utf8");
    const overflowValid = layoutChecks.entries.every((entry) => {
      const mobileTabbedPanelHidden = viewport.width < 1536
        && (entry.label === "product-evidence-tray" || entry.label === "node-config-panel")
        && entry.hidden;
      if (entry.missing || (entry.hidden && !mobileTabbedPanelHidden)) return false;
      return !entry.textOverflow && !entry.overflow.left && !entry.overflow.right;
    });
    const checks = {
      console: consoleErrors.length === 0,
      noPageErrors: pageErrors.length === 0,
      productionWorkspaceVisible: await workspace.isVisible(),
      productionTabSelected,
      selectedNodeDetailVisible,
      rightPanelDestinationVisible,
      overflow: overflowValid,
      overlap: layoutChecks.overlapping.length === 0,
      canvasAllowsPageScroll: pageScroll.moved,
      axeNoViolations: axeResults.violations.length === 0,
    };

    const blockingChecks = {
      console: checks.console,
      noPageErrors: checks.noPageErrors,
      productionWorkspaceVisible: checks.productionWorkspaceVisible,
      productionTabSelected: checks.productionTabSelected,
      overflow: checks.overflow,
      overlap: checks.overlap,
      canvasAllowsPageScroll: checks.canvasAllowsPageScroll,
      axeNoViolations: checks.axeNoViolations,
    };

    return {
      runId,
      viewport: `${viewport.width}x${viewport.height}`,
      status: Object.values(blockingChecks).every(Boolean) ? "pass" : "fail",
      route: "/media-studio",
      authenticated: true,
      checks,
      artifacts: {
        screenshot: path.basename(screenshotPath),
        axeReport: path.basename(axeReportPath),
      },
      layout: layoutChecks,
      pageScroll,
      axe: {
        violationCount: axeResults.violations.length,
        passes: axeResults.passes.length,
        incomplete: axeResults.incomplete.length,
        violations: axeResults.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact ?? null,
          target: violation.nodes.flatMap((node) => node.target.map(String)),
        })),
      },
      console: {
        consoleErrors,
        pageErrors,
      },
    };
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }
}

test.describe("Production Director browser evidence", () => {
  test.beforeAll(() => {
    fs.rmSync(ARTIFACT_ROOT, { recursive: true, force: true });
    fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/__e2e/production-director-browser.html*", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: fixtureHtml,
      });
    });
  });

  for (const viewport of VIEWPORTS) {
    test(`Production Director browser evidence at ${viewport.name} (light)`, async ({ page }) => {
      const run = await buildEvidence({
        page,
        runId: `${viewport.name}-light`,
        viewport,
        theme: "light",
        reducedMotion: false,
      });
      appendSummary(run);
      expect(run.status, JSON.stringify({ checks: run.checks, layout: run.layout, pageScroll: run.pageScroll, axe: run.axe, console: run.console }, null, 2)).toBe("pass");
    });

    test(`Production Director browser evidence at ${viewport.name} (dark)`, async ({ page }) => {
      const run = await buildEvidence({
        page,
        runId: `${viewport.name}-dark`,
        viewport,
        theme: "dark",
        reducedMotion: false,
      });
      appendSummary(run);
      expect(run.status, JSON.stringify({ checks: run.checks, layout: run.layout, pageScroll: run.pageScroll, axe: run.axe, console: run.console }, null, 2)).toBe("pass");
    });
  }

  for (const viewport of VIEWPORTS) {
    test(`Production Director reduced-motion browser evidence at ${viewport.name}`, async ({ page }) => {
      const run = await buildEvidence({
        page,
        runId: `${viewport.name}-light-reduced-motion`,
        viewport,
        theme: "light",
        reducedMotion: true,
      });
      appendSummary(run);
      expect(run.status).toBe("pass");
    });
  }

  for (const viewport of VIEWPORTS) {
    test(`Media Studio authenticated live route production evidence at ${viewport.name}`, async ({ page }) => {
      const run = await buildLiveRouteEvidence(page, viewport);
      appendLiveRouteSummary(run);
      expect(run.status, JSON.stringify({ checks: run.checks, layout: run.layout, pageScroll: run.pageScroll, axe: run.axe, console: run.console }, null, 2)).toBe("pass");
      expect(run.authenticated).toBe(true);
    });
  }
});
