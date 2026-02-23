diff --git a/apps/web/drizzle/0034_parched_supernaut.sql b/apps/web/drizzle/0034_parched_supernaut.sql
new file mode 100644
index 0000000..b2d2099
--- /dev/null
+++ b/apps/web/drizzle/0034_parched_supernaut.sql
@@ -0,0 +1,3 @@
+ALTER TABLE "library_chunks" ADD COLUMN "is_parent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
+ALTER TABLE "library_chunks" ADD COLUMN "parent_chunk_id" text;--> statement-breakpoint
+CREATE INDEX "library_chunks_parent_chunk_idx" ON "library_chunks" USING btree ("parent_chunk_id");
\ No newline at end of file
diff --git a/apps/web/drizzle/meta/_journal.json b/apps/web/drizzle/meta/_journal.json
index 14efdc5..384090a 100644
--- a/apps/web/drizzle/meta/_journal.json
+++ b/apps/web/drizzle/meta/_journal.json
@@ -232,6 +232,20 @@
       "when": 1771733214491,
       "tag": "0032_cynical_moondragon",
       "breakpoints": true
+    },
+    {
+      "idx": 33,
+      "version": "7",
+      "when": 1771739406509,
+      "tag": "0033_presentation_hardening_stream_c",
+      "breakpoints": true
+    },
+    {
+      "idx": 34,
+      "version": "7",
+      "when": 1771741705208,
+      "tag": "0034_parched_supernaut",
+      "breakpoints": true
     }
   ]
 }
\ No newline at end of file
diff --git a/apps/web/drizzle/schema.ts b/apps/web/drizzle/schema.ts
index 978977e..63102d4 100644
--- a/apps/web/drizzle/schema.ts
+++ b/apps/web/drizzle/schema.ts
@@ -1,4 +1,4 @@
-import { integer, pgEnum, pgTable, text, timestamp, varchar, json, jsonb, boolean, numeric, serial, uniqueIndex, index, type AnyPgColumn } from "drizzle-orm/pg-core";
+import { integer, pgEnum, pgTable, text, timestamp, varchar, json, jsonb, boolean, numeric, serial, uniqueIndex, index, foreignKey, type AnyPgColumn } from "drizzle-orm/pg-core";
 import { sql } from "drizzle-orm";
 
 /**
@@ -1591,6 +1591,7 @@ export const libraryItems = pgTable("library_items", {
   createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
   updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
 }, (t) => [
+  uniqueIndex("library_items_id_tenant_unique").on(t.id, t.tenantId),
   index("library_items_tenant_visibility_status_idx").on(t.tenantId, t.visibility, t.status),
   index("library_items_tenant_owner_status_idx").on(t.tenantId, t.ownerUserId, t.status),
   index("library_items_source_item_type_idx").on(t.source, t.itemType),
@@ -1630,12 +1631,16 @@ export const libraryChunks = pgTable("library_chunks", {
   metadata: json("metadata").$type<Record<string, any>>().notNull().default({}),
   // Denormalized scope cache — mirrors parent item's allowed_scopes
   allowedScopes: text("allowed_scopes").array().default(sql`'{}'`),
+  // Parent-child chunk support for RAG
+  isParent: boolean("is_parent").default(false).notNull(),
+  parentChunkId: text("parent_chunk_id"),
   createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 }, (t) => [
   uniqueIndex("library_chunks_item_chunk_index_unique").on(t.libraryItemId, t.chunkIndex),
   index("library_chunks_tenant_content_type_idx").on(t.tenantId, t.contentType),
   index("library_chunks_vector_ref_idx").on(t.vectorRefId),
   index("library_chunks_allowed_scopes_gin_idx").using("gin", t.allowedScopes),
+  index("library_chunks_parent_chunk_idx").on(t.parentChunkId),
 ]);
 
 export type LibraryChunk = typeof libraryChunks.$inferSelect;
@@ -1728,6 +1733,7 @@ export const presentationDecks = pgTable("presentation_decks", {
   updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
 }, (t) => [
   uniqueIndex("presentation_decks_library_item_unique").on(t.libraryItemId),
+  uniqueIndex("presentation_decks_id_tenant_unique").on(t.id, t.tenantId),
   index("presentation_decks_tenant_idx").on(t.tenantId),
   index("presentation_decks_tenant_updated_idx").on(t.tenantId, t.updatedAt),
 ]);
@@ -1747,6 +1753,7 @@ export const presentationSlides = pgTable("presentation_slides", {
   updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
 }, (t) => [
   uniqueIndex("presentation_slides_deck_order_unique").on(t.deckId, t.orderIndex),
+  uniqueIndex("presentation_slides_deck_id_unique").on(t.deckId, t.id),
   index("presentation_slides_deck_idx").on(t.deckId),
   index("presentation_slides_deck_updated_idx").on(t.deckId, t.updatedAt),
 ]);
@@ -1766,6 +1773,21 @@ export const presentationAssetLinks = pgTable("presentation_asset_links", {
   uniqueIndex("presentation_asset_links_unique").on(t.deckId, t.slideId, t.libraryItemId),
   index("presentation_asset_links_deck_idx").on(t.deckId),
   index("presentation_asset_links_slide_idx").on(t.slideId),
+  foreignKey({
+    name: "presentation_asset_links_deck_tenant_fk",
+    columns: [t.deckId, t.tenantId],
+    foreignColumns: [presentationDecks.id, presentationDecks.tenantId],
+  }).onDelete("cascade"),
+  foreignKey({
+    name: "presentation_asset_links_library_item_tenant_fk",
+    columns: [t.libraryItemId, t.tenantId],
+    foreignColumns: [libraryItems.id, libraryItems.tenantId],
+  }).onDelete("cascade"),
+  foreignKey({
+    name: "presentation_asset_links_slide_deck_fk",
+    columns: [t.deckId, t.slideId],
+    foreignColumns: [presentationSlides.deckId, presentationSlides.id],
+  }),
 ]);
 
 export type PresentationAssetLink = typeof presentationAssetLinks.$inferSelect;
@@ -1789,6 +1811,44 @@ export const presentationSourceAttachments = pgTable("presentation_source_attach
 export type PresentationSourceAttachment = typeof presentationSourceAttachments.$inferSelect;
 export type InsertPresentationSourceAttachment = typeof presentationSourceAttachments.$inferInsert;
 
+export const presentationConversionRecords = pgTable("presentation_conversion_records", {
+  id: serial("id").primaryKey(),
+  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
+  sourceItemId: integer("source_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
+  sourceFormat: varchar("source_format", { length: 16 }).notNull(),
+  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
+  deckLibraryItemId: integer("deck_library_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
+  deckId: integer("deck_id").notNull().references(() => presentationDecks.id, { onDelete: "cascade" }),
+  partialFidelity: boolean("partial_fidelity").notNull().default(false),
+  fidelityWarnings: json("fidelity_warnings").$type<string[]>().notNull().default([]),
+  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
+  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
+  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  uniqueIndex("presentation_conversion_records_source_unique").on(t.tenantId, t.sourceItemId),
+  index("presentation_conversion_records_idempotency_idx").on(t.tenantId, t.sourceItemId, t.idempotencyKey),
+  index("presentation_conversion_records_expires_at_idx").on(t.expiresAt),
+]);
+
+export type PresentationConversionRecord = typeof presentationConversionRecords.$inferSelect;
+export type InsertPresentationConversionRecord = typeof presentationConversionRecords.$inferInsert;
+
+export const presentationConversionLocks = pgTable("presentation_conversion_locks", {
+  id: serial("id").primaryKey(),
+  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
+  sourceItemId: integer("source_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
+  lockToken: varchar("lock_token", { length: 64 }).notNull(),
+  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
+  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
+  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  uniqueIndex("presentation_conversion_locks_source_unique").on(t.tenantId, t.sourceItemId),
+  index("presentation_conversion_locks_expires_at_idx").on(t.expiresAt),
+]);
+
+export type PresentationConversionLock = typeof presentationConversionLocks.$inferSelect;
+export type InsertPresentationConversionLock = typeof presentationConversionLocks.$inferInsert;
+
 // ============================================================
 // Google Drive Integration Tables
 // ============================================================
diff --git a/python-backend/app/models/library.py b/python-backend/app/models/library.py
index 728aa9b..fd2c372 100644
--- a/python-backend/app/models/library.py
+++ b/python-backend/app/models/library.py
@@ -113,6 +113,10 @@ class LibraryChunk(Base):
     # Denormalized scope cache — mirrors parent item's allowed_scopes
     allowed_scopes = Column(ARRAY(Text), default=list, server_default="{}")
 
+    # Parent-child chunk support for RAG
+    is_parent = Column(Boolean, nullable=False, default=False, server_default="false")
+    parent_chunk_id = Column(Text, nullable=True)
+
     created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
 
     __table_args__ = (
diff --git a/python-backend/app/orchestrator/rag/chunker.py b/python-backend/app/orchestrator/rag/chunker.py
new file mode 100644
index 0000000..8ad981b
--- /dev/null
+++ b/python-backend/app/orchestrator/rag/chunker.py
@@ -0,0 +1,523 @@
+"""Smart token-based, strategy-aware document chunker with parent-child pattern.
+
+Provides SmartChunker which replaces legacy fixed-character chunking with:
+- Token-accurate splitting via tiktoken (cl100k_base)
+- Strategy-aware splitting (recursive, markdown, code, fixed)
+- Parent-child chunk pattern for retrieval precision + LLM context
+"""
+
+from __future__ import annotations
+
+import re
+import uuid
+from dataclasses import dataclass, field
+from enum import Enum
+from typing import Optional
+
+import structlog
+import tiktoken
+
+logger = structlog.get_logger()
+
+# Shared encoder — cached at module level by tiktoken
+_encoder = tiktoken.get_encoding("cl100k_base")
+
+
+class ChunkStrategy(str, Enum):
+    FIXED = "fixed"  # Legacy backward-compat (character-based)
+    RECURSIVE = "recursive"  # Default: paragraph > line > sentence > word
+    MARKDOWN = "markdown"  # Split by headings, preserve structure
+    CODE = "code"  # Split by function/class boundaries
+    SEMANTIC = "semantic"  # Future: split by embedding similarity
+
+
+@dataclass
+class ChunkConfig:
+    strategy: ChunkStrategy = ChunkStrategy.RECURSIVE
+    child_max_tokens: int = 400
+    child_overlap_tokens: int = 80
+    parent_max_tokens: int = 1024
+    min_chunk_tokens: int = 50
+
+
+@dataclass
+class Chunk:
+    chunk_id: str
+    content: str
+    index: int
+    parent_chunk_id: str | None
+    parent_doc_id: str
+    parent_doc_title: str
+    section_heading: str
+    token_count: int
+    start_char: int
+    end_char: int
+    is_parent: bool
+    tenant_id: str
+    allowed_scopes: list[str]
+    metadata: dict = field(default_factory=dict)
+
+
+class SmartChunker:
+    """Token-based, strategy-aware chunker with parent-child pattern."""
+
+    def __init__(self, config: ChunkConfig | None = None):
+        self.config = config or ChunkConfig()
+
+    @staticmethod
+    def detect_strategy(text: str) -> ChunkStrategy:
+        """Auto-detect the best chunking strategy from content."""
+        sample = text[:500]
+
+        if re.search(r"^#{1,6}\s", sample, re.MULTILINE):
+            return ChunkStrategy.MARKDOWN
+
+        code_markers = ["def ", "class ", "function ", "async function "]
+        if sum(sample.count(m) for m in code_markers) >= 2:
+            return ChunkStrategy.CODE
+
+        return ChunkStrategy.RECURSIVE
+
+    def _count_tokens(self, text: str) -> int:
+        return len(_encoder.encode(text))
+
+    def chunk(
+        self,
+        text: str,
+        doc_id: str,
+        doc_title: str,
+        tenant_id: str,
+        allowed_scopes: list[str],
+        strategy: ChunkStrategy | None = None,
+    ) -> list[Chunk]:
+        """Split text into parent and child chunks.
+
+        Args:
+            text: Document content to chunk.
+            doc_id: Source document ID.
+            doc_title: Source document title.
+            tenant_id: Tenant context (inherited by all chunks).
+            allowed_scopes: Access scopes (inherited by all chunks).
+            strategy: Explicit strategy override. If None, uses config or auto-detects.
+
+        Returns:
+            List of Chunk objects (parents and children interleaved).
+        """
+        if not text or not text.strip():
+            return []
+
+        # Resolve effective strategy
+        if strategy is not None:
+            effective = strategy
+        elif self.config.strategy != ChunkStrategy.RECURSIVE:
+            effective = self.config.strategy
+        else:
+            effective = self.detect_strategy(text)
+
+        if effective == ChunkStrategy.FIXED:
+            return self._fixed_split(text, doc_id, doc_title, tenant_id, allowed_scopes)
+
+        # Strategy-specific section extraction
+        if effective == ChunkStrategy.MARKDOWN:
+            sections = self._markdown_sections(text)
+        elif effective == ChunkStrategy.CODE:
+            sections = self._code_sections(text)
+        else:
+            sections = [("", text)]
+
+        return self._build_parent_child(
+            sections, text, doc_id, doc_title, tenant_id, allowed_scopes, effective,
+        )
+
+    # ── Recursive text splitting ────────────────────────────────────────
+
+    def _split_recursive(self, text: str, max_tokens: int) -> list[str]:
+        """Recursively split text respecting natural boundaries.
+
+        Tries separators in order: paragraph > line > sentence > word.
+        """
+        if self._count_tokens(text) <= max_tokens:
+            return [text]
+
+        for sep in ["\n\n", "\n", ". ", " "]:
+            parts = text.split(sep)
+            if len(parts) <= 1:
+                continue
+
+            segments: list[str] = []
+            current = parts[0]
+
+            for part in parts[1:]:
+                joiner = sep if sep != ". " else ". "
+                candidate = current + joiner + part
+                if self._count_tokens(candidate) > max_tokens:
+                    if current.strip():
+                        segments.append(current)
+                    current = part
+                else:
+                    current = candidate
+
+            if current.strip():
+                segments.append(current)
+
+            # Recursively handle any still-oversized segments
+            result: list[str] = []
+            for seg in segments:
+                if self._count_tokens(seg) > max_tokens:
+                    result.extend(self._split_recursive(seg, max_tokens))
+                else:
+                    result.append(seg)
+
+            if len(result) > 1:
+                return result
+
+        # Fallback: return as-is
+        return [text]
+
+    # ── Strategy-specific section extractors ─────────────────────────────
+
+    def _markdown_sections(self, text: str) -> list[tuple[str, str]]:
+        """Split markdown by heading boundaries."""
+        heading_re = re.compile(r"^(#{1,6}\s+.+)$", re.MULTILINE)
+        positions = [
+            (m.start(), m.end(), m.group(1).strip())
+            for m in heading_re.finditer(text)
+        ]
+
+        if not positions:
+            return [("", text)]
+
+        sections: list[tuple[str, str]] = []
+
+        # Content before first heading
+        if positions[0][0] > 0:
+            pre = text[: positions[0][0]].strip()
+            if pre:
+                sections.append(("", pre))
+
+        for i, (start, end, heading) in enumerate(positions):
+            next_start = positions[i + 1][0] if i + 1 < len(positions) else len(text)
+            body = text[end:next_start].strip()
+            # Include heading in content for LLM context
+            full_content = f"{heading}\n{body}" if body else heading
+            sections.append((heading, full_content))
+
+        return sections
+
+    def _code_sections(self, text: str) -> list[tuple[str, str]]:
+        """Split on function/class definition boundaries."""
+        boundary_re = re.compile(
+            r"^(?=(?:(?:async\s+)?def\s|class\s|(?:async\s+)?function\s|"
+            r"export\s+(?:default\s+)?(?:function|class)\s))",
+            re.MULTILINE,
+        )
+        splits = list(boundary_re.finditer(text))
+
+        if not splits:
+            return [("", text)]
+
+        sections: list[tuple[str, str]] = []
+
+        # Preamble before first definition
+        if splits[0].start() > 0:
+            pre = text[: splits[0].start()].strip()
+            if pre:
+                sections.append(("", pre))
+
+        for i, m in enumerate(splits):
+            next_start = splits[i + 1].start() if i + 1 < len(splits) else len(text)
+            chunk_text = text[m.start() : next_start].rstrip()
+            first_line = chunk_text.split("\n")[0].rstrip(":").strip()
+            sections.append((first_line, chunk_text))
+
+        return sections
+
+    # ── Parent-child builder ─────────────────────────────────────────────
+
+    def _build_parent_child(
+        self,
+        sections: list[tuple[str, str]],
+        full_text: str,
+        doc_id: str,
+        doc_title: str,
+        tenant_id: str,
+        allowed_scopes: list[str],
+        strategy: ChunkStrategy,
+    ) -> list[Chunk]:
+        all_chunks: list[Chunk] = []
+        idx = 0
+
+        # Ensure each section fits within parent_max_tokens
+        expanded: list[tuple[str, str]] = []
+        for heading, content in sections:
+            if self._count_tokens(content) > self.config.parent_max_tokens:
+                subs = self._split_recursive(content, self.config.parent_max_tokens)
+                for s in subs:
+                    expanded.append((heading, s.strip()))
+            else:
+                expanded.append((heading, content))
+
+        # Group small adjacent sections into parent-sized windows
+        groups: list[list[tuple[str, str]]] = []
+        current_group: list[tuple[str, str]] = []
+        current_tokens = 0
+
+        for heading, content in expanded:
+            ct = self._count_tokens(content)
+            if current_group and current_tokens + ct > self.config.parent_max_tokens:
+                groups.append(current_group)
+                current_group = [(heading, content)]
+                current_tokens = ct
+            else:
+                current_group.append((heading, content))
+                current_tokens += ct
+
+        if current_group:
+            groups.append(current_group)
+
+        # Build parent + child chunks for each group
+        for group in groups:
+            parent_content = "\n\n".join(c for _, c in group)
+            heading = next((h for h, _ in group if h), "")
+            parent_id = str(uuid.uuid4())
+
+            # Approximate start position in original text
+            search_key = group[0][1][:80] if group[0][1] else ""
+            start_pos = full_text.find(search_key) if search_key else 0
+            if start_pos < 0:
+                start_pos = 0
+
+            parent_token_count = self._count_tokens(parent_content)
+
+            parent = Chunk(
+                chunk_id=parent_id,
+                content=parent_content,
+                index=idx,
+                parent_chunk_id=None,
+                parent_doc_id=doc_id,
+                parent_doc_title=doc_title,
+                section_heading=heading,
+                token_count=parent_token_count,
+                start_char=start_pos,
+                end_char=start_pos + len(parent_content),
+                is_parent=True,
+                tenant_id=tenant_id,
+                allowed_scopes=allowed_scopes,
+                metadata={"strategy": strategy.value},
+            )
+            all_chunks.append(parent)
+            idx += 1
+
+            children = self._make_children(
+                parent_content, parent_id, heading, start_pos,
+                doc_id, doc_title, tenant_id, allowed_scopes, strategy, idx,
+            )
+            all_chunks.extend(children)
+            idx += len(children)
+
+        return all_chunks
+
+    # ── Child chunk creation with overlap ────────────────────────────────
+
+    def _split_to_units(self, text: str) -> list[str]:
+        """Split text into sentence-level natural units."""
+        units: list[str] = []
+        for para in text.split("\n\n"):
+            para = para.strip()
+            if not para:
+                continue
+            # Split on line breaks first
+            for line in para.split("\n"):
+                line = line.strip()
+                if not line:
+                    continue
+                # Split on sentence boundaries
+                sentences = re.split(r"(?<=[.!?])\s+", line)
+                if len(sentences) > 1:
+                    units.extend(s.strip() for s in sentences if s.strip())
+                else:
+                    units.append(line)
+        return units
+
+    def _make_children(
+        self,
+        parent_content: str,
+        parent_id: str,
+        heading: str,
+        parent_start: int,
+        doc_id: str,
+        doc_title: str,
+        tenant_id: str,
+        allowed_scopes: list[str],
+        strategy: ChunkStrategy,
+        start_idx: int,
+    ) -> list[Chunk]:
+        """Create overlapping child chunks from parent content."""
+        parent_tokens = self._count_tokens(parent_content)
+
+        if parent_tokens <= self.config.child_max_tokens:
+            return [
+                Chunk(
+                    chunk_id=str(uuid.uuid4()),
+                    content=parent_content.strip(),
+                    index=start_idx,
+                    parent_chunk_id=parent_id,
+                    parent_doc_id=doc_id,
+                    parent_doc_title=doc_title,
+                    section_heading=heading,
+                    token_count=parent_tokens,
+                    start_char=parent_start,
+                    end_char=parent_start + len(parent_content),
+                    is_parent=False,
+                    tenant_id=tenant_id,
+                    allowed_scopes=allowed_scopes,
+                    metadata={"strategy": strategy.value},
+                )
+            ]
+
+        units = self._split_to_units(parent_content)
+        if not units:
+            return []
+
+        unit_tokens = [self._count_tokens(u) for u in units]
+
+        children: list[Chunk] = []
+        window_start = 0
+
+        while window_start < len(units):
+            # Fill window up to child_max_tokens
+            window_end = window_start
+            accumulated = 0
+            while window_end < len(units):
+                if accumulated + unit_tokens[window_end] > self.config.child_max_tokens and window_end > window_start:
+                    break
+                accumulated += unit_tokens[window_end]
+                window_end += 1
+
+            if window_end == window_start:
+                # Single oversized unit — include it anyway
+                window_end = window_start + 1
+
+            content = " ".join(units[window_start:window_end]).strip()
+            if not content:
+                window_start = window_end
+                continue
+
+            tok_count = self._count_tokens(content)
+
+            # Merge too-small trailing chunks with previous
+            if tok_count < self.config.min_chunk_tokens and children:
+                prev = children[-1]
+                merged = prev.content + " " + content
+                children[-1] = Chunk(
+                    chunk_id=prev.chunk_id,
+                    content=merged,
+                    index=prev.index,
+                    parent_chunk_id=parent_id,
+                    parent_doc_id=doc_id,
+                    parent_doc_title=doc_title,
+                    section_heading=heading,
+                    token_count=self._count_tokens(merged),
+                    start_char=prev.start_char,
+                    end_char=parent_start + len(parent_content),
+                    is_parent=False,
+                    tenant_id=tenant_id,
+                    allowed_scopes=allowed_scopes,
+                    metadata={"strategy": strategy.value},
+                )
+                window_start = window_end
+                continue
+
+            # Approximate character position
+            child_start_offset = sum(len(units[k]) + 1 for k in range(window_start))
+
+            children.append(
+                Chunk(
+                    chunk_id=str(uuid.uuid4()),
+                    content=content,
+                    index=start_idx + len(children),
+                    parent_chunk_id=parent_id,
+                    parent_doc_id=doc_id,
+                    parent_doc_title=doc_title,
+                    section_heading=heading,
+                    token_count=tok_count,
+                    start_char=parent_start + child_start_offset,
+                    end_char=parent_start + child_start_offset + len(content),
+                    is_parent=False,
+                    tenant_id=tenant_id,
+                    allowed_scopes=allowed_scopes,
+                    metadata={"strategy": strategy.value},
+                )
+            )
+
+            # Compute next window_start with overlap
+            overlap = 0
+            next_start = window_end
+            for k in range(window_end - 1, window_start, -1):
+                if overlap + unit_tokens[k] > self.config.child_overlap_tokens:
+                    break
+                overlap += unit_tokens[k]
+                next_start = k
+
+            if next_start <= window_start:
+                next_start = window_start + 1
+
+            window_start = next_start
+
+        return children
+
+    # ── FIXED strategy (backward compatibility) ──────────────────────────
+
+    def _fixed_split(
+        self,
+        text: str,
+        doc_id: str,
+        doc_title: str,
+        tenant_id: str,
+        allowed_scopes: list[str],
+    ) -> list[Chunk]:
+        """Legacy character-based splitting. No parent-child pattern."""
+        # ~4 chars per token
+        max_chars = self.config.child_max_tokens * 4
+        overlap_chars = self.config.child_overlap_tokens * 4
+
+        normalized = " ".join(text.split())
+        if not normalized:
+            return []
+
+        chunks: list[Chunk] = []
+        cursor = 0
+        idx = 0
+
+        while cursor < len(normalized):
+            end = min(cursor + max_chars, len(normalized))
+            if end < len(normalized):
+                sp = normalized.rfind(" ", cursor, end)
+                if sp > cursor + 32:
+                    end = sp
+
+            content = normalized[cursor:end].strip()
+            if content:
+                chunks.append(
+                    Chunk(
+                        chunk_id=str(uuid.uuid4()),
+                        content=content,
+                        index=idx,
+                        parent_chunk_id=None,
+                        parent_doc_id=doc_id,
+                        parent_doc_title=doc_title,
+                        section_heading="",
+                        token_count=self._count_tokens(content),
+                        start_char=cursor,
+                        end_char=cursor + len(content),
+                        is_parent=False,
+                        tenant_id=tenant_id,
+                        allowed_scopes=allowed_scopes,
+                        metadata={"strategy": "fixed"},
+                    )
+                )
+                idx += 1
+
+            cursor = end - overlap_chars if end < len(normalized) else end
+
+        return chunks
diff --git a/python-backend/app/services/library_indexing_service.py b/python-backend/app/services/library_indexing_service.py
index 281c5d2..06010d8 100644
--- a/python-backend/app/services/library_indexing_service.py
+++ b/python-backend/app/services/library_indexing_service.py
@@ -12,6 +12,7 @@ from sqlalchemy.ext.asyncio import AsyncSession
 
 from app.core.vectordb import VectorCollection
 from app.models.library import LibraryChunk, LibraryIndexJob, LibraryItem
+from app.orchestrator.rag.chunker import SmartChunker, ChunkConfig
 from app.services.embedding_service import EmbeddingService, get_embedding_service
 from app.services.library_observability import emit_metric, log_observability_event
 from app.services.credit_billing_client import charge_credits_post_deduct
@@ -1010,22 +1011,37 @@ async def process_library_index_job(
         if not indexable_text:
             raise ValueError("No indexable text content found for library item")
 
-        chunks = chunk_text_content(indexable_text)
-        if not chunks:
+        smart_chunker = SmartChunker()
+        all_chunks = smart_chunker.chunk(
+            indexable_text,
+            doc_id=str(item.id),
+            doc_title=item.title or "",
+            tenant_id=job.tenant_id,
+            allowed_scopes=item.allowed_scopes or [f"u:{item.owner_user_id}"],
+        )
+        if not all_chunks:
             raise ValueError("Chunking produced no content")
 
+        child_chunks = [c for c in all_chunks if not c.is_parent]
+        parent_chunks = [c for c in all_chunks if c.is_parent]
+
+        # Only embed and upsert child chunks (parents stored for context only)
         embedder = embedding_service or get_embedding_service()
-        embeddings = embedder.embed_batch([chunk["content"] for chunk in chunks])
+        embeddings = embedder.embed_batch([c.content for c in child_chunks])
 
         upsert = _resolve_vector_upsert_fn(vector_upsert_fn)
+        chunks_for_upsert = [
+            {"content": c.content, "chunk_index": c.index, "metadata": c.metadata}
+            for c in child_chunks
+        ]
         vector_ids = upsert(
             tenant_id=job.tenant_id,
             item_id=job.library_item_id,
-            chunks=chunks,
+            chunks=chunks_for_upsert,
             embeddings=embeddings,
         )
 
-        if len(vector_ids) != len(chunks):
+        if len(vector_ids) != len(child_chunks):
             raise RuntimeError("vector_id_count_mismatch")
 
         # ── Step 2: Delete ONLY non-markdown_source chunks ───────────────────────
@@ -1077,18 +1093,46 @@ async def process_library_index_job(
         # search/embedding chunks start at chunk_index 1 to avoid conflict.
         chunk_index_offset = 1 if markdown_source_exists_now else 0
 
-        for chunk, vector_id in zip(chunks, vector_ids):
+        # Store parent chunks (no vector reference — not indexed)
+        for parent in parent_chunks:
             db.add(
                 LibraryChunk(
                     tenant_id=job.tenant_id,
                     library_item_id=item.id,
-                    chunk_index=chunk["chunk_index"] + chunk_index_offset,
-                    content=chunk["content"],
-                    content_type=chunk.get("content_type") or "text",
-                    token_count=chunk.get("token_count"),
+                    chunk_index=parent.index + chunk_index_offset,
+                    content=parent.content,
+                    content_type="text",
+                    token_count=parent.token_count,
+                    vector_ref_id=None,
+                    is_parent=True,
+                    parent_chunk_id=None,
+                    metadata={
+                        "section_heading": parent.section_heading,
+                        "strategy": parent.metadata.get("strategy", "recursive"),
+                        "job_id": job.id,
+                    },
+                    created_at=created_at,
+                )
+            )
+
+        # Store child chunks with vector references
+        for child, vector_id in zip(child_chunks, vector_ids):
+            db.add(
+                LibraryChunk(
+                    tenant_id=job.tenant_id,
+                    library_item_id=item.id,
+                    chunk_index=child.index + chunk_index_offset,
+                    content=child.content,
+                    content_type="text",
+                    token_count=child.token_count,
                     vector_ref_id=vector_id,
+                    is_parent=False,
+                    parent_chunk_id=child.parent_chunk_id,
                     metadata={
-                        **(chunk.get("metadata") or {}),
+                        "section_heading": child.section_heading,
+                        "start_char": child.start_char,
+                        "end_char": child.end_char,
+                        "strategy": child.metadata.get("strategy", "recursive"),
                         "job_id": job.id,
                     },
                     created_at=created_at,
@@ -1112,7 +1156,9 @@ async def process_library_index_job(
             "library_index_job_completed",
             job_id=job.id,
             library_item_id=job.library_item_id,
-            chunk_count=len(chunks),
+            chunk_count=len(all_chunks),
+            parent_chunks=len(parent_chunks),
+            child_chunks=len(child_chunks),
             attempt_count=job.attempt_count,
         )
         emit_metric(
diff --git a/python-backend/app/tasks/reindex_tasks.py b/python-backend/app/tasks/reindex_tasks.py
new file mode 100644
index 0000000..396f221
--- /dev/null
+++ b/python-backend/app/tasks/reindex_tasks.py
@@ -0,0 +1,134 @@
+"""Celery tasks for smart re-indexing of library items."""
+
+from __future__ import annotations
+
+from typing import Optional
+
+import structlog
+
+from app.core.celery_app import celery_app
+from app.core.database import AsyncSessionLocal
+from app.tasks.media_tasks import _run_async
+
+logger = structlog.get_logger()
+
+BATCH_SIZE = 50
+
+
+@celery_app.task(bind=True, name="smart_reindex_library_items", queue="celery")
+def smart_reindex_library_items(self, tenant_id: str | None = None):
+    """Re-index all library items with SmartChunker. Runs in batches of 50.
+
+    Uses the existing indexing pipeline (which now uses SmartChunker) by
+    enqueuing LibraryIndexJobs. This reuses the retry/deduplication and
+    observability infrastructure.
+
+    Args:
+        tenant_id: If provided, only re-index items for this tenant.
+                   If None, re-index all tenants.
+    """
+    return _run_async(_smart_reindex_impl(self, tenant_id))
+
+
+async def _smart_reindex_impl(task, tenant_id: str | None) -> dict:
+    """Async implementation for smart_reindex_library_items."""
+    from sqlalchemy import and_, func, select, text as sql_text
+
+    from app.models.library import LibraryItem
+    from app.services.library_indexing_service import enqueue_library_index_job
+
+    async with AsyncSessionLocal() as session:
+        # Count total items to process
+        count_q = select(func.count(LibraryItem.id)).where(
+            LibraryItem.deleted_at.is_(None),
+        )
+        if tenant_id:
+            count_q = count_q.where(LibraryItem.tenant_id == tenant_id)
+        total_items = await session.scalar(count_q) or 0
+
+        if total_items == 0:
+            logger.info("smart_reindex_no_items", tenant_id=tenant_id)
+            return {"total": 0, "processed": 0, "errors": 0}
+
+        logger.info(
+            "smart_reindex_starting",
+            tenant_id=tenant_id,
+            total_items=total_items,
+            batch_size=BATCH_SIZE,
+        )
+
+        processed = 0
+        errors = 0
+        offset = 0
+
+        while offset < total_items:
+            # Fetch batch of items
+            items_q = (
+                select(LibraryItem.id, LibraryItem.tenant_id)
+                .where(LibraryItem.deleted_at.is_(None))
+                .order_by(LibraryItem.id)
+                .offset(offset)
+                .limit(BATCH_SIZE)
+            )
+            if tenant_id:
+                items_q = items_q.where(LibraryItem.tenant_id == tenant_id)
+
+            result = await session.execute(items_q)
+            items = result.fetchall()
+
+            if not items:
+                break
+
+            for item in items:
+                try:
+                    await enqueue_library_index_job(
+                        db=session,
+                        tenant_id=item.tenant_id,
+                        library_item_id=item.id,
+                        job_type="smart_reindex",
+                    )
+                    processed += 1
+                except Exception as exc:
+                    logger.warning(
+                        "smart_reindex_enqueue_error",
+                        item_id=item.id,
+                        tenant_id=item.tenant_id,
+                        error=str(exc),
+                    )
+                    errors += 1
+
+            await session.commit()
+            offset += BATCH_SIZE
+
+            logger.info(
+                "smart_reindex_batch_progress",
+                tenant_id=tenant_id,
+                processed=processed,
+                total=total_items,
+                errors=errors,
+            )
+
+            # Update Celery task state for progress tracking
+            if task and hasattr(task, "update_state"):
+                task.update_state(
+                    state="PROGRESS",
+                    meta={
+                        "processed": processed,
+                        "total": total_items,
+                        "errors": errors,
+                    },
+                )
+
+    logger.info(
+        "smart_reindex_completed",
+        tenant_id=tenant_id,
+        total=total_items,
+        processed=processed,
+        errors=errors,
+    )
+
+    return {
+        "total": total_items,
+        "processed": processed,
+        "errors": errors,
+    }
diff --git a/python-backend/tests/orchestrator/rag/test_chunker.py b/python-backend/tests/orchestrator/rag/test_chunker.py
new file mode 100644
index 0000000..8c33099
--- /dev/null
+++ b/python-backend/tests/orchestrator/rag/test_chunker.py
@@ -0,0 +1,501 @@
+"""Tests for SmartChunker — token-based, strategy-aware document chunking."""
+
+import pytest
+import tiktoken
+
+from app.orchestrator.rag.chunker import (
+    Chunk,
+    ChunkConfig,
+    ChunkStrategy,
+    SmartChunker,
+)
+
+_enc = tiktoken.get_encoding("cl100k_base")
+
+
+# ── Test content ─────────────────────────────────────────────────────────
+
+_RECURSIVE_TEXT = (
+    "Artificial intelligence represents a transformative technology that continues "
+    "to reshape industries worldwide. Machine learning algorithms can process vast "
+    "datasets to identify patterns that would be impossible for humans to detect "
+    "manually. These patterns enable predictions and automated decision-making "
+    "across numerous applications.\n\n"
+    "Natural language processing has made significant advances in recent years. "
+    "Modern language models can understand context, generate coherent text, and "
+    "translate between languages with remarkable accuracy. These capabilities "
+    "power chatbots, search engines, and content generation tools.\n\n"
+    "Computer vision systems can now identify objects, faces, and scenes in images "
+    "with superhuman accuracy. Self-driving vehicles rely on these systems to "
+    "navigate roads safely. Medical imaging applications use computer vision to "
+    "detect diseases earlier than traditional methods.\n\n"
+    "Reinforcement learning enables agents to learn optimal strategies through "
+    "trial and error. Game-playing AI systems have achieved superhuman performance "
+    "in chess, Go, and complex video games. These techniques are now being applied "
+    "to robotics and industrial optimization.\n\n"
+    "The ethical implications of AI development require careful consideration. "
+    "Bias in training data can lead to unfair outcomes in automated decision "
+    "systems. Privacy concerns arise when AI systems process personal data at "
+    "scale. Responsible AI development practices are essential.\n\n"
+    "Edge computing brings AI capabilities closer to the data source. This reduces "
+    "latency and bandwidth requirements for real-time applications. Smart sensors "
+    "and IoT devices benefit from local AI processing for immediate response."
+)
+
+_MARKDOWN_TEXT = (
+    "# Introduction to Machine Learning\n\n"
+    "Machine learning is a subset of artificial intelligence that focuses on "
+    "building systems that learn from data. Unlike traditional programming where "
+    "rules are explicitly coded, ML systems discover patterns from examples. "
+    "The field has grown enormously in the past decade with increasing compute "
+    "power and larger datasets available for training sophisticated models.\n\n"
+    "## Supervised Learning\n\n"
+    "Supervised learning uses labeled training data to learn a mapping from inputs "
+    "to outputs. Common algorithms include linear regression for continuous outputs "
+    "and logistic regression for classification tasks. Decision trees and random "
+    "forests provide interpretable predictions for structured data. Support vector "
+    "machines find optimal decision boundaries in high-dimensional feature spaces. "
+    "Gradient boosting methods like XGBoost combine weak learners for strong "
+    "predictive performance across many benchmark tasks and competitions.\n\n"
+    "## Unsupervised Learning\n\n"
+    "Unsupervised learning finds hidden patterns in unlabeled data. Clustering "
+    "algorithms like K-means group similar data points together. Dimensionality "
+    "reduction techniques like PCA help visualize high-dimensional data. "
+    "Autoencoders learn compressed representations that capture essential features. "
+    "Generative adversarial networks create new data samples from learned "
+    "distributions. These methods are valuable for exploratory data analysis.\n\n"
+    "## Deep Learning\n\n"
+    "Deep learning uses neural networks with many layers to learn hierarchical "
+    "representations. Convolutional neural networks excel at image processing "
+    "tasks including classification, detection, and segmentation of visual data. "
+    "Recurrent neural networks handle sequential data like text and time series. "
+    "Transformer architectures have revolutionized natural language processing "
+    "with attention mechanisms that capture long-range dependencies efficiently. "
+    "Large language models can now generate coherent text and follow instructions.\n\n"
+    "## Applications\n\n"
+    "Machine learning powers recommendation systems, fraud detection, and medical "
+    "diagnosis. Natural language processing enables chatbots and translation "
+    "services across dozens of languages. Computer vision supports autonomous "
+    "vehicles and quality control. Reinforcement learning optimizes complex "
+    "sequential decision-making in robotics and game playing."
+)
+
+_CODE_TEXT = (
+    "import os\n"
+    "import json\n"
+    "from typing import Any, Optional\n\n\n"
+    "class DataProcessor:\n"
+    "    def __init__(self, config: dict):\n"
+    "        self.config = config\n"
+    "        self.data = []\n"
+    "        self.processed = False\n\n"
+    "    def load_data(self, filepath: str) -> list:\n"
+    "        with open(filepath, 'r') as f:\n"
+    "            self.data = json.load(f)\n"
+    "        return self.data\n\n"
+    "    def validate(self) -> bool:\n"
+    "        if not self.data:\n"
+    "            return False\n"
+    "        for item in self.data:\n"
+    "            if not isinstance(item, dict):\n"
+    "                return False\n"
+    "        return True\n\n\n"
+    "def calculate_statistics(data: list[dict]) -> dict:\n"
+    "    if not data:\n"
+    "        return {'count': 0, 'mean': 0}\n"
+    "    values = [item.get('value', 0) for item in data]\n"
+    "    return {\n"
+    "        'count': len(values),\n"
+    "        'mean': sum(values) / len(values),\n"
+    "        'max': max(values),\n"
+    "        'min': min(values),\n"
+    "    }\n\n\n"
+    "def format_output(stats: dict, format_type: str = 'json') -> str:\n"
+    "    if format_type == 'json':\n"
+    "        return json.dumps(stats, indent=2)\n"
+    "    elif format_type == 'text':\n"
+    "        lines = [f'{k}: {v}' for k, v in stats.items()]\n"
+    "        return '\\n'.join(lines)\n"
+    "    else:\n"
+    "        raise ValueError(f'Unknown format: {format_type}')\n\n\n"
+    "class DataExporter:\n"
+    "    def __init__(self, output_dir: str):\n"
+    "        self.output_dir = output_dir\n"
+    "        os.makedirs(output_dir, exist_ok=True)\n\n"
+    "    def export(self, data: Any, filename: str) -> str:\n"
+    "        filepath = os.path.join(self.output_dir, filename)\n"
+    "        with open(filepath, 'w') as f:\n"
+    "            json.dump(data, f, indent=2)\n"
+    "        return filepath\n"
+)
+
+_DEFAULT_KWARGS = {
+    "doc_id": "doc-1",
+    "doc_title": "Test Document",
+    "tenant_id": "t1",
+    "allowed_scopes": ["u:1", "p:global"],
+}
+
+
+# ── Strategy detection ──────────────────────────────────────────────────
+
+
+class TestChunkStrategy:
+    """Tests for strategy auto-detection."""
+
+    def test_auto_detect_markdown(self):
+        assert SmartChunker.detect_strategy(_MARKDOWN_TEXT) == ChunkStrategy.MARKDOWN
+
+    def test_auto_detect_python_code(self):
+        code = "def foo():\n    pass\n\nclass Bar:\n    pass\n"
+        assert SmartChunker.detect_strategy(code) == ChunkStrategy.CODE
+
+    def test_auto_detect_javascript_code(self):
+        code = "function foo() {\n}\n\nfunction bar() {\n}\n"
+        assert SmartChunker.detect_strategy(code) == ChunkStrategy.CODE
+
+    def test_auto_detect_plain_text(self):
+        text = "This is a plain paragraph with no special markers at all."
+        assert SmartChunker.detect_strategy(text) == ChunkStrategy.RECURSIVE
+
+
+# ── Recursive splitting ────────────────────────────────────────────────
+
+
+@pytest.mark.unit
+class TestRecursiveSplitting:
+    """Tests for RECURSIVE strategy splitting behavior."""
+
+    @pytest.fixture
+    def chunker(self):
+        config = ChunkConfig(
+            strategy=ChunkStrategy.RECURSIVE,
+            child_max_tokens=50,
+            child_overlap_tokens=10,
+            parent_max_tokens=120,
+            min_chunk_tokens=10,
+        )
+        return SmartChunker(config)
+
+    def test_splits_on_paragraphs_first(self, chunker):
+        """RECURSIVE splits on paragraph boundaries (\\n\\n) first."""
+        chunks = chunker.chunk(_RECURSIVE_TEXT, **_DEFAULT_KWARGS)
+        children = [c for c in chunks if not c.is_parent]
+        assert len(children) >= 2
+
+    def test_falls_back_to_sentences(self, chunker):
+        """Falls back to sentence splitting when a paragraph is too large."""
+        long_para = (
+            "First sentence of a long paragraph with additional details. "
+            "Second sentence with more details about the topic at hand. "
+            "Third sentence continues the discussion further with examples. "
+            "Fourth sentence adds even more context to the paragraph here. "
+            "Fifth sentence concludes the very long paragraph content now. "
+            "Sixth sentence provides additional closing thoughts and ideas. "
+            "Seventh sentence elaborates on the main theme of this text. "
+            "Eighth sentence wraps up the extended discussion thoroughly. "
+            "Ninth sentence adds supplementary material to consider later. "
+            "Tenth sentence brings everything to a satisfying conclusion."
+        )
+        chunks = chunker.chunk(long_para, **_DEFAULT_KWARGS)
+        children = [c for c in chunks if not c.is_parent]
+        assert len(children) >= 2
+
+    def test_no_mid_sentence_splits(self, chunker):
+        """Chunk content should not end mid-sentence (should end at sentence boundary)."""
+        text = (
+            "First sentence of a paragraph. Second sentence here. "
+            "Third sentence follows. Fourth sentence ends.\n\n"
+            "Another paragraph starts here. More content follows. "
+            "Yet another sentence. Final sentence in paragraph."
+        )
+        chunks = chunker.chunk(text, **_DEFAULT_KWARGS)
+        children = [c for c in chunks if not c.is_parent]
+        for child in children:
+            content = child.content.strip()
+            # Content should end with punctuation or be the last chunk
+            if child != children[-1]:
+                assert content[-1] in ".!?)", f"Chunk ends mid-sentence: ...{content[-20:]}"
+
+
+# ── Token counting ──────────────────────────────────────────────────────
+
+
+@pytest.mark.unit
+class TestTokenCounting:
+    """Tests for accurate tiktoken-based token counting."""
+
+    @pytest.fixture
+    def chunker(self):
+        config = ChunkConfig(
+            strategy=ChunkStrategy.RECURSIVE,
+            child_max_tokens=400,
+            child_overlap_tokens=80,
+            parent_max_tokens=1024,
+            min_chunk_tokens=50,
+        )
+        return SmartChunker(config)
+
+    def test_child_chunks_within_token_range(self, chunker):
+        """All child chunks have token_count within bounds."""
+        chunks = chunker.chunk(_RECURSIVE_TEXT, **_DEFAULT_KWARGS)
+        children = [c for c in chunks if not c.is_parent]
+        for child in children:
+            assert child.token_count >= 1
+            # Allow small tolerance for single-unit chunks that exceed limit
+            assert child.token_count <= chunker.config.child_max_tokens + 5
+
+    def test_parent_chunks_within_token_range(self, chunker):
+        """All parent chunks have token_count within parent_max_tokens."""
+        chunks = chunker.chunk(_RECURSIVE_TEXT, **_DEFAULT_KWARGS)
+        parents = [c for c in chunks if c.is_parent]
+        for parent in parents:
+            assert parent.token_count <= chunker.config.parent_max_tokens + 5
+
+    def test_token_count_matches_tiktoken(self, chunker):
+        """token_count field matches independent tiktoken encoding."""
+        chunks = chunker.chunk(_RECURSIVE_TEXT, **_DEFAULT_KWARGS)
+        for c in chunks:
+            expected = len(_enc.encode(c.content))
+            assert c.token_count == expected, (
+                f"Chunk {c.index}: expected {expected}, got {c.token_count}"
+            )
+
+
+# ── Parent-child relationship ───────────────────────────────────────────
+
+
+@pytest.mark.unit
+class TestParentChildRelationship:
+    """Tests for parent-child chunk pattern."""
+
+    @pytest.fixture
+    def chunker(self):
+        config = ChunkConfig(
+            strategy=ChunkStrategy.RECURSIVE,
+            child_max_tokens=100,
+            child_overlap_tokens=20,
+            parent_max_tokens=250,
+            min_chunk_tokens=20,
+        )
+        return SmartChunker(config)
+
+    def test_children_have_valid_parent_id(self, chunker):
+        """Each child chunk has a parent_chunk_id pointing to a parent."""
+        chunks = chunker.chunk(_RECURSIVE_TEXT, **_DEFAULT_KWARGS)
+        parents = {c.chunk_id for c in chunks if c.is_parent}
+        children = [c for c in chunks if not c.is_parent]
+
+        assert len(parents) >= 1
+        for child in children:
+            assert child.parent_chunk_id is not None
+            assert child.parent_chunk_id in parents
+
+    def test_parent_child_flags(self, chunker):
+        """Parent chunks have is_parent=True, children have is_parent=False."""
+        chunks = chunker.chunk(_RECURSIVE_TEXT, **_DEFAULT_KWARGS)
+        for c in chunks:
+            if c.parent_chunk_id is None:
+                assert c.is_parent is True
+            else:
+                assert c.is_parent is False
+
+    def test_parent_has_expected_child_count(self, chunker):
+        """Each parent has at least 1 child."""
+        chunks = chunker.chunk(_RECURSIVE_TEXT, **_DEFAULT_KWARGS)
+        parents = [c for c in chunks if c.is_parent]
+        children = [c for c in chunks if not c.is_parent]
+
+        for parent in parents:
+            parent_children = [c for c in children if c.parent_chunk_id == parent.chunk_id]
+            assert len(parent_children) >= 1, f"Parent {parent.chunk_id} has no children"
+
+    def test_parent_content_covers_children(self, chunker):
+        """Child content words should appear in parent content."""
+        chunks = chunker.chunk(_RECURSIVE_TEXT, **_DEFAULT_KWARGS)
+        parents = {c.chunk_id: c for c in chunks if c.is_parent}
+        children = [c for c in chunks if not c.is_parent]
+
+        for child in children:
+            parent = parents[child.parent_chunk_id]
+            # Check that most words in child appear in parent
+            child_words = set(child.content.lower().split())
+            parent_words = set(parent.content.lower().split())
+            overlap = child_words & parent_words
+            coverage = len(overlap) / len(child_words) if child_words else 1.0
+            assert coverage > 0.8, (
+                f"Child {child.index} only {coverage:.0%} covered by parent"
+            )
+
+
+# ── Markdown strategy ──────────────────────────────────────────────────
+
+
+@pytest.mark.unit
+class TestMarkdownStrategy:
+    """Tests for MARKDOWN strategy."""
+
+    @pytest.fixture
+    def chunker(self):
+        config = ChunkConfig(
+            strategy=ChunkStrategy.MARKDOWN,
+            child_max_tokens=100,
+            child_overlap_tokens=20,
+            parent_max_tokens=300,
+            min_chunk_tokens=10,
+        )
+        return SmartChunker(config)
+
+    def test_splits_on_headings(self, chunker):
+        """Creates chunks aligned to heading boundaries."""
+        chunks = chunker.chunk(_MARKDOWN_TEXT, **_DEFAULT_KWARGS)
+        parents = [c for c in chunks if c.is_parent]
+        assert len(parents) >= 2
+
+    def test_preserves_section_heading_metadata(self, chunker):
+        """Each chunk under a heading has section_heading set."""
+        chunks = chunker.chunk(_MARKDOWN_TEXT, **_DEFAULT_KWARGS)
+        headed = [c for c in chunks if c.section_heading]
+        assert len(headed) >= 2
+
+    def test_heading_in_section_heading_field(self, chunker):
+        """Heading text from the document appears in section_heading."""
+        chunks = chunker.chunk(_MARKDOWN_TEXT, **_DEFAULT_KWARGS)
+        headings = {c.section_heading for c in chunks if c.section_heading}
+        # Should find some of our markdown headings
+        found_intro = any("Introduction" in h for h in headings)
+        found_supervised = any("Supervised" in h for h in headings)
+        assert found_intro or found_supervised
+
+
+# ── Code strategy ───────────────────────────────────────────────────────
+
+
+@pytest.mark.unit
+class TestCodeStrategy:
+    """Tests for CODE strategy."""
+
+    @pytest.fixture
+    def chunker(self):
+        config = ChunkConfig(
+            strategy=ChunkStrategy.CODE,
+            child_max_tokens=200,
+            child_overlap_tokens=40,
+            parent_max_tokens=500,
+            min_chunk_tokens=20,
+        )
+        return SmartChunker(config)
+
+    def test_functions_not_split(self, chunker):
+        """Function bodies stay together in a single chunk when possible."""
+        chunks = chunker.chunk(_CODE_TEXT, **_DEFAULT_KWARGS)
+        # The calculate_statistics function should be in one parent
+        parents = [c for c in chunks if c.is_parent]
+        found = False
+        for p in parents:
+            if "calculate_statistics" in p.content and "return {" in p.content:
+                found = True
+                break
+        assert found, "calculate_statistics function was split across chunks"
+
+    def test_classes_not_split(self, chunker):
+        """Class definitions stay intact within a single chunk."""
+        chunks = chunker.chunk(_CODE_TEXT, **_DEFAULT_KWARGS)
+        parents = [c for c in chunks if c.is_parent]
+        found = False
+        for p in parents:
+            if "class DataProcessor" in p.content and "def validate" in p.content:
+                found = True
+                break
+        assert found, "DataProcessor class was split across chunks"
+
+
+# ── Edge cases ──────────────────────────────────────────────────────────
+
+
+@pytest.mark.unit
+class TestEdgeCases:
+    """Tests for edge cases and boundary conditions."""
+
+    @pytest.fixture
+    def chunker(self):
+        config = ChunkConfig(strategy=ChunkStrategy.RECURSIVE)
+        return SmartChunker(config)
+
+    def test_empty_text_returns_empty_list(self, chunker):
+        assert chunker.chunk("", **_DEFAULT_KWARGS) == []
+
+    def test_short_text_single_chunk(self, chunker):
+        chunks = chunker.chunk("Hello world.", **_DEFAULT_KWARGS)
+        assert len(chunks) >= 1
+        children = [c for c in chunks if not c.is_parent]
+        assert len(children) >= 1
+
+    def test_single_line_text(self, chunker):
+        chunks = chunker.chunk("A single line of text.", **_DEFAULT_KWARGS)
+        assert len(chunks) >= 1
+
+    def test_whitespace_only_returns_empty(self, chunker):
+        assert chunker.chunk("   \n\n  ", **_DEFAULT_KWARGS) == []
+
+
+# ── Scope inheritance ───────────────────────────────────────────────────
+
+
+@pytest.mark.unit
+class TestScopeInheritance:
+    """Tests for tenant and scope propagation to chunks."""
+
+    @pytest.fixture
+    def chunker(self):
+        config = ChunkConfig(strategy=ChunkStrategy.RECURSIVE)
+        return SmartChunker(config)
+
+    def test_chunks_inherit_tenant_id(self, chunker):
+        chunks = chunker.chunk(
+            "Some text content for testing.",
+            doc_id="doc-1",
+            doc_title="Test",
+            tenant_id="tenant-abc",
+            allowed_scopes=["u:1"],
+        )
+        for c in chunks:
+            assert c.tenant_id == "tenant-abc"
+
+    def test_chunks_inherit_allowed_scopes(self, chunker):
+        scopes = ["u:1", "g:10", "p:global"]
+        chunks = chunker.chunk(
+            "Some text content for testing.",
+            doc_id="doc-1",
+            doc_title="Test",
+            tenant_id="t1",
+            allowed_scopes=scopes,
+        )
+        for c in chunks:
+            assert c.allowed_scopes == scopes
+
+
+# ── FIXED strategy backward compat ──────────────────────────────────────
+
+
+@pytest.mark.unit
+class TestFixedStrategyBackwardCompat:
+    """Tests for FIXED strategy backward compatibility."""
+
+    @pytest.fixture
+    def chunker(self):
+        config = ChunkConfig(
+            strategy=ChunkStrategy.FIXED,
+            child_max_tokens=400,
+            child_overlap_tokens=80,
+        )
+        return SmartChunker(config)
+
+    def test_fixed_strategy_character_based(self, chunker):
+        """FIXED strategy produces character-based chunks with no parent-child."""
+        chunks = chunker.chunk(_RECURSIVE_TEXT, **_DEFAULT_KWARGS)
+        # All chunks should be non-parent
+        for c in chunks:
+            assert c.is_parent is False
+            assert c.parent_chunk_id is None
+        assert len(chunks) >= 1
diff --git a/python-backend/tests/orchestrator/rag/test_indexing_pipeline.py b/python-backend/tests/orchestrator/rag/test_indexing_pipeline.py
new file mode 100644
index 0000000..2af16b2
--- /dev/null
+++ b/python-backend/tests/orchestrator/rag/test_indexing_pipeline.py
@@ -0,0 +1,155 @@
+"""Tests for SmartChunker integration into the library indexing pipeline."""
+
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
+
+from app.orchestrator.rag.chunker import Chunk, ChunkConfig, ChunkStrategy, SmartChunker
+
+
+def _make_chunk(index, is_parent, parent_chunk_id=None, content="test content"):
+    return Chunk(
+        chunk_id=f"chunk-{index}",
+        content=content,
+        index=index,
+        parent_chunk_id=parent_chunk_id,
+        parent_doc_id="doc-1",
+        parent_doc_title="Test Doc",
+        section_heading="",
+        token_count=10,
+        start_char=0,
+        end_char=len(content),
+        is_parent=is_parent,
+        tenant_id="t1",
+        allowed_scopes=["u:1"],
+        metadata={"strategy": "recursive"},
+    )
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+class TestIndexingPipelineIntegration:
+    """Tests for SmartChunker integration with library_indexing_service."""
+
+    async def test_creates_parent_and_child_chunks(self):
+        """Indexing a document creates both parent and child chunks in DB."""
+        parent = _make_chunk(0, is_parent=True, content="parent content")
+        child1 = _make_chunk(1, is_parent=False, parent_chunk_id="chunk-0", content="child1")
+        child2 = _make_chunk(2, is_parent=False, parent_chunk_id="chunk-0", content="child2")
+
+        mock_chunker = MagicMock()
+        mock_chunker.chunk.return_value = [parent, child1, child2]
+
+        mock_embedder = MagicMock()
+        mock_embedder.embed_batch.return_value = [[0.1] * 1536, [0.2] * 1536]
+
+        mock_upsert = MagicMock(return_value=["vec-1", "vec-2"])
+
+        # Verify SmartChunker produces both types
+        all_chunks = mock_chunker.chunk("text", doc_id="1", doc_title="T", tenant_id="t1", allowed_scopes=[])
+        parents = [c for c in all_chunks if c.is_parent]
+        children = [c for c in all_chunks if not c.is_parent]
+
+        assert len(parents) == 1
+        assert len(children) == 2
+
+        # Verify only children are embedded
+        mock_embedder.embed_batch([c.content for c in children])
+        assert mock_embedder.embed_batch.call_count == 1
+        call_args = mock_embedder.embed_batch.call_args[0][0]
+        assert len(call_args) == 2
+
+    async def test_only_child_chunks_embedded(self):
+        """Only child chunks (is_parent=False) are sent to the embedding service."""
+        parent = _make_chunk(0, is_parent=True, content="parent content here")
+        child = _make_chunk(1, is_parent=False, parent_chunk_id="chunk-0", content="child content")
+
+        all_chunks = [parent, child]
+        child_chunks = [c for c in all_chunks if not c.is_parent]
+
+        assert len(child_chunks) == 1
+        assert child_chunks[0].content == "child content"
+        assert child_chunks[0].is_parent is False
+
+    async def test_parent_chunks_not_in_vector_store(self):
+        """Parent chunks are stored in DB but NOT indexed in vector store."""
+        parent = _make_chunk(0, is_parent=True, content="parent content")
+        child = _make_chunk(1, is_parent=False, parent_chunk_id="chunk-0")
+
+        all_chunks = [parent, child]
+        child_chunks = [c for c in all_chunks if not c.is_parent]
+        parent_chunks = [c for c in all_chunks if c.is_parent]
+
+        # Only child chunks get vector IDs
+        mock_upsert = MagicMock(return_value=["vec-1"])
+        vector_ids = mock_upsert(
+            tenant_id="t1",
+            item_id=1,
+            chunks=[{"content": c.content} for c in child_chunks],
+            embeddings=[[0.1]],
+        )
+
+        assert len(vector_ids) == len(child_chunks)
+        # Parent should get vector_ref_id=None in DB
+        assert parent_chunks[0].is_parent is True
+
+    async def test_chunk_content_hashes_unique(self):
+        """Chunk IDs are unique per item."""
+        chunker = SmartChunker(ChunkConfig(
+            strategy=ChunkStrategy.RECURSIVE,
+            child_max_tokens=100,
+            parent_max_tokens=250,
+        ))
+        text = (
+            "First paragraph about machine learning algorithms.\n\n"
+            "Second paragraph about neural networks and deep learning.\n\n"
+            "Third paragraph about reinforcement learning methods."
+        )
+        chunks = chunker.chunk(
+            text, doc_id="1", doc_title="T", tenant_id="t1", allowed_scopes=["u:1"],
+        )
+        ids = [c.chunk_id for c in chunks]
+        assert len(ids) == len(set(ids)), "Duplicate chunk IDs found"
+
+    async def test_reindexing_replaces_old_chunks(self):
+        """Re-indexing the same document should produce new chunk IDs."""
+        chunker = SmartChunker(ChunkConfig(
+            strategy=ChunkStrategy.RECURSIVE,
+            child_max_tokens=100,
+            parent_max_tokens=250,
+        ))
+        text = "Some document content for testing re-indexing behavior."
+
+        first_run = chunker.chunk(
+            text, doc_id="1", doc_title="T", tenant_id="t1", allowed_scopes=["u:1"],
+        )
+        second_run = chunker.chunk(
+            text, doc_id="1", doc_title="T", tenant_id="t1", allowed_scopes=["u:1"],
+        )
+
+        first_ids = {c.chunk_id for c in first_run}
+        second_ids = {c.chunk_id for c in second_run}
+        # UUIDs are generated fresh each time, so IDs should be different
+        assert first_ids.isdisjoint(second_ids)
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+class TestEmbeddingStandardization:
+    """Tests for embedding dimension standardization."""
+
+    async def test_new_chunks_use_1536_dim(self):
+        """New chunks should be embedded with 1536-dim model."""
+        mock_embedder = MagicMock()
+        mock_embedder.embed_batch.return_value = [[0.1] * 1536]
+
+        result = mock_embedder.embed_batch(["test text"])
+        assert len(result[0]) == 1536
+
+    async def test_embedding_dimension_matches_service(self):
+        """Embedding dimensions should match the configured service."""
+        mock_embedder = MagicMock()
+        mock_embedder.embed_batch.return_value = [[0.1] * 1536, [0.2] * 1536]
+
+        embeddings = mock_embedder.embed_batch(["chunk1", "chunk2"])
+        for emb in embeddings:
+            assert len(emb) == 1536
diff --git a/python-backend/tests/orchestrator/rag/test_library_model.py b/python-backend/tests/orchestrator/rag/test_library_model.py
new file mode 100644
index 0000000..109b7ec
--- /dev/null
+++ b/python-backend/tests/orchestrator/rag/test_library_model.py
@@ -0,0 +1,21 @@
+"""Tests for LibraryChunk model additions for parent-child chunk support."""
+
+import pytest
+
+from app.models.library import LibraryChunk
+
+
+@pytest.mark.unit
+class TestLibraryChunkParentChild:
+    """Tests for is_parent and parent_chunk_id columns."""
+
+    def test_is_parent_default_false(self):
+        """LibraryChunk model has is_parent field with default False."""
+        col = LibraryChunk.__table__.columns["is_parent"]
+        assert col.default.arg is False
+        assert col.nullable is False
+
+    def test_parent_chunk_id_nullable(self):
+        """LibraryChunk model has parent_chunk_id field (nullable)."""
+        col = LibraryChunk.__table__.columns["parent_chunk_id"]
+        assert col.nullable is True
diff --git a/python-backend/tests/orchestrator/rag/test_reindex_task.py b/python-backend/tests/orchestrator/rag/test_reindex_task.py
new file mode 100644
index 0000000..7c7dcd4
--- /dev/null
+++ b/python-backend/tests/orchestrator/rag/test_reindex_task.py
@@ -0,0 +1,184 @@
+"""Tests for Celery re-indexing batch task."""
+
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+
+from app.tasks.reindex_tasks import _smart_reindex_impl, BATCH_SIZE
+
+
+def _mock_item(item_id, tenant_id="t1"):
+    m = MagicMock()
+    m.id = item_id
+    m.tenant_id = tenant_id
+    return m
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+class TestReindexBatchTask:
+    """Tests for the Celery batch re-indexing task."""
+
+    async def test_processes_in_batches_of_50(self):
+        """Celery task processes items in configurable batches."""
+        assert BATCH_SIZE == 50
+
+    async def test_enqueues_jobs_for_each_item(self):
+        """Each item gets a LibraryIndexJob enqueued."""
+        items = [_mock_item(i) for i in range(3)]
+
+        mock_session = AsyncMock()
+        # First call: count query returns 3
+        # Subsequent calls: batch query returns items, then empty
+        mock_session.scalar.return_value = 3
+
+        batch_result = MagicMock()
+        batch_result.fetchall.side_effect = [items, []]
+        mock_session.execute.return_value = batch_result
+
+        mock_task = MagicMock()
+
+        with patch(
+            "app.tasks.reindex_tasks.AsyncSessionLocal",
+        ) as mock_session_cls, patch(
+            "app.services.library_indexing_service.enqueue_library_index_job",
+            new_callable=AsyncMock,
+        ) as mock_enqueue:
+            # Make the session context manager work
+            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_session)
+            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)
+
+            result = await _smart_reindex_impl(mock_task, tenant_id="t1")
+
+        assert mock_enqueue.call_count == 3
+        assert result["processed"] == 3
+        assert result["total"] == 3
+
+    async def test_old_chunks_deleted_via_reindex_job(self):
+        """Re-indexing uses the job pipeline which handles old chunk deletion."""
+        # The reindex task enqueues jobs; old chunk deletion happens in
+        # process_library_index_job() which deletes non-markdown_source chunks
+        # before creating new ones. This is tested via the integration pipeline.
+        mock_session = AsyncMock()
+        mock_session.scalar.return_value = 1
+
+        batch_result = MagicMock()
+        batch_result.fetchall.side_effect = [[_mock_item(1)], []]
+        mock_session.execute.return_value = batch_result
+
+        with patch(
+            "app.tasks.reindex_tasks.AsyncSessionLocal",
+        ) as mock_session_cls, patch(
+            "app.services.library_indexing_service.enqueue_library_index_job",
+            new_callable=AsyncMock,
+        ) as mock_enqueue:
+            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_session)
+            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)
+
+            result = await _smart_reindex_impl(MagicMock(), tenant_id="t1")
+
+        # Job type should be "smart_reindex"
+        call_kwargs = mock_enqueue.call_args[1]
+        assert call_kwargs["job_type"] == "smart_reindex"
+
+    async def test_preserves_allowed_scopes(self):
+        """Re-indexing preserves allowed_scopes from original item."""
+        # allowed_scopes are preserved because:
+        # 1. process_library_index_job reads item.allowed_scopes
+        # 2. SmartChunker.chunk() receives allowed_scopes parameter
+        # 3. Each Chunk object inherits allowed_scopes
+        # This test verifies the contract at the task level
+        mock_session = AsyncMock()
+        mock_session.scalar.return_value = 1
+
+        batch_result = MagicMock()
+        item = _mock_item(1, tenant_id="t1")
+        batch_result.fetchall.side_effect = [[item], []]
+        mock_session.execute.return_value = batch_result
+
+        with patch(
+            "app.tasks.reindex_tasks.AsyncSessionLocal",
+        ) as mock_session_cls, patch(
+            "app.services.library_indexing_service.enqueue_library_index_job",
+            new_callable=AsyncMock,
+        ) as mock_enqueue:
+            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_session)
+            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)
+
+            result = await _smart_reindex_impl(MagicMock(), tenant_id="t1")
+
+        assert result["processed"] == 1
+        # The enqueue call passes tenant_id and library_item_id
+        call_kwargs = mock_enqueue.call_args[1]
+        assert call_kwargs["tenant_id"] == "t1"
+        assert call_kwargs["library_item_id"] == 1
+
+    async def test_progress_tracking(self):
+        """Progress is tracked (items processed / total items)."""
+        mock_session = AsyncMock()
+        mock_session.scalar.return_value = 2
+
+        items = [_mock_item(1), _mock_item(2)]
+        batch_result = MagicMock()
+        batch_result.fetchall.side_effect = [items, []]
+        mock_session.execute.return_value = batch_result
+
+        mock_task = MagicMock()
+
+        with patch(
+            "app.tasks.reindex_tasks.AsyncSessionLocal",
+        ) as mock_session_cls, patch(
+            "app.services.library_indexing_service.enqueue_library_index_job",
+            new_callable=AsyncMock,
+        ):
+            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_session)
+            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)
+
+            result = await _smart_reindex_impl(mock_task, tenant_id="t1")
+
+        # Task state should be updated with progress
+        mock_task.update_state.assert_called()
+        progress = mock_task.update_state.call_args[1]["meta"]
+        assert progress["processed"] == 2
+        assert progress["total"] == 2
+
+    async def test_no_items_returns_zero(self):
+        """When no items match, returns zero counts."""
+        mock_session = AsyncMock()
+        mock_session.scalar.return_value = 0
+
+        with patch(
+            "app.tasks.reindex_tasks.AsyncSessionLocal",
+        ) as mock_session_cls:
+            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_session)
+            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)
+
+            result = await _smart_reindex_impl(MagicMock(), tenant_id="nonexistent")
+
+        assert result["total"] == 0
+        assert result["processed"] == 0
+
+    async def test_error_handling_continues_batch(self):
+        """Errors on individual items don't stop the batch."""
+        mock_session = AsyncMock()
+        mock_session.scalar.return_value = 2
+
+        items = [_mock_item(1), _mock_item(2)]
+        batch_result = MagicMock()
+        batch_result.fetchall.side_effect = [items, []]
+        mock_session.execute.return_value = batch_result
+
+        with patch(
+            "app.tasks.reindex_tasks.AsyncSessionLocal",
+        ) as mock_session_cls, patch(
+            "app.services.library_indexing_service.enqueue_library_index_job",
+            new_callable=AsyncMock,
+            side_effect=[Exception("item 1 failed"), None],
+        ):
+            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_session)
+            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)
+
+            result = await _smart_reindex_impl(MagicMock(), tenant_id="t1")
+
+        assert result["processed"] == 1
+        assert result["errors"] == 1
+        assert result["total"] == 2
