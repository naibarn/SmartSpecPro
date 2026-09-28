import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { conversations } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  createInferenceAssistantMessageOnce,
  findInferenceAssistantMessage,
} from "./chatService";

const enabled = process.env.RUN_INFERENCE_DB_TESTS === "true";

describe.skipIf(!enabled)("Spec 231 Chat message idempotency", () => {
  it("persists one assistant receipt and increments conversation totals once under concurrent retries", async () => {
    const idempotencyKey = `chat:${randomUUID()}`;
    const input = {
      tenantId: "tenant-1",
      userId: 1,
      idempotencyKey,
      message: {
        conversationId: 1,
        role: "assistant" as const,
        content: "durable answer",
        inputTokens: 13,
        outputTokens: 8,
        creditsUsed: "2.0000",
        modelUsed: "gpt-4o",
        traceId: "trace-spec231",
      },
    };

    const results = await Promise.all([
      createInferenceAssistantMessageOnce(input),
      createInferenceAssistantMessageOnce(input),
    ]);
    expect(results.filter(result => result.created)).toHaveLength(1);
    expect(results[0].message.id).toBe(results[1].message.id);

    const saved = await findInferenceAssistantMessage({
      tenantId: input.tenantId,
      userId: input.userId,
      idempotencyKey,
    });
    expect(saved).toMatchObject({
      id: results[0].message.id,
      conversationId: 1,
      content: "durable answer",
      inputTokens: 13,
      outputTokens: 8,
    });

    const [conversation] = await getDb()
      .select({ messageCount: conversations.messageCount, totalCreditsUsed: conversations.totalCreditsUsed })
      .from(conversations)
      .where(eq(conversations.id, 1));
    expect(Number(conversation.messageCount)).toBe(1);
    expect(Number(conversation.totalCreditsUsed)).toBe(2);
  });

  it("scopes an identical client key independently by tenant", async () => {
    const idempotencyKey = `chat:${randomUUID()}`;
    const first = await createInferenceAssistantMessageOnce({
      tenantId: "tenant-1",
      userId: 1,
      idempotencyKey,
      message: { conversationId: 1, role: "assistant", content: "tenant one" },
    });
    const second = await createInferenceAssistantMessageOnce({
      tenantId: "tenant-2",
      userId: 1,
      idempotencyKey,
      message: { conversationId: 2, role: "assistant", content: "tenant two" },
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(second.message.id).not.toBe(first.message.id);
  });
});
