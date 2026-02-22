"""Tests for SmartChunker — token-based, strategy-aware document chunking."""

import pytest
import tiktoken

from app.orchestrator.rag.chunker import (
    Chunk,
    ChunkConfig,
    ChunkStrategy,
    SmartChunker,
)

_enc = tiktoken.get_encoding("cl100k_base")


# ── Test content ─────────────────────────────────────────────────────────

_RECURSIVE_TEXT = (
    "Artificial intelligence represents a transformative technology that continues "
    "to reshape industries worldwide. Machine learning algorithms can process vast "
    "datasets to identify patterns that would be impossible for humans to detect "
    "manually. These patterns enable predictions and automated decision-making "
    "across numerous applications.\n\n"
    "Natural language processing has made significant advances in recent years. "
    "Modern language models can understand context, generate coherent text, and "
    "translate between languages with remarkable accuracy. These capabilities "
    "power chatbots, search engines, and content generation tools.\n\n"
    "Computer vision systems can now identify objects, faces, and scenes in images "
    "with superhuman accuracy. Self-driving vehicles rely on these systems to "
    "navigate roads safely. Medical imaging applications use computer vision to "
    "detect diseases earlier than traditional methods.\n\n"
    "Reinforcement learning enables agents to learn optimal strategies through "
    "trial and error. Game-playing AI systems have achieved superhuman performance "
    "in chess, Go, and complex video games. These techniques are now being applied "
    "to robotics and industrial optimization.\n\n"
    "The ethical implications of AI development require careful consideration. "
    "Bias in training data can lead to unfair outcomes in automated decision "
    "systems. Privacy concerns arise when AI systems process personal data at "
    "scale. Responsible AI development practices are essential.\n\n"
    "Edge computing brings AI capabilities closer to the data source. This reduces "
    "latency and bandwidth requirements for real-time applications. Smart sensors "
    "and IoT devices benefit from local AI processing for immediate response."
)

_MARKDOWN_TEXT = (
    "# Introduction to Machine Learning\n\n"
    "Machine learning is a subset of artificial intelligence that focuses on "
    "building systems that learn from data. Unlike traditional programming where "
    "rules are explicitly coded, ML systems discover patterns from examples. "
    "The field has grown enormously in the past decade with increasing compute "
    "power and larger datasets available for training sophisticated models.\n\n"
    "## Supervised Learning\n\n"
    "Supervised learning uses labeled training data to learn a mapping from inputs "
    "to outputs. Common algorithms include linear regression for continuous outputs "
    "and logistic regression for classification tasks. Decision trees and random "
    "forests provide interpretable predictions for structured data. Support vector "
    "machines find optimal decision boundaries in high-dimensional feature spaces. "
    "Gradient boosting methods like XGBoost combine weak learners for strong "
    "predictive performance across many benchmark tasks and competitions.\n\n"
    "## Unsupervised Learning\n\n"
    "Unsupervised learning finds hidden patterns in unlabeled data. Clustering "
    "algorithms like K-means group similar data points together. Dimensionality "
    "reduction techniques like PCA help visualize high-dimensional data. "
    "Autoencoders learn compressed representations that capture essential features. "
    "Generative adversarial networks create new data samples from learned "
    "distributions. These methods are valuable for exploratory data analysis.\n\n"
    "## Deep Learning\n\n"
    "Deep learning uses neural networks with many layers to learn hierarchical "
    "representations. Convolutional neural networks excel at image processing "
    "tasks including classification, detection, and segmentation of visual data. "
    "Recurrent neural networks handle sequential data like text and time series. "
    "Transformer architectures have revolutionized natural language processing "
    "with attention mechanisms that capture long-range dependencies efficiently. "
    "Large language models can now generate coherent text and follow instructions.\n\n"
    "## Applications\n\n"
    "Machine learning powers recommendation systems, fraud detection, and medical "
    "diagnosis. Natural language processing enables chatbots and translation "
    "services across dozens of languages. Computer vision supports autonomous "
    "vehicles and quality control. Reinforcement learning optimizes complex "
    "sequential decision-making in robotics and game playing."
)

_CODE_TEXT = (
    "import os\n"
    "import json\n"
    "from typing import Any, Optional\n\n\n"
    "class DataProcessor:\n"
    "    def __init__(self, config: dict):\n"
    "        self.config = config\n"
    "        self.data = []\n"
    "        self.processed = False\n\n"
    "    def load_data(self, filepath: str) -> list:\n"
    "        with open(filepath, 'r') as f:\n"
    "            self.data = json.load(f)\n"
    "        return self.data\n\n"
    "    def validate(self) -> bool:\n"
    "        if not self.data:\n"
    "            return False\n"
    "        for item in self.data:\n"
    "            if not isinstance(item, dict):\n"
    "                return False\n"
    "        return True\n\n\n"
    "def calculate_statistics(data: list[dict]) -> dict:\n"
    "    if not data:\n"
    "        return {'count': 0, 'mean': 0}\n"
    "    values = [item.get('value', 0) for item in data]\n"
    "    return {\n"
    "        'count': len(values),\n"
    "        'mean': sum(values) / len(values),\n"
    "        'max': max(values),\n"
    "        'min': min(values),\n"
    "    }\n\n\n"
    "def format_output(stats: dict, format_type: str = 'json') -> str:\n"
    "    if format_type == 'json':\n"
    "        return json.dumps(stats, indent=2)\n"
    "    elif format_type == 'text':\n"
    "        lines = [f'{k}: {v}' for k, v in stats.items()]\n"
    "        return '\\n'.join(lines)\n"
    "    else:\n"
    "        raise ValueError(f'Unknown format: {format_type}')\n\n\n"
    "class DataExporter:\n"
    "    def __init__(self, output_dir: str):\n"
    "        self.output_dir = output_dir\n"
    "        os.makedirs(output_dir, exist_ok=True)\n\n"
    "    def export(self, data: Any, filename: str) -> str:\n"
    "        filepath = os.path.join(self.output_dir, filename)\n"
    "        with open(filepath, 'w') as f:\n"
    "            json.dump(data, f, indent=2)\n"
    "        return filepath\n"
)

_DEFAULT_KWARGS = {
    "doc_id": "doc-1",
    "doc_title": "Test Document",
    "tenant_id": "t1",
    "allowed_scopes": ["u:1", "p:global"],
}


# ── Strategy detection ──────────────────────────────────────────────────


class TestChunkStrategy:
    """Tests for strategy auto-detection."""

    def test_auto_detect_markdown(self):
        assert SmartChunker.detect_strategy(_MARKDOWN_TEXT) == ChunkStrategy.MARKDOWN

    def test_auto_detect_python_code(self):
        code = "def foo():\n    pass\n\nclass Bar:\n    pass\n"
        assert SmartChunker.detect_strategy(code) == ChunkStrategy.CODE

    def test_auto_detect_javascript_code(self):
        code = "function foo() {\n}\n\nfunction bar() {\n}\n"
        assert SmartChunker.detect_strategy(code) == ChunkStrategy.CODE

    def test_auto_detect_plain_text(self):
        text = "This is a plain paragraph with no special markers at all."
        assert SmartChunker.detect_strategy(text) == ChunkStrategy.RECURSIVE


# ── Recursive splitting ────────────────────────────────────────────────


@pytest.mark.unit
class TestRecursiveSplitting:
    """Tests for RECURSIVE strategy splitting behavior."""

    @pytest.fixture
    def chunker(self):
        config = ChunkConfig(
            strategy=ChunkStrategy.RECURSIVE,
            child_max_tokens=50,
            child_overlap_tokens=10,
            parent_max_tokens=120,
            min_chunk_tokens=10,
        )
        return SmartChunker(config)

    def test_splits_on_paragraphs_first(self, chunker):
        """RECURSIVE splits on paragraph boundaries (\\n\\n) first."""
        chunks = chunker.chunk(_RECURSIVE_TEXT, **_DEFAULT_KWARGS)
        children = [c for c in chunks if not c.is_parent]
        assert len(children) >= 2

    def test_falls_back_to_sentences(self, chunker):
        """Falls back to sentence splitting when a paragraph is too large."""
        long_para = (
            "First sentence of a long paragraph with additional details. "
            "Second sentence with more details about the topic at hand. "
            "Third sentence continues the discussion further with examples. "
            "Fourth sentence adds even more context to the paragraph here. "
            "Fifth sentence concludes the very long paragraph content now. "
            "Sixth sentence provides additional closing thoughts and ideas. "
            "Seventh sentence elaborates on the main theme of this text. "
            "Eighth sentence wraps up the extended discussion thoroughly. "
            "Ninth sentence adds supplementary material to consider later. "
            "Tenth sentence brings everything to a satisfying conclusion."
        )
        chunks = chunker.chunk(long_para, **_DEFAULT_KWARGS)
        children = [c for c in chunks if not c.is_parent]
        assert len(children) >= 2

    def test_no_mid_sentence_splits(self, chunker):
        """Chunk content should not end mid-sentence (should end at sentence boundary)."""
        text = (
            "First sentence of a paragraph. Second sentence here. "
            "Third sentence follows. Fourth sentence ends.\n\n"
            "Another paragraph starts here. More content follows. "
            "Yet another sentence. Final sentence in paragraph."
        )
        chunks = chunker.chunk(text, **_DEFAULT_KWARGS)
        children = [c for c in chunks if not c.is_parent]
        for child in children:
            content = child.content.strip()
            # Content should end with punctuation or be the last chunk
            if child != children[-1]:
                assert content[-1] in ".!?)", f"Chunk ends mid-sentence: ...{content[-20:]}"


# ── Token counting ──────────────────────────────────────────────────────


@pytest.mark.unit
class TestTokenCounting:
    """Tests for accurate tiktoken-based token counting."""

    @pytest.fixture
    def chunker(self):
        config = ChunkConfig(
            strategy=ChunkStrategy.RECURSIVE,
            child_max_tokens=400,
            child_overlap_tokens=80,
            parent_max_tokens=1024,
            min_chunk_tokens=50,
        )
        return SmartChunker(config)

    def test_child_chunks_within_token_range(self, chunker):
        """All child chunks have token_count within bounds."""
        chunks = chunker.chunk(_RECURSIVE_TEXT, **_DEFAULT_KWARGS)
        children = [c for c in chunks if not c.is_parent]
        for child in children:
            assert child.token_count >= 1
            # Allow small tolerance for single-unit chunks that exceed limit
            assert child.token_count <= chunker.config.child_max_tokens + 5

    def test_parent_chunks_within_token_range(self, chunker):
        """All parent chunks have token_count within parent_max_tokens."""
        chunks = chunker.chunk(_RECURSIVE_TEXT, **_DEFAULT_KWARGS)
        parents = [c for c in chunks if c.is_parent]
        for parent in parents:
            assert parent.token_count <= chunker.config.parent_max_tokens + 5

    def test_token_count_matches_tiktoken(self, chunker):
        """token_count field matches independent tiktoken encoding."""
        chunks = chunker.chunk(_RECURSIVE_TEXT, **_DEFAULT_KWARGS)
        for c in chunks:
            expected = len(_enc.encode(c.content))
            assert c.token_count == expected, (
                f"Chunk {c.index}: expected {expected}, got {c.token_count}"
            )


# ── Parent-child relationship ───────────────────────────────────────────


@pytest.mark.unit
class TestParentChildRelationship:
    """Tests for parent-child chunk pattern."""

    @pytest.fixture
    def chunker(self):
        config = ChunkConfig(
            strategy=ChunkStrategy.RECURSIVE,
            child_max_tokens=100,
            child_overlap_tokens=20,
            parent_max_tokens=250,
            min_chunk_tokens=20,
        )
        return SmartChunker(config)

    def test_children_have_valid_parent_id(self, chunker):
        """Each child chunk has a parent_chunk_id pointing to a parent."""
        chunks = chunker.chunk(_RECURSIVE_TEXT, **_DEFAULT_KWARGS)
        parents = {c.chunk_id for c in chunks if c.is_parent}
        children = [c for c in chunks if not c.is_parent]

        assert len(parents) >= 1
        for child in children:
            assert child.parent_chunk_id is not None
            assert child.parent_chunk_id in parents

    def test_parent_child_flags(self, chunker):
        """Parent chunks have is_parent=True, children have is_parent=False."""
        chunks = chunker.chunk(_RECURSIVE_TEXT, **_DEFAULT_KWARGS)
        for c in chunks:
            if c.parent_chunk_id is None:
                assert c.is_parent is True
            else:
                assert c.is_parent is False

    def test_parent_has_expected_child_count(self, chunker):
        """Each parent has at least 1 child."""
        chunks = chunker.chunk(_RECURSIVE_TEXT, **_DEFAULT_KWARGS)
        parents = [c for c in chunks if c.is_parent]
        children = [c for c in chunks if not c.is_parent]

        for parent in parents:
            parent_children = [c for c in children if c.parent_chunk_id == parent.chunk_id]
            assert len(parent_children) >= 1, f"Parent {parent.chunk_id} has no children"

    def test_parent_content_covers_children(self, chunker):
        """Child content words should appear in parent content."""
        chunks = chunker.chunk(_RECURSIVE_TEXT, **_DEFAULT_KWARGS)
        parents = {c.chunk_id: c for c in chunks if c.is_parent}
        children = [c for c in chunks if not c.is_parent]

        for child in children:
            parent = parents[child.parent_chunk_id]
            # Check that most words in child appear in parent
            child_words = set(child.content.lower().split())
            parent_words = set(parent.content.lower().split())
            overlap = child_words & parent_words
            coverage = len(overlap) / len(child_words) if child_words else 1.0
            assert coverage > 0.8, (
                f"Child {child.index} only {coverage:.0%} covered by parent"
            )


# ── Markdown strategy ──────────────────────────────────────────────────


@pytest.mark.unit
class TestMarkdownStrategy:
    """Tests for MARKDOWN strategy."""

    @pytest.fixture
    def chunker(self):
        config = ChunkConfig(
            strategy=ChunkStrategy.MARKDOWN,
            child_max_tokens=100,
            child_overlap_tokens=20,
            parent_max_tokens=300,
            min_chunk_tokens=10,
        )
        return SmartChunker(config)

    def test_splits_on_headings(self, chunker):
        """Creates chunks aligned to heading boundaries."""
        chunks = chunker.chunk(_MARKDOWN_TEXT, **_DEFAULT_KWARGS)
        parents = [c for c in chunks if c.is_parent]
        assert len(parents) >= 2

    def test_preserves_section_heading_metadata(self, chunker):
        """Each chunk under a heading has section_heading set."""
        chunks = chunker.chunk(_MARKDOWN_TEXT, **_DEFAULT_KWARGS)
        headed = [c for c in chunks if c.section_heading]
        assert len(headed) >= 2

    def test_heading_in_section_heading_field(self, chunker):
        """Heading text from the document appears in section_heading."""
        chunks = chunker.chunk(_MARKDOWN_TEXT, **_DEFAULT_KWARGS)
        headings = {c.section_heading for c in chunks if c.section_heading}
        # Should find some of our markdown headings
        found_intro = any("Introduction" in h for h in headings)
        found_supervised = any("Supervised" in h for h in headings)
        assert found_intro or found_supervised


# ── Code strategy ───────────────────────────────────────────────────────


@pytest.mark.unit
class TestCodeStrategy:
    """Tests for CODE strategy."""

    @pytest.fixture
    def chunker(self):
        config = ChunkConfig(
            strategy=ChunkStrategy.CODE,
            child_max_tokens=200,
            child_overlap_tokens=40,
            parent_max_tokens=500,
            min_chunk_tokens=20,
        )
        return SmartChunker(config)

    def test_functions_not_split(self, chunker):
        """Function bodies stay together in a single chunk when possible."""
        chunks = chunker.chunk(_CODE_TEXT, **_DEFAULT_KWARGS)
        # The calculate_statistics function should be in one parent
        parents = [c for c in chunks if c.is_parent]
        found = False
        for p in parents:
            if "calculate_statistics" in p.content and "return {" in p.content:
                found = True
                break
        assert found, "calculate_statistics function was split across chunks"

    def test_classes_not_split(self, chunker):
        """Class definitions stay intact within a single chunk."""
        chunks = chunker.chunk(_CODE_TEXT, **_DEFAULT_KWARGS)
        parents = [c for c in chunks if c.is_parent]
        found = False
        for p in parents:
            if "class DataProcessor" in p.content and "def validate" in p.content:
                found = True
                break
        assert found, "DataProcessor class was split across chunks"


# ── Edge cases ──────────────────────────────────────────────────────────


@pytest.mark.unit
class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    @pytest.fixture
    def chunker(self):
        config = ChunkConfig(strategy=ChunkStrategy.RECURSIVE)
        return SmartChunker(config)

    def test_empty_text_returns_empty_list(self, chunker):
        assert chunker.chunk("", **_DEFAULT_KWARGS) == []

    def test_short_text_single_chunk(self, chunker):
        chunks = chunker.chunk("Hello world.", **_DEFAULT_KWARGS)
        assert len(chunks) >= 1
        children = [c for c in chunks if not c.is_parent]
        assert len(children) >= 1

    def test_single_line_text(self, chunker):
        chunks = chunker.chunk("A single line of text.", **_DEFAULT_KWARGS)
        assert len(chunks) >= 1

    def test_whitespace_only_returns_empty(self, chunker):
        assert chunker.chunk("   \n\n  ", **_DEFAULT_KWARGS) == []


# ── Scope inheritance ───────────────────────────────────────────────────


@pytest.mark.unit
class TestScopeInheritance:
    """Tests for tenant and scope propagation to chunks."""

    @pytest.fixture
    def chunker(self):
        config = ChunkConfig(strategy=ChunkStrategy.RECURSIVE)
        return SmartChunker(config)

    def test_chunks_inherit_tenant_id(self, chunker):
        chunks = chunker.chunk(
            "Some text content for testing.",
            doc_id="doc-1",
            doc_title="Test",
            tenant_id="tenant-abc",
            allowed_scopes=["u:1"],
        )
        for c in chunks:
            assert c.tenant_id == "tenant-abc"

    def test_chunks_inherit_allowed_scopes(self, chunker):
        scopes = ["u:1", "g:10", "p:global"]
        chunks = chunker.chunk(
            "Some text content for testing.",
            doc_id="doc-1",
            doc_title="Test",
            tenant_id="t1",
            allowed_scopes=scopes,
        )
        for c in chunks:
            assert c.allowed_scopes == scopes


# ── FIXED strategy backward compat ──────────────────────────────────────


@pytest.mark.unit
class TestFixedStrategyBackwardCompat:
    """Tests for FIXED strategy backward compatibility."""

    @pytest.fixture
    def chunker(self):
        config = ChunkConfig(
            strategy=ChunkStrategy.FIXED,
            child_max_tokens=400,
            child_overlap_tokens=80,
        )
        return SmartChunker(config)

    def test_fixed_strategy_character_based(self, chunker):
        """FIXED strategy produces character-based chunks with no parent-child."""
        chunks = chunker.chunk(_RECURSIVE_TEXT, **_DEFAULT_KWARGS)
        # All chunks should be non-parent
        for c in chunks:
            assert c.is_parent is False
            assert c.parent_chunk_id is None
        assert len(chunks) >= 1
