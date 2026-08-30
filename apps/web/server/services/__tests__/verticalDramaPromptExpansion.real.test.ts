import "dotenv/config";
import { describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { creditTransactions } from "../../../drizzle/schema";
import { getDb } from "../../db";
import {
  runRealPromptExpansion,
  savePromptExpansionPreview,
} from "../verticalDramaPromptExpansionService";

/**
 * Paid integration gate. This file deliberately contains no provider mock and
 * no fallback assertion: when enabled it exercises the real DB -> skill bundle
 * -> configured provider -> schema gate -> credit settlement -> preview path.
 *
 * Run only with an explicitly authorized test user/tenant:
 * VERTICAL_DRAMA_PROMPT_EXPANSION_REAL_LLM_GATE=1
 * VERTICAL_DRAMA_PROMPT_EXPANSION_REAL_LLM_USER_ID=1
 * VERTICAL_DRAMA_PROMPT_EXPANSION_REAL_LLM_TENANT_ID=tenant-...
 */
const enabled = process.env.VERTICAL_DRAMA_PROMPT_EXPANSION_REAL_LLM_GATE === "1";
const realDescribe = enabled ? describe : describe.skip;

realDescribe("vertical drama prompt expansion real LLM integration", () => {
  const userId = Number(process.env.VERTICAL_DRAMA_PROMPT_EXPANSION_REAL_LLM_USER_ID);
  const tenantId = process.env.VERTICAL_DRAMA_PROMPT_EXPANSION_REAL_LLM_TENANT_ID?.trim();
  const prompt = process.env.VERTICAL_DRAMA_PROMPT_EXPANSION_REAL_LLM_PROMPT?.trim()
    || "พระเอกกับนางเอกเป็นคู่กัดจากครอบครัวร่ำรวย กลับมาพบกันเมื่อเธอเป็นผู้บริหารบริษัทใหญ่กว่าเขา ทั้งคู่ต้องเปิดเผยความลับเรื่องลูกฝาแฝดที่พลัดพราก ขอเนื้อเรื่องย่อกึ่งสมบูรณ์ที่มีที่มา การพบกัน พัฒนาความรัก อุปสรรค ปมใหญ่ ไคลแมกซ์ และทิศทางตอนจบ";

  it("runs the real skill and settles exactly one user charge", async () => {
    if (!Number.isInteger(userId) || userId <= 0 || !tenantId) {
      throw new Error("Real LLM gate requires VERTICAL_DRAMA_PROMPT_EXPANSION_REAL_LLM_USER_ID and _TENANT_ID");
    }
    if (prompt.length > 5_000) throw new Error("Real LLM gate prompt must be <= 5000 characters");

    getDb();
    const idempotencyKey = `vitest-live-ppex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const owner = { tenantId, userId };
    const preview = await runRealPromptExpansion(owner, {
      prompt,
      locale: "th",
      idempotencyKey,
    });
    const saved = await savePromptExpansionPreview(owner, { idempotencyKey, preview });

    expect(saved.status).toBe("preview");
    expect(preview.execution?.skillId).toBe("vertical-drama-prompt-expansion");
    expect(preview.execution?.executionMode).toBe("llm-only");
    expect(preview.execution?.mocked).toBe(false);
    expect(preview.execution?.providerCallId).toBeTruthy();
    expect(preview.execution?.model).not.toBe("openai/gpt-5.4-nano");
    expect(preview.expandedPrompt.length).toBeGreaterThan(120);
    expect(preview.brief.storyTreatment).toBeTruthy();
    expect(preview.slots.length).toBeGreaterThan(0);
    expect(preview.slots.every(slot => typeof slot.required === "boolean")).toBe(true);

    const db = getDb();
    const transactions = await db
      .select({ amount: creditTransactions.amount, type: creditTransactions.type, description: creditTransactions.description, metadata: creditTransactions.metadata })
      .from(creditTransactions)
      .where(and(eq(creditTransactions.userId, userId), eq(creditTransactions.skillSlug, "vertical-drama-prompt-expansion")))
      .orderBy(desc(creditTransactions.createdAt))
      .limit(10);
    const matchingUserCharges = transactions.filter(row => (
      (row.metadata as Record<string, unknown> | null)?.skillRunId === idempotencyKey
      && row.type === "usage"
    ));
    expect(matchingUserCharges).toHaveLength(1);
    expect(matchingUserCharges[0]?.description).toBe("Skill run: Vertical Drama Prompt Expansion");
  }, 120_000);
});
