import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { COOKIE_NAME } from "../../shared/const";

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
] as const;

async function authenticate(page: Page) {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("PLAYWRIGHT_BASE_URL_REQUIRED");
  const tokenPath = process.env.FULL_APP_SESSION_TOKEN_FILE;
  if (!tokenPath) throw new Error("FULL_APP_SESSION_TOKEN_FILE_REQUIRED");
  const token = readFileSync(tokenPath, "utf8").trim();
  await page.addInitScript(() => {
    localStorage.setItem("smartspec_locale", "en");
    localStorage.setItem("smartspec_locale_chosen", "true");
  });
  await page.context().addCookies([{ name: COOKIE_NAME, value: token, url: baseURL }]);
}

for (const viewport of viewports) {
  test(`Research Notes create, edit, background request, and archive on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await authenticate(page);
    await page.goto("/apps/research-notes");
    await expect(page.getByRole("heading", { name: "Research Notes" })).toBeVisible();

    await page.getByRole("button", { name: "Create first note" }).click();
    const runId = crypto.randomUUID();
    const initialTitle = `Browser ${viewport.name} ${runId}`;
    await page.getByRole("textbox", { name: "Note title" }).fill(initialTitle);
    await page.getByRole("textbox", { name: "Research note" }).fill("A source observation for browser acceptance.");
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByRole("button", { name: initialTitle })).toBeVisible();

    await page.getByRole("textbox", { name: "Search notes" }).fill("source observation");
    await expect(page.getByRole("button", { name: initialTitle })).toBeVisible();
    await page.getByRole("textbox", { name: "Search notes" }).fill("no matching result");
    await expect(page.getByText("No matching notes")).toBeVisible();
    await page.getByRole("textbox", { name: "Search notes" }).fill("");

    await page.getByRole("button", { name: "Summarize with AI" }).click();
    await expect(page.getByText("Summarizing this note in the background…")).toBeVisible();

    const updatedTitle = `${initialTitle} edited`;
    await page.getByRole("textbox", { name: "Note title" }).fill(updatedTitle);
    await page.getByRole("textbox", { name: "Research note" }).fill("Updated source observation for browser acceptance.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("button", { name: updatedTitle })).toBeVisible();

    await page.getByRole("button", { name: "Archive note" }).click();
    await expect(page.getByRole("button", { name: updatedTitle })).toHaveCount(0);
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(horizontalOverflow, `${viewport.name} layout should not overflow horizontally`).toBe(false);
  });
}

test("unauthenticated visitors are redirected to login", async ({ page }) => {
  await page.goto("/apps/research-notes");
  await expect(page).toHaveURL(/\/login$/);
});

test("the Mini App shows its loading state while app identity is resolving", async ({ page }) => {
  await authenticate(page);
  let releaseResolver!: () => void;
  const resolverGate = new Promise<void>(resolve => { releaseResolver = resolve; });
  await page.route("**/trpc/appIdentity.resolvePublicApp**", route =>
    resolverGate.then(() => route.continue())
  );
  const navigation = page.goto("/apps/research-notes");
  await expect(page.getByTestId("app-page-default-skeleton")).toBeVisible();
  releaseResolver();
  await navigation;
  await expect(page.getByRole("heading", { name: "Research Notes" })).toBeVisible();
});

test("users can create and switch project context", async ({ page }) => {
  await authenticate(page);
  await page.goto("/apps/research-notes");
  await expect(page.getByRole("heading", { name: "Research Notes" })).toBeVisible();
  await page.getByRole("button", { name: "New project" }).click();
  const secondProject = `Browser project ${crypto.randomUUID()}`;
  await page.getByRole("textbox", { name: "Project name" }).fill(secondProject);
  await page.getByRole("button", { name: "Create project" }).click();
  const selector = page.getByRole("combobox", { name: "Project" });
  await expect(selector).toContainText(secondProject);
  await selector.click();
  await page.getByRole("option", { name: "Synthetic Runtime Project" }).click();
  await expect(selector).toContainText("Synthetic Runtime Project");
});

test("app resolution errors render a recoverable unavailable state", async ({ page }) => {
  await authenticate(page);
  await page.route("**/trpc/appIdentity.resolvePublicApp**", route => route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ error: { json: { message: "Synthetic unavailable", code: -32603,
      data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500, path: "appIdentity.resolvePublicApp" } } } }),
  }));
  await page.goto("/apps/research-notes");
  await expect(page.getByText("This App is unavailable")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("revoked project membership denies the authenticated browser session", async ({ page }) => {
  await authenticate(page);
  await page.goto("/apps/research-notes");
  await expect(page.getByRole("heading", { name: "Research Notes" })).toBeVisible();
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    await sql`UPDATE canonical_project_memberships SET lifecycle = 'REVOKED', revoked_at = now()
      WHERE tenant_id = 'miniapp-runtime-tenant' AND project_id = 'miniapp-runtime-project'
        AND principal_id = 'user:1'`;
    const responseStatus = await page.evaluate(async () => {
      const input = encodeURIComponent(JSON.stringify({ json: {
        appId: "app_research_notes", projectId: "miniapp-runtime-project",
      } }));
      const response = await fetch(`/trpc/researchNotes.listNotes?input=${input}`, { credentials: "include" });
      return response.status;
    });
    expect(responseStatus).toBeGreaterThanOrEqual(400);
  } finally {
    await sql`UPDATE canonical_project_memberships SET lifecycle = 'ACTIVE', revoked_at = NULL
      WHERE tenant_id = 'miniapp-runtime-tenant' AND project_id = 'miniapp-runtime-project'
        AND principal_id = 'user:1'`;
    await sql.end();
  }
});
