"""
Memory Extractor for SmartSpec Kilo CLI

Extracts important information from conversations to store as long-term memories.
Uses LLM to identify decisions, plans, components, tasks, and code knowledge.
"""

import json
import re
from typing import List, Dict, Optional, Any
from dataclasses import dataclass
from datetime import datetime
import os

from .memory_store import (
    MemoryStore, Memory, MemoryType, 
    get_memory_store
)

# Try to import OpenAI
try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False


EXTRACTION_PROMPT = """You are a memory extraction assistant. Analyze the following conversation and extract important information that should be remembered for future reference.

## Categories to Extract

1. **DECISION** - Decisions made about requirements, design, technology choices, or approaches
2. **PLAN** - Project plans, milestones, roadmap items, or goals
3. **ARCHITECTURE** - System design, component structure, data flow, or API contracts
4. **COMPONENT** - Components, files, or modules created or significantly modified
5. **TASK** - Tasks mentioned (todo, in-progress, completed, blocked)
6. **CODE_KNOWLEDGE** - Important code patterns, functions, gotchas, or workarounds

## Instructions

- Extract only significant, reusable information
- Skip trivial or temporary information
- Be concise but complete
- Include relevant context
- Assign importance (1-10): 10 = critical project decision, 1 = minor detail

## Output Format

Return a JSON array of extracted memories:
```json
[
  {
    "type": "decision|plan|architecture|component|task|code_knowledge",
    "title": "Short descriptive title",
    "content": "Detailed description with relevant context",
    "importance": 1-10,
    "tags": ["relevant", "keywords"],
    "metadata": {
      // Type-specific metadata
    }
  }
]
```

## Type-specific Metadata

For DECISION:
- category: "technology|design|requirement|process"
- rationale: "Why this decision was made"
- alternatives_considered: ["list", "of", "alternatives"]

For COMPONENT:
- file_path: "path/to/file.tsx"
- functions: ["list", "of", "key", "functions"]
- dependencies: ["list", "of", "dependencies"]

For TASK:
- status: "todo|in_progress|completed|blocked"
- priority: "low|medium|high|critical"
- related_files: ["list", "of", "files"]

## Conversation to Analyze

{conversation}

## Extracted Memories (JSON array only, no other text):"""


RELEVANCE_PROMPT = """Given the following query and project memories, select the most relevant memories that would help answer or provide context for the query.

## Query
{query}

## Available Memories
{memories}

## Instructions
- Select memories that are directly relevant to the query
- Include memories that provide important context
- Prioritize recent and high-importance memories
- Return memory IDs in order of relevance

## Output Format
Return a JSON array of memory IDs in order of relevance:
["id1", "id2", "id3", ...]

## Selected Memory IDs (JSON array only):"""


@dataclass
class ExtractedMemory:
    """A memory extracted from conversation"""
    type: str
    title: str
    content: str
    importance: int
    tags: List[str]
    metadata: Dict[str, Any]


class MemoryExtractor:
    """
    Extracts important information from conversations to store as memories.
    
    Features:
    - LLM-based extraction of decisions, plans, components, etc.
    - Automatic importance scoring
    - Deduplication with existing memories
    - Embedding generation for semantic search
    """
    
    def __init__(
        self,
        memory_store: MemoryStore = None,
        model: str = "gpt-4.1-nano",
        embedding_model: str = "text-embedding-ada-002"
    ):
        """
        Initialize the memory extractor.
        
        Args:
            memory_store: MemoryStore instance (uses singleton if not provided)
            model: LLM model for extraction
            embedding_model: Model for generating embeddings
        """
        self.memory_store = memory_store or get_memory_store()
        self.model = model
        self.embedding_model = embedding_model
        
        # Initialize OpenAI client if available
        self.client = None
        if HAS_OPENAI:
            api_key = os.environ.get("OPENAI_API_KEY")
            if api_key:
                self.client = OpenAI()
    
    def extract_memories(
        self,
        conversation: List[Dict[str, str]],
        project_id: str,
        source: str = None
    ) -> List[Memory]:
        """
        Extract memories from a conversation.
        
        Args:
            conversation: List of message dicts with 'role' and 'content'
            project_id: Project to save memories to
            source: Source identifier (e.g., session_id)
        
        Returns:
            List of saved Memory objects
        """
        if not self.client:
            # Fallback to rule-based extraction
            return self._extract_rule_based(conversation, project_id, source)
        
        # Format conversation for prompt
        conv_text = self._format_conversation(conversation)
        
        # Call LLM for extraction
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a memory extraction assistant. Output only valid JSON."},
                    {"role": "user", "content": EXTRACTION_PROMPT.format(conversation=conv_text)}
                ],
                temperature=0.3,
                max_tokens=2000
            )
            
            result_text = response.choices[0].message.content.strip()
            
            # Parse JSON from response
            extracted = self._parse_json_response(result_text)
            
        except Exception as e:
            print(f"LLM extraction failed: {e}")
            return self._extract_rule_based(conversation, project_id, source)
        
        # Save extracted memories
        saved_memories = []
        for item in extracted:
            try:
                memory_type = MemoryType(item.get('type', 'code_knowledge'))
                memory = self.memory_store.save_memory(
                    project_id=project_id,
                    type=memory_type,
                    title=item.get('title', 'Untitled'),
                    content=item.get('content', ''),
                    metadata=item.get('metadata', {}),
                    importance=item.get('importance', 5),
                    source=source,
                    tags=item.get('tags', [])
                )
                saved_memories.append(memory)
                
                # Generate and save embedding
                self._save_embedding(memory)
                
            except Exception as e:
                print(f"Failed to save memory: {e}")
                continue
        
        return saved_memories
    
    def _format_conversation(self, conversation: List[Dict[str, str]]) -> str:
        """Format conversation for prompt"""
        lines = []
        for msg in conversation:
            role = msg.get('role', 'user').upper()
            content = msg.get('content', '')
            # Truncate very long messages
            if len(content) > 2000:
                content = content[:2000] + "... [truncated]"
            lines.append(f"[{role}]: {content}")
        return "\n\n".join(lines)
    
    def _parse_json_response(self, text: str) -> List[Dict]:
        """Parse JSON from LLM response"""
        # Try direct parse
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        
        # Try to find JSON array in text
        match = re.search(r'\[[\s\S]*\]', text)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        
        return []
    
    def _extract_rule_based(
        self,
        conversation: List[Dict[str, str]],
        project_id: str,
        source: str = None
    ) -> List[Memory]:
        """
        Rule-based extraction fallback when LLM is not available.
        
        Looks for patterns like:
        - "decided to...", "we'll use...", "the plan is..."
        - File paths and component names
        - TODO, FIXME comments
        - Function definitions
        """
        saved_memories = []
        
        for msg in conversation:
            if msg.get('role') != 'assistant':
                continue
            
            content = msg.get('content', '')
            
            # Extract decisions
            decision_patterns = [
                r"(?:decided|choosing|we'll use|going with|selected)\s+(.+?)(?:\.|$)",
                r"(?:the approach|the solution|the plan) is to\s+(.+?)(?:\.|$)"
            ]
            for pattern in decision_patterns:
                matches = re.findall(pattern, content, re.IGNORECASE)
                for match in matches[:2]:  # Limit to 2 per pattern
                    if len(match) > 20:  # Skip very short matches
                        memory = self.memory_store.save_memory(
                            project_id=project_id,
                            type=MemoryType.DECISION,
                            title=f"Decision: {match[:50]}...",
                            content=match,
                            importance=6,
                            source=source
                        )
                        saved_memories.append(memory)
            
            # Extract file/component mentions
            file_patterns = [
                r"(?:created|modified|updated|added)\s+[`']?([a-zA-Z0-9_/.-]+\.[a-z]+)[`']?",
                r"(?:in|file)\s+[`']([a-zA-Z0-9_/.-]+\.[a-z]+)[`']"
            ]
            for pattern in file_patterns:
                matches = re.findall(pattern, content, re.IGNORECASE)
                for match in matches[:3]:
                    memory = self.memory_store.save_memory(
                        project_id=project_id,
                        type=MemoryType.COMPONENT,
                        title=f"File: {match}",
                        content=f"File mentioned in conversation: {match}",
                        metadata={"file_path": match},
                        importance=4,
                        source=source
                    )
                    saved_memories.append(memory)
            
            # Extract tasks
            task_patterns = [
                r"(?:TODO|FIXME|HACK):\s*(.+?)(?:\n|$)",
                r"(?:need to|should|must)\s+(.+?)(?:\.|$)"
            ]
            for pattern in task_patterns:
                matches = re.findall(pattern, content, re.IGNORECASE)
                for match in matches[:2]:
                    if len(match) > 15:
                        memory = self.memory_store.save_memory(
                            project_id=project_id,
                            type=MemoryType.TASK,
                            title=f"Task: {match[:50]}...",
                            content=match,
                            metadata={"status": "todo"},
                            importance=5,
                            source=source
                        )
                        saved_memories.append(memory)
        
        return saved_memories
    
    def _save_embedding(self, memory: Memory):
        """Generate and save embedding for a memory"""
        if not self.client:
            return
        
        try:
            # Combine title and content for embedding
            text = f"{memory.title}\n{memory.content}"
            
            response = self.client.embeddings.create(
                model=self.embedding_model,
                input=text
            )
            
            embedding = response.data[0].embedding
            self.memory_store.save_embedding(memory.id, embedding, self.embedding_model)
            
        except Exception as e:
            print(f"Failed to generate embedding: {e}")
    
    def get_relevant_memories(
        self,
        query: str,
        project_id: str,
        limit: int = 10,
        include_types: List[MemoryType] = None
    ) -> List[Memory]:
        """
        Get memories relevant to a query using hybrid search.
        
        Combines:
        1. Semantic search (embedding similarity)
        2. Full-text search (keyword matching)
        3. High-importance memories
        
        Args:
            query: The query to find relevant memories for
            project_id: Project to search in
            limit: Maximum number of memories to return
            include_types: Filter by memory types
        
        Returns:
            List of relevant memories sorted by relevance
        """
        results = {}  # memory_id -> (memory, score)
        
        # 1. Semantic search if embeddings available
        if self.client:
            try:
                # Generate query embedding
                response = self.client.embeddings.create(
                    model=self.embedding_model,
                    input=query
                )
                query_embedding = response.data[0].embedding
                
                # Search by embedding
                semantic_results = self.memory_store.semantic_search(
                    project_id, query_embedding, limit=limit * 2
                )
                
                for memory, score in semantic_results:
                    if include_types and memory.type not in include_types:
                        continue
                    results[memory.id] = (memory, score * 0.6)  # Weight: 60%
                    
            except Exception as e:
                print(f"Semantic search failed: {e}")
        
        # 2. Full-text search
        try:
            text_results = self.memory_store.search_memories(
                project_id, query, types=include_types, limit=limit * 2
            )
            
            for i, memory in enumerate(text_results):
                score = 1.0 - (i / len(text_results)) if text_results else 0
                if memory.id in results:
                    # Combine scores
                    existing_score = results[memory.id][1]
                    results[memory.id] = (memory, existing_score + score * 0.3)
                else:
                    results[memory.id] = (memory, score * 0.3)  # Weight: 30%
                    
        except Exception as e:
            print(f"Text search failed: {e}")
        
        # 3. Always include high-importance memories
        important = self.memory_store.get_important_memories(
            project_id, min_importance=8, limit=5
        )
        
        for memory in important:
            if include_types and memory.type not in include_types:
                continue
            if memory.id in results:
                # Boost score for important memories
                existing_score = results[memory.id][1]
                results[memory.id] = (memory, existing_score + 0.1)
            else:
                results[memory.id] = (memory, memory.importance / 10 * 0.1)
        
        # Sort by combined score
        sorted_results = sorted(
            results.values(),
            key=lambda x: x[1],
            reverse=True
        )
        
        # Return top memories
        return [memory for memory, score in sorted_results[:limit]]
    
    def format_memories_for_context(
        self,
        memories: List[Memory],
        max_tokens: int = 2000
    ) -> str:
        """
        Format memories for inclusion in LLM context.
        
        Args:
            memories: List of memories to format
            max_tokens: Maximum tokens to use
        
        Returns:
            Formatted string for context injection
        """
        if not memories:
            return ""
        
        # Group by type
        by_type = {}
        for memory in memories:
            type_name = memory.type.value if isinstance(memory.type, MemoryType) else memory.type
            if type_name not in by_type:
                by_type[type_name] = []
            by_type[type_name].append(memory)
        
        sections = []
        
        # Format each type
        type_headers = {
            'decision': '## Key Decisions',
            'plan': '## Project Plan',
            'architecture': '## Architecture',
            'component': '## Components',
            'task': '## Tasks',
            'code_knowledge': '## Code Knowledge'
        }
        
        for type_name, type_memories in by_type.items():
            header = type_headers.get(type_name, f'## {type_name.title()}')
            items = []
            
            for m in type_memories[:5]:  # Limit per type
                item = f"- **{m.title}**: {m.content[:200]}"
                if len(m.content) > 200:
                    item += "..."
                items.append(item)
            
            if items:
                sections.append(f"{header}\n" + "\n".join(items))
        
        context = "# Project Context (Long-term Memory)\n\n" + "\n\n".join(sections)
        
        # Truncate if too long (rough estimate: 4 chars per token)
        max_chars = max_tokens * 4
        if len(context) > max_chars:
            context = context[:max_chars] + "\n\n[Context truncated...]"
        
        return context


# Singleton instance
_extractor: Optional[MemoryExtractor] = None

def get_memory_extractor() -> MemoryExtractor:
    """Get the singleton memory extractor instance"""
    global _extractor
    if _extractor is None:
        _extractor = MemoryExtractor()
    return _extractor
