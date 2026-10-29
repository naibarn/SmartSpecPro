import { expect, test } from "./authenticated.fixture";

test("failed transcript loads stay visibly recoverable instead of looking like a new chat", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("smartspec_locale", "en");
    localStorage.setItem("smartspec_locale_chosen", "true");
  });

  let transcriptRequests = 0;
  await page.route("**/trpc/chat.getMessages*", async route => {
    transcriptRequests += 1;
    await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
  });

  await page.goto("/chat");
  await page
    .getByTestId("chat-primary-content")
    .getByRole("button", { name: "Start New Chat" })
    .click();

  const failure = page.getByRole("alert");
  await expect(failure).toContainText("This conversation could not be loaded");
  await expect(failure.getByRole("button", { name: "Retry loading messages" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start a conversation" })).toHaveCount(0);

  await failure.getByRole("button", { name: "Retry loading messages" }).click();
  await expect.poll(() => transcriptRequests).toBeGreaterThanOrEqual(2);
  await expect(failure).toContainText("This conversation could not be loaded");
});
