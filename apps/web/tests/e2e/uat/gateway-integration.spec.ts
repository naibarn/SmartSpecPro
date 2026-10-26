import {
  getUatCreditSnapshot,
  UAT_PRIMARY_TENANT_ID,
} from "../../../server/services/uatSessionBroker";
import { expect, test } from "./authenticated.fixture";
import type { TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test.describe.configure({ retries: 0 });
test.use({ uatRole: "member" });

test("authenticated UI request traverses the SmartAIHub Gateway and records scoped provider usage", async ({ page }, testInfo: TestInfo) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  const before = await getUatCreditSnapshot("member");
  const modelsResponse = await page.evaluate(async () => {
    const response = await fetch("/api/v1/models");
    return { status: response.status, body: await response.json() };
  });
  expect(modelsResponse.status, "Gateway model discovery status").toBe(200);
  const modelsBody = modelsResponse.body;
  const models = Array.isArray(modelsBody?.data) ? modelsBody.data : [];
  const requestedModel = process.env.SMARTSPEC_UAT_GATEWAY_MODEL;
  const model = requestedModel || models.find((candidate: any) => typeof candidate?.id === "string")?.id;
  expect(model, "a Gateway-authorized model is available").toBeTruthy();

  const providerResponse = await page.evaluate(async ({ model }) => {
    const response = await fetch("/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with the exact text UAT_OK." }],
      temperature: 0,
      max_tokens: 16,
      stream: false,
      }),
    });
    return { status: response.status, body: await response.json() };
  }, { model });
  expect(providerResponse.status, "Gateway completion status").toBe(200);
  const result = providerResponse.body;
  expect(result?.choices?.[0]?.message?.content).toBeTruthy();
  expect(result?.usage?.total_tokens).toBeGreaterThan(0);

  const after = await getUatCreditSnapshot("member");
  expect(after.userId).toBe(before.userId);
  expect(after.balance).toBeLessThanOrEqual(before.balance);
  const usageTransactions = after.usage.filter((transaction) =>
    transaction.createdAt.getTime() >= Date.now() - 5 * 60_000 &&
    transaction.tenantId === UAT_PRIMARY_TENANT_ID &&
    transaction.amount < 0,
  );
  expect(usageTransactions.length, "usage is recorded against the authenticated test tenant").toBeGreaterThan(0);
  const usageMetadata = usageTransactions[0]?.metadata as Record<string, unknown> | undefined;
  expect(usageMetadata?.provider, "Gateway provider is recorded").toEqual(expect.any(String));
  expect(Number(usageMetadata?.costUsd), "provider-reported usage cost is recorded").toBeGreaterThan(0);
  expect(Number(usageMetadata?.tokensUsed), "provider token usage is recorded").toBeGreaterThan(0);
  const receiptPath = testInfo.outputPath("gateway-integration-receipt.json");
  await writeFile(receiptPath, JSON.stringify({
      browserOrigin: new URL(page.url()).origin,
      browserRoute: "/api/v1/chat/completions",
      gatewayRoute: "SmartAIHub Gateway",
      provider: usageMetadata?.provider,
      model: usageMetadata?.model,
      providerCostUsd: usageMetadata?.costUsd,
      tokensUsed: usageMetadata?.tokensUsed,
      tenantId: UAT_PRIMARY_TENANT_ID,
      outcome: "passed",
    }, null, 2), { mode: 0o600 });
  await testInfo.attach("gateway-integration-receipt", {
    path: receiptPath,
    contentType: "application/json",
  });
});
