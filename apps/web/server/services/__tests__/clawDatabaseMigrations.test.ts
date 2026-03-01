/**
 * ClawFeature Database Migration Tests
 *
 * Integration tests: require a running PostgreSQL database.
 * Tests validate that the 0054 migration produces the expected database state.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { llmProviders } from "../../../drizzle/schema";
import { sql } from "drizzle-orm";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env from apps/web root
config({ path: resolve(__dirname, "../../../.env") });

type DrizzleDB = ReturnType<typeof drizzle>;
let dbInstance: DrizzleDB | null = null;
let pgClient: ReturnType<typeof postgres> | null = null;

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  pgClient = postgres(url, { max: 2 });
  dbInstance = drizzle(pgClient);
});

afterAll(async () => {
  if (pgClient) await pgClient.end();
});

function requireDb(): DrizzleDB {
  if (!dbInstance) throw new Error("Database not available - skip integration tests");
  return dbInstance;
}

describe("ClawFeature Database Migrations", () => {
  describe("1.1 Enum Extension", () => {
    it("should accept new creditSourceType values", async () => {
      const db = requireDb();
      const result = await db.execute(
        sql`SELECT unnest(enum_range(null::credit_source_type)) AS val`
      );
      const values = result.map((r: any) => r.val);

      expect(values).toContain("tts");
      expect(values).toContain("browser_automation");
      expect(values).toContain("widget_chat");
      expect(values).toContain("webhook_chat");
    });

    it("should still accept existing creditSourceType values", async () => {
      const db = requireDb();
      const result = await db.execute(
        sql`SELECT unnest(enum_range(null::credit_source_type)) AS val`
      );
      const values = result.map((r: any) => r.val);

      expect(values).toContain("chat");
      expect(values).toContain("skill");
      expect(values).toContain("stt");
      expect(values).toContain("agency");
    });
  });

  describe("1.1b Provider Seed Data", () => {
    it("should have STT/TTS providers seeded", async () => {
      const db = requireDb();
      const providers = await db
        .select({
          providerName: llmProviders.providerName,
          displayName: llmProviders.displayName,
        })
        .from(llmProviders)
        .where(
          sql`"providerName" IN ('groq-whisper-stt','openai-whisper-stt','elevenlabs-tts','openai-tts')`
        );

      expect(providers).toHaveLength(4);
      const names = providers.map((p) => p.providerName);
      expect(names).toContain("groq-whisper-stt");
      expect(names).toContain("openai-whisper-stt");
      expect(names).toContain("elevenlabs-tts");
      expect(names).toContain("openai-tts");
    });
  });

  describe("1.2-1.7 New Tables", () => {
    it("persona_templates table exists with correct CHECK constraints", async () => {
      const db = requireDb();
      const validResult = await db.execute(
        sql`INSERT INTO persona_templates (id, name, "systemPromptPrefix", scope, tone)
            VALUES ('test-pt-valid', 'Test Persona', 'You are helpful', 'platform', 'formal')
            RETURNING id`
      );
      expect(validResult).toHaveLength(1);

      // Cleanup
      await db.execute(sql`DELETE FROM persona_templates WHERE id = 'test-pt-valid'`);
    });

    it("persona_templates rejects invalid tone", async () => {
      const db = requireDb();
      await expect(
        db.execute(
          sql`INSERT INTO persona_templates (id, name, "systemPromptPrefix", scope, tone)
              VALUES ('test-pt-bad', 'Test', 'prefix', 'platform', 'angry')`
        )
      ).rejects.toThrow();
    });

    it("persona_templates rejects invalid scope", async () => {
      const db = requireDb();
      await expect(
        db.execute(
          sql`INSERT INTO persona_templates (id, name, "systemPromptPrefix", scope)
              VALUES ('test-pt-bad2', 'Test', 'prefix', 'global')`
        )
      ).rejects.toThrow();
    });

    it("channel_connections table exists with correct constraints", async () => {
      const db = requireDb();
      const result = await db.execute(sql`SELECT count(*) as cnt FROM channel_connections`);
      expect(Number((result[0] as any).cnt)).toBe(0);
    });

    it("channel_connections rejects invalid channelType", async () => {
      const db = requireDb();
      await expect(
        db.execute(
          sql`INSERT INTO channel_connections (id, "tenantId", "userId", "channelType", "externalUserId")
              VALUES ('test-cc-bad', 'tenant-ZCSKEM9s', 1, 'invalid_type', 'ext123')`
        )
      ).rejects.toThrow();
    });

    it("channel_credentials table exists", async () => {
      const db = requireDb();
      const result = await db.execute(sql`SELECT count(*) as cnt FROM channel_credentials`);
      expect(Number((result[0] as any).cnt)).toBe(0);
    });

    it("chat_widgets table exists", async () => {
      const db = requireDb();
      const result = await db.execute(sql`SELECT count(*) as cnt FROM chat_widgets`);
      expect(Number((result[0] as any).cnt)).toBe(0);
    });

    it("conversation_artifacts table exists with self-referential FK", async () => {
      const db = requireDb();
      const result = await db.execute(sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'conversation_artifacts' AND column_name = 'parentArtifactId'
      `);
      expect(result).toHaveLength(1);
    });

    it("webhook_triggers table exists", async () => {
      const db = requireDb();
      const result = await db.execute(sql`SELECT count(*) as cnt FROM webhook_triggers`);
      expect(Number((result[0] as any).cnt)).toBe(0);
    });

    it("webhook_trigger_logs table exists", async () => {
      const db = requireDb();
      const result = await db.execute(sql`SELECT count(*) as cnt FROM webhook_trigger_logs`);
      expect(Number((result[0] as any).cnt)).toBe(0);
    });

    it("channel_routing_rules table exists", async () => {
      const db = requireDb();
      const result = await db.execute(sql`SELECT count(*) as cnt FROM channel_routing_rules`);
      expect(Number((result[0] as any).cnt)).toBe(0);
    });
  });

  describe("New Columns on Existing Tables", () => {
    it("conversations should have tenantId column populated", async () => {
      const db = requireDb();
      const result = await db.execute(
        sql`SELECT count(*) as total, count("tenantId") as with_tenant FROM conversations`
      );
      const row = result[0] as any;
      expect(Number(row.with_tenant)).toBe(Number(row.total));
    });

    it("conversations should have personaId column", async () => {
      const db = requireDb();
      const result = await db.execute(sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'conversations' AND column_name = 'personaId'
      `);
      expect(result).toHaveLength(1);
    });

    it("messages should have traceId column", async () => {
      const db = requireDb();
      const result = await db.execute(sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'messages' AND column_name = 'traceId'
      `);
      expect(result).toHaveLength(1);
    });

    it("users should have defaultPersonaId and voiceConsentGrantedAt columns", async () => {
      const db = requireDb();
      const result = await db.execute(sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'users' AND column_name IN ('defaultPersonaId', 'voiceConsentGrantedAt')
      `);
      expect(result).toHaveLength(2);
    });

    it("tenants should have defaultPersonaId and featureFlags columns", async () => {
      const db = requireDb();
      const result = await db.execute(sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'tenants' AND column_name IN ('defaultPersonaId', 'featureFlags')
      `);
      expect(result).toHaveLength(2);
    });
  });

  describe("Index Verification", () => {
    it("should have idx_messages_traceid index", async () => {
      const db = requireDb();
      const result = await db.execute(
        sql`SELECT indexname FROM pg_indexes WHERE tablename = 'messages' AND indexname = 'idx_messages_traceid'`
      );
      expect(result).toHaveLength(1);
    });

    it("should have idx_conversations_tenant index", async () => {
      const db = requireDb();
      const result = await db.execute(
        sql`SELECT indexname FROM pg_indexes WHERE tablename = 'conversations' AND indexname = 'idx_conversations_tenant'`
      );
      expect(result).toHaveLength(1);
    });

    it("should have persona_templates indexes", async () => {
      const db = requireDb();
      const result = await db.execute(
        sql`SELECT indexname FROM pg_indexes WHERE tablename = 'persona_templates'`
      );
      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });
});
