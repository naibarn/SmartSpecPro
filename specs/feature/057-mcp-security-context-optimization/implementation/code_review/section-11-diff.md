diff --git a/python-backend/app/orchestrator/rag/hybrid_rag.py b/python-backend/app/orchestrator/rag/hybrid_rag.py
index 61629366..3192fd59 100644
--- a/python-backend/app/orchestrator/rag/hybrid_rag.py
+++ b/python-backend/app/orchestrator/rag/hybrid_rag.py
@@ -233,6 +233,30 @@ class RAGConfig:
             self.query_strategy = _QS.PASSTHROUGH
 
 
+# ==================== DEDUPLICATION ====================
+
+
+def deduplicate_chunks(chunks: list[Document]) -> list[Document]:
+    """Remove near-duplicate chunks based on content hash.
+
+    Chunks must be pre-sorted by score descending so that the first occurrence
+    of each content hash is the highest-scored duplicate.
+
+    Uses MD5 on normalized (strip + lowercase) content for fast dedup.
+    MD5 is not used for cryptographic purposes here — collision resistance
+    is not a concern for deduplication of natural-language text chunks.
+    """
+    seen_hashes: set[str] = set()
+    deduped: list[Document] = []
+    for chunk in chunks:
+        content = chunk.content.strip().lower()
+        content_hash = hashlib.md5(content.encode()).hexdigest()
+        if content_hash not in seen_hashes:
+            seen_hashes.add(content_hash)
+            deduped.append(chunk)
+    return deduped
+
+
 # ==================== HYBRID RAG ENGINE ====================
 
 class HybridRAGEngine:
@@ -530,10 +554,10 @@ class HybridRAGEngine:
                     (rerank_end - rerank_start).total_seconds() * 1000
                 )
                 
-                result.documents = reranked_docs[:top_k]
+                result.documents = deduplicate_chunks(reranked_docs)[:top_k]
             else:
-                result.documents = combined_docs[:top_k]
-            
+                result.documents = deduplicate_chunks(combined_docs)[:top_k]
+
             result.final_count = len(result.documents)
             
             # Calculate total time
diff --git a/python-backend/app/services/agency_few_shot.py b/python-backend/app/services/agency_few_shot.py
index f1d1886d..df66b9cc 100644
--- a/python-backend/app/services/agency_few_shot.py
+++ b/python-backend/app/services/agency_few_shot.py
@@ -3,10 +3,24 @@ Few-Shot Examples & Shared Instructions for Agency Agents.
 
 Pure functions for prepending example conversations and shared instructions
 into agent message histories and instructions at runtime.
+
+Includes embedding-based relevance filtering: when an agent has >3 examples,
+the current task is embedded and the top-k most similar examples are selected.
 """
 
 from __future__ import annotations
 
+import logging
+from collections import OrderedDict
+
+import numpy as np
+
+logger = logging.getLogger(__name__)
+
+# In-process cache: content-hash → embedding vector. FIFO eviction at max size.
+_example_embedding_cache: OrderedDict[int, list[float]] = OrderedDict()
+_CACHE_MAX_SIZE = 200
+
 FRAMING_START = "The following are example interactions for reference only:"
 FRAMING_END = "End of examples. Now respond to the actual user message:"
 
@@ -49,6 +63,53 @@ def prepend_examples(
     return example_messages + list(history)
 
 
+async def select_relevant_examples(
+    examples: list[dict],
+    task_text: str,
+    top_k: int = 3,
+) -> list[dict]:
+    """Select the most relevant few-shot examples for a task via cosine similarity.
+
+    When the number of examples is <= top_k, all examples are returned unchanged
+    (no embedding calls). When >top_k, each example's ``user_message`` (or ``input``)
+    field is embedded and compared against the task embedding. The top_k most
+    similar examples are returned.
+
+    Falls back to the first top_k examples if the embedding service raises.
+    """
+    if len(examples) <= top_k:
+        return examples
+
+    try:
+        from app.orchestrator.vector_store.embedding_service import EmbeddingService
+
+        service = EmbeddingService()
+        task_embedding = await service.embed(task_text)
+
+        scored: list[tuple[float, dict]] = []
+        for ex in examples:
+            ex_text = ex.get("user_message", "") or ex.get("input", "")
+            cache_key = hash(ex_text)
+            if cache_key not in _example_embedding_cache:
+                _example_embedding_cache[cache_key] = await service.embed(ex_text)
+                # FIFO eviction
+                if len(_example_embedding_cache) > _CACHE_MAX_SIZE:
+                    _example_embedding_cache.popitem(last=False)
+            ex_embedding = _example_embedding_cache[cache_key]
+
+            # Cosine similarity
+            dot = float(np.dot(task_embedding, ex_embedding))
+            norm = float(np.linalg.norm(task_embedding) * np.linalg.norm(ex_embedding))
+            similarity = dot / norm if norm > 0 else 0.0
+            scored.append((similarity, ex))
+
+        scored.sort(key=lambda x: x[0], reverse=True)
+        return [ex for _, ex in scored[:top_k]]
+    except Exception:
+        logger.warning("few_shot_relevance_fallback", exc_info=True)
+        return examples[:top_k]
+
+
 def prepend_shared_instructions(
     agent_instructions: str,
     shared_instructions: str | None,
diff --git a/python-backend/tests/unit/rag/__init__.py b/python-backend/tests/unit/rag/__init__.py
new file mode 100644
index 00000000..e69de29b
diff --git a/python-backend/tests/unit/rag/test_rag_dedup.py b/python-backend/tests/unit/rag/test_rag_dedup.py
new file mode 100644
index 00000000..a8121859
--- /dev/null
+++ b/python-backend/tests/unit/rag/test_rag_dedup.py
@@ -0,0 +1,88 @@
+"""Tests for RAG content-hash deduplication in hybrid_rag.py."""
+
+from __future__ import annotations
+
+import pytest
+
+from app.orchestrator.rag.hybrid_rag import Document, deduplicate_chunks
+
+
+def _make_doc(content: str, score: float, doc_id: str = "") -> Document:
+    doc = Document(content=content)
+    doc.final_score = score
+    if doc_id:
+        doc.doc_id = doc_id
+    return doc
+
+
+class TestDeduplicateChunks:
+    def test_duplicate_chunks_removed_highest_score_kept(self):
+        """Duplicate chunks should be removed, keeping the highest-scored one."""
+        chunks = [
+            _make_doc("The quick brown fox", 0.9, "a"),
+            _make_doc("Some other content", 0.85, "b"),
+            _make_doc("The quick brown fox", 0.8, "c"),  # duplicate of 'a'
+        ]
+
+        result = deduplicate_chunks(chunks)
+
+        assert len(result) == 2
+        # The higher-scored duplicate should be kept
+        result_ids = [d.doc_id for d in result]
+        assert "a" in result_ids
+        assert "c" not in result_ids
+
+    def test_near_duplicate_via_content_hash(self):
+        """Near-duplicates (same content after normalization) should be deduped."""
+        chunks = [
+            _make_doc("The quick brown fox", 0.9, "a"),
+            _make_doc("  The Quick Brown Fox  ", 0.8, "b"),  # same after strip+lower
+        ]
+
+        result = deduplicate_chunks(chunks)
+
+        assert len(result) == 1
+        assert result[0].doc_id == "a"
+        assert result[0].final_score == 0.9
+
+    def test_different_content_chunks_preserved(self):
+        """Chunks with unique content should all be preserved."""
+        chunks = [
+            _make_doc("Alpha content", 0.9, "a"),
+            _make_doc("Beta content", 0.8, "b"),
+            _make_doc("Gamma content", 0.7, "c"),
+            _make_doc("Delta content", 0.6, "d"),
+            _make_doc("Epsilon content", 0.5, "e"),
+        ]
+
+        result = deduplicate_chunks(chunks)
+
+        assert len(result) == 5
+
+    def test_dedup_preserves_ranking_order(self):
+        """After dedup, chunks should still be sorted by score descending."""
+        chunks = [
+            _make_doc("Content A", 0.95, "a"),
+            _make_doc("Content B", 0.90, "b"),
+            _make_doc("Content A", 0.85, "c"),  # dup of 'a'
+            _make_doc("Content C", 0.80, "d"),
+            _make_doc("Content B", 0.75, "e"),  # dup of 'b'
+        ]
+
+        result = deduplicate_chunks(chunks)
+
+        assert len(result) == 3
+        scores = [d.final_score for d in result]
+        assert scores == sorted(scores, reverse=True)
+
+    def test_empty_input(self):
+        """Empty input should return empty output."""
+        result = deduplicate_chunks([])
+        assert result == []
+
+    def test_single_chunk(self):
+        """Single chunk should pass through."""
+        chunks = [_make_doc("Solo content", 0.9, "a")]
+        result = deduplicate_chunks(chunks)
+        assert len(result) == 1
+        assert result[0].doc_id == "a"
diff --git a/python-backend/tests/unit/services/test_few_shot_relevance.py b/python-backend/tests/unit/services/test_few_shot_relevance.py
new file mode 100644
index 00000000..f0ff6c84
--- /dev/null
+++ b/python-backend/tests/unit/services/test_few_shot_relevance.py
@@ -0,0 +1,152 @@
+"""Tests for few-shot relevance filtering in agency_few_shot.py."""
+
+from __future__ import annotations
+
+import pytest
+from unittest.mock import AsyncMock, patch
+import numpy as np
+
+from app.services.agency_few_shot import select_relevant_examples, _example_embedding_cache
+
+EMBED_SVC = "app.orchestrator.vector_store.embedding_service.EmbeddingService"
+
+
+@pytest.fixture(autouse=True)
+def clear_cache():
+    """Clear the embedding cache before each test."""
+    _example_embedding_cache.clear()
+    yield
+    _example_embedding_cache.clear()
+
+
+def _make_example(text: str) -> dict:
+    return {"user_message": text, "assistant_response": f"Response to {text}"}
+
+
+def _make_embedding(seed: int, dim: int = 8) -> list[float]:
+    """Create a deterministic unit-norm embedding from a seed."""
+    rng = np.random.RandomState(seed)
+    vec = rng.randn(dim).astype(float)
+    vec = vec / np.linalg.norm(vec)
+    return vec.tolist()
+
+
+@pytest.mark.asyncio
+async def test_few_examples_pass_through_unchanged():
+    """<=3 examples should pass through unchanged without calling embedding service."""
+    examples = [_make_example("Hello"), _make_example("World")]
+
+    with patch(EMBED_SVC) as mock_cls:
+        result = await select_relevant_examples(examples, "any task")
+
+    assert result == examples
+    assert len(result) == 2
+    mock_cls.assert_not_called()
+
+
+@pytest.mark.asyncio
+async def test_exactly_three_examples_pass_through():
+    """Exactly 3 examples should pass through without filtering."""
+    examples = [_make_example(f"ex-{i}") for i in range(3)]
+
+    with patch(EMBED_SVC) as mock_cls:
+        result = await select_relevant_examples(examples, "task text")
+
+    assert result == examples
+    mock_cls.assert_not_called()
+
+
+@pytest.mark.asyncio
+async def test_more_than_three_filtered_to_top_three():
+    """>3 examples should be filtered to top 3 by cosine similarity."""
+    examples = [
+        _make_example("Solve this math equation: 2x + 3 = 7"),
+        _make_example("Write a creative story about a dragon"),
+        _make_example("Write a Python function to sort a list"),
+        _make_example("Design a logo for a bakery"),
+        _make_example("Create a sales pitch for insurance"),
+        _make_example("Recipe for chocolate cake"),
+    ]
+    task = "Write a Python function to sort a list"
+
+    task_emb = _make_embedding(42)
+    embeddings = {
+        "Solve this math equation: 2x + 3 = 7": _make_embedding(1),
+        "Write a creative story about a dragon": _make_embedding(2),
+        "Write a Python function to sort a list": task_emb,  # Exact match
+        "Design a logo for a bakery": _make_embedding(4),
+        "Create a sales pitch for insurance": _make_embedding(5),
+        "Recipe for chocolate cake": _make_embedding(6),
+    }
+
+    mock_service = AsyncMock()
+
+    async def mock_embed(text: str) -> list[float]:
+        if text in embeddings:
+            return embeddings[text]
+        return task_emb
+
+    mock_service.embed = mock_embed
+
+    with patch(EMBED_SVC, return_value=mock_service):
+        result = await select_relevant_examples(examples, task, top_k=3)
+
+    assert len(result) == 3
+    result_texts = [ex["user_message"] for ex in result]
+    assert "Write a Python function to sort a list" in result_texts
+
+
+@pytest.mark.asyncio
+async def test_embedding_cache_prevents_redundant_calls():
+    """Embedding cache should prevent re-embedding the same example text."""
+    examples = [_make_example(f"example-{i}") for i in range(5)]
+
+    call_count = {"embed": 0}
+
+    async def counting_embed(text: str) -> list[float]:
+        call_count["embed"] += 1
+        return _make_embedding(hash(text) % 1000)
+
+    mock_service = AsyncMock()
+    mock_service.embed = counting_embed
+
+    with patch(EMBED_SVC, return_value=mock_service):
+        # First call: 5 examples + 1 task = 6 embed calls
+        await select_relevant_examples(examples, "task one", top_k=3)
+        first_count = call_count["embed"]
+        assert first_count == 6  # 5 examples + 1 task
+
+        # Second call with SAME examples but different task:
+        # Should only embed the new task (1 call), examples are cached
+        await select_relevant_examples(examples, "task two", top_k=3)
+        second_count = call_count["embed"] - first_count
+        assert second_count == 1  # Only the new task text
+
+
+@pytest.mark.asyncio
+async def test_embedding_failure_falls_back_to_first_three():
+    """If embedding service fails, fall back to returning first 3 examples."""
+    examples = [_make_example(f"ex-{i}") for i in range(6)]
+
+    mock_service = AsyncMock()
+    mock_service.embed = AsyncMock(side_effect=RuntimeError("API error"))
+
+    with patch(EMBED_SVC, return_value=mock_service):
+        result = await select_relevant_examples(examples, "some task", top_k=3)
+
+    assert len(result) == 3
+    assert result == examples[:3]
+
+
+@pytest.mark.asyncio
+async def test_custom_top_k():
+    """Custom top_k should return that many examples."""
+    examples = [_make_example(f"ex-{i}") for i in range(10)]
+
+    mock_service = AsyncMock()
+    mock_service.embed = AsyncMock(return_value=_make_embedding(1))
+
+    with patch(EMBED_SVC, return_value=mock_service):
+        result = await select_relevant_examples(examples, "task", top_k=5)
+
+    assert len(result) == 5
