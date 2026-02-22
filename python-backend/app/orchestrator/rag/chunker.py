"""Smart token-based, strategy-aware document chunker with parent-child pattern.

Provides SmartChunker which replaces legacy fixed-character chunking with:
- Token-accurate splitting via tiktoken (cl100k_base)
- Strategy-aware splitting (recursive, markdown, code, fixed)
- Parent-child chunk pattern for retrieval precision + LLM context
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from enum import Enum
import structlog
import tiktoken

logger = structlog.get_logger()

# Shared encoder — cached at module level by tiktoken
_encoder = tiktoken.get_encoding("cl100k_base")


class ChunkStrategy(str, Enum):
    FIXED = "fixed"  # Legacy backward-compat (character-based)
    RECURSIVE = "recursive"  # Default: paragraph > line > sentence > word
    MARKDOWN = "markdown"  # Split by headings, preserve structure
    CODE = "code"  # Split by function/class boundaries
    SEMANTIC = "semantic"  # Future: split by embedding similarity


@dataclass
class ChunkConfig:
    strategy: ChunkStrategy = ChunkStrategy.RECURSIVE
    child_max_tokens: int = 400
    child_overlap_tokens: int = 80
    parent_max_tokens: int = 1024
    min_chunk_tokens: int = 50


@dataclass
class Chunk:
    chunk_id: str
    content: str
    index: int
    parent_chunk_id: str | None
    parent_doc_id: str
    parent_doc_title: str
    section_heading: str
    token_count: int
    start_char: int
    end_char: int
    is_parent: bool
    tenant_id: str
    allowed_scopes: list[str]
    metadata: dict = field(default_factory=dict)


class SmartChunker:
    """Token-based, strategy-aware chunker with parent-child pattern."""

    def __init__(self, config: ChunkConfig | None = None):
        self.config = config or ChunkConfig()

    @staticmethod
    def detect_strategy(text: str) -> ChunkStrategy:
        """Auto-detect the best chunking strategy from content."""
        sample = text[:500]

        if re.search(r"^#{1,6}\s", sample, re.MULTILINE):
            return ChunkStrategy.MARKDOWN

        code_markers = ["def ", "class ", "function ", "async function "]
        if sum(sample.count(m) for m in code_markers) >= 2:
            return ChunkStrategy.CODE

        return ChunkStrategy.RECURSIVE

    def _count_tokens(self, text: str) -> int:
        return len(_encoder.encode(text))

    def chunk(
        self,
        text: str,
        doc_id: str,
        doc_title: str,
        tenant_id: str,
        allowed_scopes: list[str],
        strategy: ChunkStrategy | None = None,
    ) -> list[Chunk]:
        """Split text into parent and child chunks.

        Args:
            text: Document content to chunk.
            doc_id: Source document ID.
            doc_title: Source document title.
            tenant_id: Tenant context (inherited by all chunks).
            allowed_scopes: Access scopes (inherited by all chunks).
            strategy: Explicit strategy override. If None, uses config or auto-detects.

        Returns:
            List of Chunk objects (parents and children interleaved).
        """
        if not text or not text.strip():
            return []

        # Resolve effective strategy
        if strategy is not None:
            effective = strategy
        elif self.config.strategy != ChunkStrategy.RECURSIVE:
            effective = self.config.strategy
        else:
            effective = self.detect_strategy(text)

        if effective == ChunkStrategy.FIXED:
            return self._fixed_split(text, doc_id, doc_title, tenant_id, allowed_scopes)

        # Strategy-specific section extraction
        if effective == ChunkStrategy.MARKDOWN:
            sections = self._markdown_sections(text)
        elif effective == ChunkStrategy.CODE:
            sections = self._code_sections(text)
        else:
            sections = [("", text)]

        return self._build_parent_child(
            sections, text, doc_id, doc_title, tenant_id, allowed_scopes, effective,
        )

    # ── Recursive text splitting ────────────────────────────────────────

    def _split_recursive(self, text: str, max_tokens: int) -> list[str]:
        """Recursively split text respecting natural boundaries.

        Tries separators in order: paragraph > line > sentence > word.
        """
        if self._count_tokens(text) <= max_tokens:
            return [text]

        for sep in ["\n\n", "\n", ". ", " "]:
            parts = text.split(sep)
            if len(parts) <= 1:
                continue

            segments: list[str] = []
            current = parts[0]

            for part in parts[1:]:
                joiner = sep if sep != ". " else ". "
                candidate = current + joiner + part
                if self._count_tokens(candidate) > max_tokens:
                    if current.strip():
                        segments.append(current)
                    current = part
                else:
                    current = candidate

            if current.strip():
                segments.append(current)

            # Recursively handle any still-oversized segments
            result: list[str] = []
            for seg in segments:
                if self._count_tokens(seg) > max_tokens:
                    result.extend(self._split_recursive(seg, max_tokens))
                else:
                    result.append(seg)

            if len(result) > 1:
                return result

        # Fallback: return as-is
        return [text]

    # ── Strategy-specific section extractors ─────────────────────────────

    def _markdown_sections(self, text: str) -> list[tuple[str, str]]:
        """Split markdown by heading boundaries."""
        heading_re = re.compile(r"^(#{1,6}\s+.+)$", re.MULTILINE)
        positions = [
            (m.start(), m.end(), m.group(1).strip())
            for m in heading_re.finditer(text)
        ]

        if not positions:
            return [("", text)]

        sections: list[tuple[str, str]] = []

        # Content before first heading
        if positions[0][0] > 0:
            pre = text[: positions[0][0]].strip()
            if pre:
                sections.append(("", pre))

        for i, (start, end, heading) in enumerate(positions):
            next_start = positions[i + 1][0] if i + 1 < len(positions) else len(text)
            body = text[end:next_start].strip()
            # Include heading in content for LLM context
            full_content = f"{heading}\n{body}" if body else heading
            sections.append((heading, full_content))

        return sections

    def _code_sections(self, text: str) -> list[tuple[str, str]]:
        """Split on function/class definition boundaries."""
        boundary_re = re.compile(
            r"^(?=(?:(?:async\s+)?def\s|class\s|(?:async\s+)?function\s|"
            r"export\s+(?:default\s+)?(?:function|class)\s))",
            re.MULTILINE,
        )
        splits = list(boundary_re.finditer(text))

        if not splits:
            return [("", text)]

        sections: list[tuple[str, str]] = []

        # Preamble before first definition
        if splits[0].start() > 0:
            pre = text[: splits[0].start()].strip()
            if pre:
                sections.append(("", pre))

        for i, m in enumerate(splits):
            next_start = splits[i + 1].start() if i + 1 < len(splits) else len(text)
            chunk_text = text[m.start() : next_start].rstrip()
            first_line = chunk_text.split("\n")[0].rstrip(":").strip()
            sections.append((first_line, chunk_text))

        return sections

    # ── Parent-child builder ─────────────────────────────────────────────

    def _build_parent_child(
        self,
        sections: list[tuple[str, str]],
        full_text: str,
        doc_id: str,
        doc_title: str,
        tenant_id: str,
        allowed_scopes: list[str],
        strategy: ChunkStrategy,
    ) -> list[Chunk]:
        all_chunks: list[Chunk] = []
        idx = 0

        # Ensure each section fits within parent_max_tokens
        expanded: list[tuple[str, str]] = []
        for heading, content in sections:
            if self._count_tokens(content) > self.config.parent_max_tokens:
                subs = self._split_recursive(content, self.config.parent_max_tokens)
                for s in subs:
                    expanded.append((heading, s.strip()))
            else:
                expanded.append((heading, content))

        # Group small adjacent sections into parent-sized windows
        groups: list[list[tuple[str, str]]] = []
        current_group: list[tuple[str, str]] = []
        current_tokens = 0

        for heading, content in expanded:
            ct = self._count_tokens(content)
            if current_group and current_tokens + ct > self.config.parent_max_tokens:
                groups.append(current_group)
                current_group = [(heading, content)]
                current_tokens = ct
            else:
                current_group.append((heading, content))
                current_tokens += ct

        if current_group:
            groups.append(current_group)

        # Build parent + child chunks for each group
        for group in groups:
            parent_content = "\n\n".join(c for _, c in group)
            heading = next((h for h, _ in group if h), "")
            parent_id = str(uuid.uuid4())

            # Approximate start position in original text
            search_key = group[0][1][:80] if group[0][1] else ""
            start_pos = full_text.find(search_key) if search_key else 0
            if start_pos < 0:
                start_pos = 0

            parent_token_count = self._count_tokens(parent_content)

            parent = Chunk(
                chunk_id=parent_id,
                content=parent_content,
                index=idx,
                parent_chunk_id=None,
                parent_doc_id=doc_id,
                parent_doc_title=doc_title,
                section_heading=heading,
                token_count=parent_token_count,
                start_char=start_pos,
                end_char=start_pos + len(parent_content),
                is_parent=True,
                tenant_id=tenant_id,
                allowed_scopes=allowed_scopes,
                metadata={"strategy": strategy.value},
            )
            all_chunks.append(parent)
            idx += 1

            children = self._make_children(
                parent_content, parent_id, heading, start_pos,
                doc_id, doc_title, tenant_id, allowed_scopes, strategy, idx,
            )
            all_chunks.extend(children)
            idx += len(children)

        return all_chunks

    # ── Child chunk creation with overlap ────────────────────────────────

    def _split_to_units(self, text: str) -> list[str]:
        """Split text into sentence-level natural units."""
        units: list[str] = []
        for para in text.split("\n\n"):
            para = para.strip()
            if not para:
                continue
            # Split on line breaks first
            for line in para.split("\n"):
                line = line.strip()
                if not line:
                    continue
                # Split on sentence boundaries
                sentences = re.split(r"(?<=[.!?])\s+", line)
                if len(sentences) > 1:
                    units.extend(s.strip() for s in sentences if s.strip())
                else:
                    units.append(line)
        return units

    def _make_children(
        self,
        parent_content: str,
        parent_id: str,
        heading: str,
        parent_start: int,
        doc_id: str,
        doc_title: str,
        tenant_id: str,
        allowed_scopes: list[str],
        strategy: ChunkStrategy,
        start_idx: int,
    ) -> list[Chunk]:
        """Create overlapping child chunks from parent content."""
        parent_tokens = self._count_tokens(parent_content)

        if parent_tokens <= self.config.child_max_tokens:
            return [
                Chunk(
                    chunk_id=str(uuid.uuid4()),
                    content=parent_content.strip(),
                    index=start_idx,
                    parent_chunk_id=parent_id,
                    parent_doc_id=doc_id,
                    parent_doc_title=doc_title,
                    section_heading=heading,
                    token_count=parent_tokens,
                    start_char=parent_start,
                    end_char=parent_start + len(parent_content),
                    is_parent=False,
                    tenant_id=tenant_id,
                    allowed_scopes=allowed_scopes,
                    metadata={"strategy": strategy.value},
                )
            ]

        units = self._split_to_units(parent_content)
        if not units:
            return []

        unit_tokens = [self._count_tokens(u) for u in units]

        children: list[Chunk] = []
        window_start = 0

        while window_start < len(units):
            # Fill window up to child_max_tokens
            window_end = window_start
            accumulated = 0
            while window_end < len(units):
                if accumulated + unit_tokens[window_end] > self.config.child_max_tokens and window_end > window_start:
                    break
                accumulated += unit_tokens[window_end]
                window_end += 1

            if window_end == window_start:
                # Single oversized unit — include it anyway
                window_end = window_start + 1

            content = " ".join(units[window_start:window_end]).strip()
            if not content:
                window_start = window_end
                continue

            tok_count = self._count_tokens(content)

            # Merge too-small trailing chunks with previous
            if tok_count < self.config.min_chunk_tokens and children:
                prev = children[-1]
                merged = prev.content + " " + content
                children[-1] = Chunk(
                    chunk_id=prev.chunk_id,
                    content=merged,
                    index=prev.index,
                    parent_chunk_id=parent_id,
                    parent_doc_id=doc_id,
                    parent_doc_title=doc_title,
                    section_heading=heading,
                    token_count=self._count_tokens(merged),
                    start_char=prev.start_char,
                    end_char=parent_start + len(parent_content),
                    is_parent=False,
                    tenant_id=tenant_id,
                    allowed_scopes=allowed_scopes,
                    metadata={"strategy": strategy.value},
                )
                window_start = window_end
                continue

            # Approximate character position
            child_start_offset = sum(len(units[k]) + 1 for k in range(window_start))

            children.append(
                Chunk(
                    chunk_id=str(uuid.uuid4()),
                    content=content,
                    index=start_idx + len(children),
                    parent_chunk_id=parent_id,
                    parent_doc_id=doc_id,
                    parent_doc_title=doc_title,
                    section_heading=heading,
                    token_count=tok_count,
                    start_char=parent_start + child_start_offset,
                    end_char=parent_start + child_start_offset + len(content),
                    is_parent=False,
                    tenant_id=tenant_id,
                    allowed_scopes=allowed_scopes,
                    metadata={"strategy": strategy.value},
                )
            )

            # Compute next window_start with overlap
            overlap = 0
            next_start = window_end
            for k in range(window_end - 1, window_start, -1):
                if overlap + unit_tokens[k] > self.config.child_overlap_tokens:
                    break
                overlap += unit_tokens[k]
                next_start = k

            if next_start <= window_start:
                next_start = window_start + 1

            window_start = next_start

        return children

    # ── FIXED strategy (backward compatibility) ──────────────────────────

    def _fixed_split(
        self,
        text: str,
        doc_id: str,
        doc_title: str,
        tenant_id: str,
        allowed_scopes: list[str],
    ) -> list[Chunk]:
        """Legacy character-based splitting. No parent-child pattern."""
        # ~4 chars per token
        max_chars = self.config.child_max_tokens * 4
        overlap_chars = self.config.child_overlap_tokens * 4

        normalized = " ".join(text.split())
        if not normalized:
            return []

        chunks: list[Chunk] = []
        cursor = 0
        idx = 0

        while cursor < len(normalized):
            end = min(cursor + max_chars, len(normalized))
            if end < len(normalized):
                sp = normalized.rfind(" ", cursor, end)
                if sp > cursor + 32:
                    end = sp

            content = normalized[cursor:end].strip()
            if content:
                chunks.append(
                    Chunk(
                        chunk_id=str(uuid.uuid4()),
                        content=content,
                        index=idx,
                        parent_chunk_id=None,
                        parent_doc_id=doc_id,
                        parent_doc_title=doc_title,
                        section_heading="",
                        token_count=self._count_tokens(content),
                        start_char=cursor,
                        end_char=cursor + len(content),
                        is_parent=False,
                        tenant_id=tenant_id,
                        allowed_scopes=allowed_scopes,
                        metadata={"strategy": "fixed"},
                    )
                )
                idx += 1

            cursor = end - overlap_chars if end < len(normalized) else end

        return chunks
