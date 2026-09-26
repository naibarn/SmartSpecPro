import { expect, test, type Page } from "playwright/test";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

function trpcData(data: unknown) {
  return JSON.stringify({ result: { data: { json: data } } });
}

function procedureName(url: string): string {
  return new URL(url).pathname.replace(/^\/trpc\//, "").split(",")[0] ?? "";
}

async function mockWorkflowStudioRoutes(page: Page) {
  await page.route("**/trpc/**", async route => {
    const procedure = procedureName(route.request().url());
    const data =
      procedure === "auth.me"
        ? {
            id: 209,
            email: "workflow-studio-browser@smartspec.local",
            name: "Workflow Studio Browser",
            role: "user",
            currentTenantId: "tenant-workflow-studio",
            credits: 100,
          }
        : procedure === "workflowStudio.list" ||
            procedure === "workflowStudio.marketplace"
          ? []
          : procedure === "workflowStudio.createDraft"
            ? {
                id: "00000000-0000-4000-8000-000000000209",
                versionId: "00000000-0000-4000-8000-000000000210",
                draftRevision: 0,
                status: "draft",
              }
            : null;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: trpcData(data),
    });
  });
}

test.describe("Spec 209 Workflow Studio mockup flow", () => {
  for (const viewport of VIEWPORTS) {
    test(`Dashboard to builder, subflow, and run at ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.addInitScript(() => {
        localStorage.setItem("smartspec_locale", "en");
        localStorage.setItem("smartspec_locale_chosen", "true");
      });
      await mockWorkflowStudioRoutes(page);

      await page.goto("/dashboard");
      const dashboardWorkflowEntry = page
        .getByRole("button", { name: "Workflow Studio" })
        .first();
      await expect(dashboardWorkflowEntry).toBeVisible();
      await dashboardWorkflowEntry.click();
      await expect(page).toHaveURL(/\/studio\/workflow$/);

      await expect(page.getByTestId("workflow-studio-builder")).toBeVisible();
      await expect(page.getByText("Project Input")).toBeVisible();
      await expect(
        page.getByRole("complementary", { name: "Selected node inspector" })
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Workflow run and debug drawer" })
      ).toBeVisible();
      await page.screenshot({
        path: `/tmp/smartspec-workflow-studio-${viewport.name}-builder.png`,
        fullPage: true,
      });

      await page.getByRole("button", { name: "Subflow" }).first().click();
      await expect(
        page.getByRole("heading", { name: "Storyboard" })
      ).toBeVisible();
      await expect(page.getByText("Compatible sources")).toBeVisible();
      await page.screenshot({
        path: `/tmp/smartspec-workflow-studio-${viewport.name}-subflow.png`,
        fullPage: true,
      });

      await page.getByRole("button", { name: "Run" }).first().click();
      await expect(page).toHaveURL(/\/studio\/workflow\/run(?:\?.*)?$/);
      await expect(page.getByTestId("workflow-studio-run")).toBeVisible();
      await page.getByRole("button", { name: "Run workflow" }).click();
      await expect(page.getByRole("alert")).toContainText("Add a goal");
      await expect(
        page.getByText("Job admitted to canonical control plane")
      ).toHaveCount(0);

      await page.screenshot({
        path: `/tmp/smartspec-workflow-studio-${viewport.name}.png`,
        fullPage: true,
      });
    });
  }

  test("edits the graph with node, edge, preset, and handle interactions", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem("smartspec_locale", "en");
      localStorage.setItem("smartspec_locale_chosen", "true");
    });
    await mockWorkflowStudioRoutes(page);
    await page.goto("/studio/workflow");
    await expect(page.locator(".react-flow__edge")).toHaveCount(7);
    await expect(page.getByLabel("Zoom in").first()).toBeVisible();
    await expect(page.getByLabel("Zoom out").first()).toBeVisible();

    await page.locator('.react-flow__node[data-id="script-agent"]').click({
      force: true,
    });
    await page.keyboard.press("Delete");
    await expect(page.locator(".react-flow__node")).toHaveCount(6);
    await expect(page.locator(".react-flow__edge")).toHaveCount(5);

    await page.goto("/studio/workflow");
    await expect(page.locator(".react-flow__edge")).toHaveCount(7);
    await page.locator(".react-flow__edge-path").first().click({ force: true });
    await page.keyboard.press("Delete");
    await expect(page.locator(".react-flow__edge")).toHaveCount(6);

    await page.goto("/studio/workflow");
    const paletteAgent = page.getByRole("button", { name: "AI Agent", exact: true });
    await paletteAgent.click();
    await expect(page.locator(".react-flow__node")).toHaveCount(8);
    const edgeCountBeforeConnect = await page.locator(".react-flow__edge").count();
    const source = await page
      .locator('.react-flow__node[data-id="project-input"] .react-flow__handle.source')
      .boundingBox();
    const target = await page
      .locator('.react-flow__node[data-id="agent-8"] .react-flow__handle.target')
      .boundingBox();
    expect(source).not.toBeNull();
    expect(target).not.toBeNull();
    if (source && target) {
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
        steps: 12,
      });
      await page.mouse.up();
    }
    await expect(page.locator(".react-flow__edge")).toHaveCount(edgeCountBeforeConnect + 1);

    await page.goto("/studio/workflow");
    await page.waitForSelector('[data-testid="workflow-studio-builder"]');
    await expect(page.locator(".react-flow__node")).toHaveCount(7);
    const canvas = page.locator(".react-flow.workflow-studio-flow");
    const nodesBeforeDrop = await page.locator(".react-flow__node").count();
    await paletteAgent.dragTo(canvas, { targetPosition: { x: 300, y: 250 } });
    await expect(page.locator(".react-flow__node")).toHaveCount(nodesBeforeDrop + 1);
    await expect(page.getByRole("button", { name: "Resize Properties panel" })).toBeVisible();
  });
});
