import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  conversationSummaries,
  memoryArchiveMetadata,
  messageChunks,
  messages,
} from "../../../drizzle/schema";

describe("chat memory schema", () => {
  it("message_chunks has the expected columns and defaults", () => {
    const columns = getTableColumns(messageChunks);

    expect(columns.id.dataType).toBe("string");
    expect(columns.id.columnType).toBe("PgText");
    expect(columns.id.primary).toBe(true);
    expect(columns.id.hasDefault).toBe(true);

    expect(columns.tenantId.columnType).toBe("PgVarchar");
    expect(columns.userId.dataType).toBe("number");
    expect(columns.conversationId.dataType).toBe("number");
    expect(columns.messageRangeStart.dataType).toBe("number");
    expect(columns.messageRangeEnd.dataType).toBe("number");
    expect(columns.chunkIndex.dataType).toBe("number");
    expect(columns.content.dataType).toBe("string");
    expect(columns.tokenCount.dataType).toBe("number");

    expect(columns.embedding.dataType).toBe("custom");
    expect(columns.embedding.columnType).toBe("PgCustomColumn");
    expect(columns.embedding.notNull).toBe(false);

    expect(columns.projectId.notNull).toBe(false);
    expect(columns.personaId.notNull).toBe(false);
    expect(columns.createdAt.hasDefault).toBe(true);
  });

  it("message_chunks enforces the expected unique and lookup indexes", () => {
    const config = getTableConfig(messageChunks);
    const indexNames = config.indexes.map((index) => index.config.name);

    expect(indexNames).toContain("message_chunks_conv_chunk_idx");
    expect(indexNames).toContain("message_chunks_tenant_user_idx");
    expect(indexNames).toContain("message_chunks_created_idx");
    expect(indexNames).toContain("message_chunks_tenant_project_idx");

    const uniqueIndex = config.indexes.find(
      (index) => index.config.name === "message_chunks_conv_chunk_idx",
    );
    expect(uniqueIndex?.config.unique).toBe(true);
  });

  it("message_chunks cascades deletes from users and conversations", () => {
    const config = getTableConfig(messageChunks);
    expect(config.foreignKeys).toHaveLength(2);
    const fkColumns = config.foreignKeys.map((fk) => fk.reference().columns[0].name);

    expect(fkColumns).toContain("userId");
    expect(fkColumns).toContain("conversationId");
    for (const fk of config.foreignKeys) {
      expect(fk.onDelete).toBe("cascade");
    }
  });

  it("memory_archive_metadata has the expected columns and defaults", () => {
    const columns = getTableColumns(memoryArchiveMetadata);

    expect(columns.id.dataType).toBe("number");
    expect(columns.id.columnType).toBe("PgSerial");
    expect(columns.id.primary).toBe(true);
    expect(columns.id.hasDefault).toBe(true);

    expect(columns.tenantId.columnType).toBe("PgVarchar");
    expect(columns.userId.dataType).toBe("number");
    expect(columns.conversationId.dataType).toBe("number");
    expect(columns.archiveDate.columnType).toBe("PgVarchar");
    expect(columns.filePath.dataType).toBe("string");
    expect(columns.messageCount.hasDefault).toBe(true);
    expect(columns.fileSizeBytes.hasDefault).toBe(true);
    expect(columns.encryptionVersion.hasDefault).toBe(true);
    expect(columns.createdAt.hasDefault).toBe(true);
  });

  it("memory_archive_metadata cascades deletes from users and conversations", () => {
    const config = getTableConfig(memoryArchiveMetadata);
    expect(config.foreignKeys).toHaveLength(2);
    const fkColumns = config.foreignKeys.map((fk) => fk.reference().columns[0].name);

    expect(fkColumns).toContain("userId");
    expect(fkColumns).toContain("conversationId");
    for (const fk of config.foreignKeys) {
      expect(fk.onDelete).toBe("cascade");
    }
  });

  it("memory_archive_metadata enforces one archive per conversation/date", () => {
    const config = getTableConfig(memoryArchiveMetadata);
    const uniqueIndex = config.indexes.find(
      (index) => index.config.name === "memory_archive_conv_date_idx",
    );

    expect(uniqueIndex).toBeDefined();
    expect(uniqueIndex?.config.unique).toBe(true);
  });

  it("conversation_summaries includes the smart summarization columns", () => {
    const columns = getTableColumns(conversationSummaries);

    expect(columns.skippedRiskyCount.dataType).toBe("number");
    expect(columns.skippedRiskyCount.hasDefault).toBe(true);
    expect(columns.extractedFactIds.dataType).toBe("array");
    expect(columns.hasRawArchive.dataType).toBe("boolean");
    expect(columns.hasRawArchive.hasDefault).toBe(true);
    expect(columns.classificationStats.dataType).toBe("json");
  });

  it("messages has the conversation-created composite index", () => {
    const config = getTableConfig(messages);
    const indexNames = config.indexes.map((index) => index.config.name);

    expect(indexNames).toContain("messages_created_at_idx");
    expect(indexNames).toContain("messages_conversation_created_idx");
  });
});
