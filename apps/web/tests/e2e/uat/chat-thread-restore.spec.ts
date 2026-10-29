import { expect, test } from "./authenticated.fixture";

type TrpcEnvelope<T> = { result?: { data?: { json?: T } } };

async function mutate<T>(
  page: import("@playwright/test").Page,
  procedure: string,
  input: unknown
): Promise<T> {
  const response = await page.request.post(`/trpc/${procedure}`, {
    headers: { "content-type": "application/json" },
    data: { json: input },
  });
  const body = (await response.json()) as TrpcEnvelope<T>;
  expect(response.status(), `${procedure} should succeed`).toBe(200);
  const result = body.result?.data?.json;
  expect(result, `${procedure} should return data`).toBeTruthy();
  return result as T;
}

test("reopening a saved child thread restores its own transcript after reload", async ({
  page,
}) => {
  const marker = `Persisted thread transcript ${crypto.randomUUID()}`;
  const title = `Thread restore acceptance ${crypto.randomUUID()}`;
  let conversationId: number | null = null;

  try {
    await page.addInitScript(() => {
      localStorage.setItem("smartspec_locale", "en");
      localStorage.setItem("smartspec_locale_chosen", "true");
    });
    const conversation = await mutate<{ id: number }>(
      page,
      "chat.createConversation",
      {
        title,
      }
    );
    conversationId = conversation.id;
    const thread = await mutate<{ thread: { threadId: string } }>(
      page,
      "chat.createConversationThread",
      {
        conversationId,
        title: "Restore acceptance thread",
        idempotencyKey: `thread-restore-${crypto.randomUUID()}`,
      }
    );
    await mutate(page, "chat.saveAssistantMessage", {
      conversationId,
      threadId: thread.thread.threadId,
      content: marker,
    });

    const threadUrl = `/chat?c=${conversationId}&t=${encodeURIComponent(thread.thread.threadId)}`;
    await page.goto(threadUrl);
    await expect(page.getByText(marker, { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    await page.reload();
    await expect(page).toHaveURL(
      new RegExp(`/chat\\?c=${conversationId}\\&t=${thread.thread.threadId}`)
    );
    await expect(page.getByText(marker, { exact: true })).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    if (conversationId !== null) {
      await mutate(page, "chat.permanentlyDeleteConversation", {
        id: conversationId,
      });
    }
  }
});
