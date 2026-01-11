"""
Long-term Memory Store for SmartSpec Kilo CLI

Project-scoped memory that persists across sessions/tabs.
Uses SQLite for structured data and embeddings for semantic search.

Thread-safe implementation with connection pooling and write queue
to support concurrent access from multiple tabs.
"""

import sqlite3
import json
import uuid
import threading
import queue
from datetime import datetime
from typing import List, Dict, Optional, Any, Tuple, Callable
from dataclasses import dataclass, asdict
from enum import Enum
from contextlib import contextmanager
import os
import hashlib
import time
import atexit

# Try to import numpy for embeddings, fallback to list operations
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False


class MemoryType(str, Enum):
    """Types of memories that can be stored"""
    DECISION = "decision"          # Requirements, design decisions, tech choices
    PLAN = "plan"                  # Project plans, milestones, roadmap
    ARCHITECTURE = "architecture"  # System design, component structure
    COMPONENT = "component"        # Components created/modified
    TASK = "task"                  # Tasks (todo, in-progress, completed)
    CODE_KNOWLEDGE = "code_knowledge"  # Code patterns, functions, gotchas


class RelationType(str, Enum):
    """Types of relationships between memories"""
    DEPENDS_ON = "depends_on"
    IMPLEMENTS = "implements"
    SUPERSEDES = "supersedes"
    RELATES_TO = "relates_to"


@dataclass
class Memory:
    """A single memory entry"""
    id: str
    project_id: str
    type: MemoryType
    title: str
    content: str
    metadata: Dict[str, Any]
    importance: int  # 1-10 scale
    source: Optional[str]  # session_id, file path, etc.
    created_at: datetime
    updated_at: datetime
    expires_at: Optional[datetime]
    is_active: bool
    tags: List[str] = None
    relevance_score: float = 0.0  # Set during retrieval
    
    def __post_init__(self):
        if self.tags is None:
            self.tags = []
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'project_id': self.project_id,
            'type': self.type.value if isinstance(self.type, MemoryType) else self.type,
            'title': self.title,
            'content': self.content,
            'metadata': self.metadata,
            'importance': self.importance,
            'source': self.source,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'is_active': self.is_active,
            'tags': self.tags,
            'relevance_score': self.relevance_score
        }
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'Memory':
        """Create Memory from dictionary"""
        return cls(
            id=data['id'],
            project_id=data['project_id'],
            type=MemoryType(data['type']) if isinstance(data['type'], str) else data['type'],
            title=data['title'],
            content=data['content'],
            metadata=data.get('metadata', {}),
            importance=data.get('importance', 5),
            source=data.get('source'),
            created_at=datetime.fromisoformat(data['created_at']) if data.get('created_at') else datetime.now(),
            updated_at=datetime.fromisoformat(data['updated_at']) if data.get('updated_at') else datetime.now(),
            expires_at=datetime.fromisoformat(data['expires_at']) if data.get('expires_at') else None,
            is_active=data.get('is_active', True),
            tags=data.get('tags', []),
            relevance_score=data.get('relevance_score', 0.0)
        )


class ConnectionPool:
    """
    Thread-safe SQLite connection pool.
    
    Each thread gets its own connection to avoid SQLite threading issues.
    Connections are reused within the same thread.
    """
    
    def __init__(self, db_path: str, max_connections: int = 10):
        self.db_path = db_path
        self.max_connections = max_connections
        self._local = threading.local()
        self._all_connections: List[sqlite3.Connection] = []
        self._lock = threading.Lock()
    
    def get_connection(self) -> sqlite3.Connection:
        """Get a connection for the current thread"""
        if not hasattr(self._local, 'connection') or self._local.connection is None:
            conn = sqlite3.connect(
                self.db_path,
                check_same_thread=False,
                timeout=30.0  # Wait up to 30 seconds for locks
            )
            conn.row_factory = sqlite3.Row
            # Enable WAL mode for better concurrent access
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=30000")  # 30 second timeout
            conn.execute("PRAGMA synchronous=NORMAL")
            
            self._local.connection = conn
            
            with self._lock:
                self._all_connections.append(conn)
        
        return self._local.connection
    
    def close_all(self):
        """Close all connections"""
        with self._lock:
            for conn in self._all_connections:
                try:
                    conn.close()
                except:
                    pass
            self._all_connections.clear()


class WriteQueue:
    """
    Serializes write operations to prevent database locks.
    
    All write operations are queued and executed sequentially
    by a dedicated writer thread.
    """
    
    def __init__(self, pool: ConnectionPool):
        self.pool = pool
        self._queue: queue.Queue = queue.Queue()
        self._running = True
        self._writer_thread = threading.Thread(target=self._writer_loop, daemon=True)
        self._writer_thread.start()
    
    def _writer_loop(self):
        """Background thread that processes write operations"""
        while self._running:
            try:
                item = self._queue.get(timeout=0.1)
                if item is None:
                    break
                
                func, args, kwargs, result_queue = item
                try:
                    conn = self.pool.get_connection()
                    result = func(conn, *args, **kwargs)
                    conn.commit()
                    result_queue.put(('success', result))
                except Exception as e:
                    result_queue.put(('error', e))
                finally:
                    self._queue.task_done()
                    
            except queue.Empty:
                continue
    
    def execute(self, func: Callable, *args, **kwargs) -> Any:
        """
        Queue a write operation and wait for result.
        
        Args:
            func: Function that takes (connection, *args, **kwargs)
            *args, **kwargs: Arguments to pass to func
        
        Returns:
            Result from func
        
        Raises:
            Exception from func if it failed
        """
        result_queue: queue.Queue = queue.Queue()
        self._queue.put((func, args, kwargs, result_queue))
        
        status, result = result_queue.get(timeout=60.0)  # 60 second timeout
        
        if status == 'error':
            raise result
        return result
    
    def stop(self):
        """Stop the writer thread"""
        self._running = False
        self._queue.put(None)
        self._writer_thread.join(timeout=5.0)


class MemoryStore:
    """
    SQLite-based memory store for project-scoped long-term memory.
    
    Thread-safe implementation with:
    - Connection pooling (one connection per thread)
    - Write queue for serialized writes
    - WAL mode for better concurrent reads
    - Automatic retry on busy
    
    Features:
    - Project-scoped memories (shared across sessions/tabs)
    - Structured storage with full-text search
    - Embedding storage for semantic search
    - Memory relationships (knowledge graph)
    - Automatic cleanup and consolidation
    """
    
    def __init__(self, db_path: str = None):
        """
        Initialize the memory store.
        
        Args:
            db_path: Path to SQLite database file. Defaults to ~/.smartspec/memory.db
        """
        if db_path is None:
            home = os.path.expanduser("~")
            smartspec_dir = os.path.join(home, ".smartspec")
            os.makedirs(smartspec_dir, exist_ok=True)
            db_path = os.path.join(smartspec_dir, "memory.db")
        
        self.db_path = db_path
        self._pool = ConnectionPool(db_path)
        self._write_queue = WriteQueue(self._pool)
        self._read_lock = threading.RLock()  # For complex read operations
        
        self._init_database()
        
        # Register cleanup on exit
        atexit.register(self._cleanup)
    
    def _cleanup(self):
        """Cleanup resources on exit"""
        try:
            self._write_queue.stop()
            self._pool.close_all()
        except:
            pass
    
    @contextmanager
    def _read_connection(self):
        """Get a connection for read operations"""
        conn = self._pool.get_connection()
        try:
            yield conn
        finally:
            pass  # Connection stays open for reuse
    
    def _execute_write(self, func: Callable, *args, **kwargs) -> Any:
        """Execute a write operation through the queue"""
        return self._write_queue.execute(func, *args, **kwargs)
    
    def _init_database(self):
        """Initialize database schema"""
        def init(conn):
            cursor = conn.cursor()
            
            # Projects table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    workspace_path TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Memories table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS memories (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    metadata TEXT,
                    importance INTEGER DEFAULT 5,
                    source TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP,
                    is_active INTEGER DEFAULT 1,
                    content_hash TEXT,
                    FOREIGN KEY (project_id) REFERENCES projects(id)
                )
            """)
            
            # Embeddings table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS memory_embeddings (
                    memory_id TEXT PRIMARY KEY,
                    embedding BLOB,
                    model TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
                )
            """)
            
            # Tags table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS tags (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL
                )
            """)
            
            # Memory-Tag relationship
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS memory_tags (
                    memory_id TEXT,
                    tag_id INTEGER,
                    PRIMARY KEY (memory_id, tag_id),
                    FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE,
                    FOREIGN KEY (tag_id) REFERENCES tags(id)
                )
            """)
            
            # Memory relationships
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS memory_relations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_id TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    relation_type TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
                    FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE
                )
            """)
            
            # Full-text search virtual table
            cursor.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
                    title, content, tags,
                    content='memories',
                    content_rowid='rowid'
                )
            """)
            
            # Triggers for FTS sync
            cursor.execute("""
                CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
                    INSERT INTO memories_fts(rowid, title, content, tags)
                    VALUES (NEW.rowid, NEW.title, NEW.content, '');
                END
            """)
            
            cursor.execute("""
                CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
                    INSERT INTO memories_fts(memories_fts, rowid, title, content, tags)
                    VALUES ('delete', OLD.rowid, OLD.title, OLD.content, '');
                END
            """)
            
            cursor.execute("""
                CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
                    INSERT INTO memories_fts(memories_fts, rowid, title, content, tags)
                    VALUES ('delete', OLD.rowid, OLD.title, OLD.content, '');
                    INSERT INTO memories_fts(rowid, title, content, tags)
                    VALUES (NEW.rowid, NEW.title, NEW.content, '');
                END
            """)
            
            # Indexes
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_memories_active ON memories(is_active)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_memories_hash ON memories(content_hash)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_memory_relations_source ON memory_relations(source_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_memory_relations_target ON memory_relations(target_id)")
            
            return True
        
        self._execute_write(init)
    
    def _content_hash(self, content: str) -> str:
        """Generate hash for content deduplication"""
        return hashlib.md5(content.encode()).hexdigest()
    
    # ==================== Project Operations ====================
    
    def create_project(self, name: str, workspace_path: str = None) -> str:
        """Create a new project"""
        project_id = str(uuid.uuid4())
        
        def create(conn):
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO projects (id, name, workspace_path)
                VALUES (?, ?, ?)
            """, (project_id, name, workspace_path))
            return project_id
        
        return self._execute_write(create)
    
    def get_project(self, project_id: str) -> Optional[Dict]:
        """Get project by ID"""
        with self._read_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
            row = cursor.fetchone()
            
            if row:
                return dict(row)
            return None
    
    def get_or_create_project(self, name: str, workspace_path: str = None) -> str:
        """Get existing project by name/path or create new one"""
        # First try to find existing (read operation)
        with self._read_connection() as conn:
            cursor = conn.cursor()
            
            # Try to find by workspace path first
            if workspace_path:
                cursor.execute(
                    "SELECT id FROM projects WHERE workspace_path = ?",
                    (workspace_path,)
                )
                row = cursor.fetchone()
                if row:
                    return row['id']
            
            # Try to find by name
            cursor.execute("SELECT id FROM projects WHERE name = ?", (name,))
            row = cursor.fetchone()
            if row:
                return row['id']
        
        # Create new project (write operation)
        return self.create_project(name, workspace_path)
    
    # ==================== Memory Operations ====================
    
    def save_memory(
        self,
        project_id: str,
        type: MemoryType,
        title: str,
        content: str,
        metadata: Dict = None,
        importance: int = 5,
        source: str = None,
        tags: List[str] = None,
        expires_at: datetime = None
    ) -> Memory:
        """
        Save a new memory or update existing one with same content hash.
        Thread-safe - uses write queue.
        """
        content_hash = self._content_hash(content)
        memory_id = str(uuid.uuid4())
        
        def save(conn):
            cursor = conn.cursor()
            
            # Check for duplicate
            cursor.execute("""
                SELECT id FROM memories 
                WHERE project_id = ? AND content_hash = ? AND is_active = 1
            """, (project_id, content_hash))
            
            existing = cursor.fetchone()
            actual_id = memory_id
            
            if existing:
                # Update existing memory
                actual_id = existing['id']
                cursor.execute("""
                    UPDATE memories SET
                        title = ?,
                        type = ?,
                        metadata = ?,
                        importance = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (title, type.value, json.dumps(metadata or {}), importance, actual_id))
            else:
                # Create new memory
                cursor.execute("""
                    INSERT INTO memories (
                        id, project_id, type, title, content, metadata,
                        importance, source, expires_at, content_hash
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    memory_id, project_id, type.value, title, content,
                    json.dumps(metadata or {}), importance, source,
                    expires_at.isoformat() if expires_at else None,
                    content_hash
                ))
                actual_id = memory_id
            
            # Handle tags
            if tags:
                for tag_name in tags:
                    # Get or create tag
                    cursor.execute(
                        "INSERT OR IGNORE INTO tags (name) VALUES (?)",
                        (tag_name.lower(),)
                    )
                    cursor.execute("SELECT id FROM tags WHERE name = ?", (tag_name.lower(),))
                    tag_row = cursor.fetchone()
                    if tag_row:
                        tag_id = tag_row['id']
                        # Link tag to memory
                        cursor.execute(
                            "INSERT OR IGNORE INTO memory_tags (memory_id, tag_id) VALUES (?, ?)",
                            (actual_id, tag_id)
                        )
            
            return actual_id
        
        saved_id = self._execute_write(save)
        return self.get_memory(saved_id)
    
    def get_memory(self, memory_id: str) -> Optional[Memory]:
        """Get a memory by ID (thread-safe read)"""
        with self._read_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute("SELECT * FROM memories WHERE id = ?", (memory_id,))
            row = cursor.fetchone()
            
            if not row:
                return None
            
            # Get tags
            cursor.execute("""
                SELECT t.name FROM tags t
                JOIN memory_tags mt ON t.id = mt.tag_id
                WHERE mt.memory_id = ?
            """, (memory_id,))
            tags = [r['name'] for r in cursor.fetchall()]
            
            return Memory(
                id=row['id'],
                project_id=row['project_id'],
                type=MemoryType(row['type']),
                title=row['title'],
                content=row['content'],
                metadata=json.loads(row['metadata']) if row['metadata'] else {},
                importance=row['importance'],
                source=row['source'],
                created_at=datetime.fromisoformat(row['created_at']) if row['created_at'] else datetime.now(),
                updated_at=datetime.fromisoformat(row['updated_at']) if row['updated_at'] else datetime.now(),
                expires_at=datetime.fromisoformat(row['expires_at']) if row['expires_at'] else None,
                is_active=bool(row['is_active']),
                tags=tags
            )
    
    def update_memory(
        self,
        memory_id: str,
        title: str = None,
        content: str = None,
        metadata: Dict = None,
        importance: int = None,
        is_active: bool = None
    ) -> Optional[Memory]:
        """Update an existing memory (thread-safe write)"""
        def update(conn):
            cursor = conn.cursor()
            
            updates = []
            params = []
            
            if title is not None:
                updates.append("title = ?")
                params.append(title)
            if content is not None:
                updates.append("content = ?")
                updates.append("content_hash = ?")
                params.append(content)
                params.append(self._content_hash(content))
            if metadata is not None:
                updates.append("metadata = ?")
                params.append(json.dumps(metadata))
            if importance is not None:
                updates.append("importance = ?")
                params.append(importance)
            if is_active is not None:
                updates.append("is_active = ?")
                params.append(1 if is_active else 0)
            
            if updates:
                updates.append("updated_at = CURRENT_TIMESTAMP")
                params.append(memory_id)
                
                cursor.execute(f"""
                    UPDATE memories SET {', '.join(updates)} WHERE id = ?
                """, params)
            
            return memory_id
        
        self._execute_write(update)
        return self.get_memory(memory_id)
    
    def delete_memory(self, memory_id: str, soft_delete: bool = True):
        """Delete a memory (thread-safe write)"""
        def delete(conn):
            cursor = conn.cursor()
            
            if soft_delete:
                cursor.execute(
                    "UPDATE memories SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (memory_id,)
                )
            else:
                cursor.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
            
            return True
        
        self._execute_write(delete)
    
    # ==================== Search Operations ====================
    
    def get_project_memories(
        self,
        project_id: str,
        type: MemoryType = None,
        active_only: bool = True,
        limit: int = 100
    ) -> List[Memory]:
        """Get all memories for a project (thread-safe read)"""
        with self._read_connection() as conn:
            cursor = conn.cursor()
            
            query = "SELECT * FROM memories WHERE project_id = ?"
            params = [project_id]
            
            if active_only:
                query += " AND is_active = 1"
            if type:
                query += " AND type = ?"
                params.append(type.value)
            
            query += " ORDER BY importance DESC, updated_at DESC LIMIT ?"
            params.append(limit)
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            memories = []
            for row in rows:
                memory = Memory(
                    id=row['id'],
                    project_id=row['project_id'],
                    type=MemoryType(row['type']),
                    title=row['title'],
                    content=row['content'],
                    metadata=json.loads(row['metadata']) if row['metadata'] else {},
                    importance=row['importance'],
                    source=row['source'],
                    created_at=datetime.fromisoformat(row['created_at']) if row['created_at'] else datetime.now(),
                    updated_at=datetime.fromisoformat(row['updated_at']) if row['updated_at'] else datetime.now(),
                    expires_at=datetime.fromisoformat(row['expires_at']) if row['expires_at'] else None,
                    is_active=bool(row['is_active']),
                    tags=[]
                )
                memories.append(memory)
            
            return memories
    
    def search_memories(
        self,
        project_id: str,
        query: str,
        types: List[MemoryType] = None,
        tags: List[str] = None,
        min_importance: int = None,
        limit: int = 20
    ) -> List[Memory]:
        """
        Search memories using full-text search (thread-safe read).
        """
        with self._read_connection() as conn:
            cursor = conn.cursor()
            
            # Use FTS for search
            sql = """
                SELECT m.*, bm25(memories_fts) as rank
                FROM memories m
                JOIN memories_fts fts ON m.rowid = fts.rowid
                WHERE memories_fts MATCH ? AND m.project_id = ? AND m.is_active = 1
            """
            params = [query, project_id]
            
            if types:
                placeholders = ','.join(['?' for _ in types])
                sql += f" AND m.type IN ({placeholders})"
                params.extend([t.value for t in types])
            
            if min_importance:
                sql += " AND m.importance >= ?"
                params.append(min_importance)
            
            sql += " ORDER BY rank LIMIT ?"
            params.append(limit)
            
            try:
                cursor.execute(sql, params)
                rows = cursor.fetchall()
            except sqlite3.OperationalError:
                # FTS query failed, fallback to LIKE
                sql = """
                    SELECT * FROM memories
                    WHERE project_id = ? AND is_active = 1
                    AND (title LIKE ? OR content LIKE ?)
                """
                like_query = f"%{query}%"
                params = [project_id, like_query, like_query]
                
                if types:
                    placeholders = ','.join(['?' for _ in types])
                    sql += f" AND type IN ({placeholders})"
                    params.extend([t.value for t in types])
                
                if min_importance:
                    sql += " AND importance >= ?"
                    params.append(min_importance)
                
                sql += " ORDER BY importance DESC, updated_at DESC LIMIT ?"
                params.append(limit)
                
                cursor.execute(sql, params)
                rows = cursor.fetchall()
            
            memories = []
            for row in rows:
                memory = Memory(
                    id=row['id'],
                    project_id=row['project_id'],
                    type=MemoryType(row['type']),
                    title=row['title'],
                    content=row['content'],
                    metadata=json.loads(row['metadata']) if row['metadata'] else {},
                    importance=row['importance'],
                    source=row['source'],
                    created_at=datetime.fromisoformat(row['created_at']) if row['created_at'] else datetime.now(),
                    updated_at=datetime.fromisoformat(row['updated_at']) if row['updated_at'] else datetime.now(),
                    expires_at=datetime.fromisoformat(row['expires_at']) if row['expires_at'] else None,
                    is_active=bool(row['is_active']),
                    tags=[],
                    relevance_score=row['rank'] if 'rank' in row.keys() else 0
                )
                memories.append(memory)
            
            # Filter by tags if specified
            if tags:
                memories = [m for m in memories if any(t in m.tags for t in tags)]
            
            return memories
    
    def get_important_memories(
        self,
        project_id: str,
        min_importance: int = 8,
        limit: int = 10
    ) -> List[Memory]:
        """Get high-importance memories that should always be included"""
        with self._read_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT * FROM memories
                WHERE project_id = ? AND is_active = 1 AND importance >= ?
                ORDER BY importance DESC, updated_at DESC
                LIMIT ?
            """, (project_id, min_importance, limit))
            
            rows = cursor.fetchall()
            
            memories = []
            for row in rows:
                memory = Memory(
                    id=row['id'],
                    project_id=row['project_id'],
                    type=MemoryType(row['type']),
                    title=row['title'],
                    content=row['content'],
                    metadata=json.loads(row['metadata']) if row['metadata'] else {},
                    importance=row['importance'],
                    source=row['source'],
                    created_at=datetime.fromisoformat(row['created_at']) if row['created_at'] else datetime.now(),
                    updated_at=datetime.fromisoformat(row['updated_at']) if row['updated_at'] else datetime.now(),
                    expires_at=datetime.fromisoformat(row['expires_at']) if row['expires_at'] else None,
                    is_active=bool(row['is_active']),
                    tags=[]
                )
                memories.append(memory)
            
            return memories
    
    # ==================== Embedding Operations ====================
    
    def save_embedding(self, memory_id: str, embedding: List[float], model: str = "text-embedding-ada-002"):
        """Save embedding for a memory (thread-safe write)"""
        def save(conn):
            cursor = conn.cursor()
            
            # Store as blob
            if HAS_NUMPY:
                embedding_blob = np.array(embedding, dtype=np.float32).tobytes()
            else:
                import struct
                embedding_blob = struct.pack(f'{len(embedding)}f', *embedding)
            
            cursor.execute("""
                INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding, model)
                VALUES (?, ?, ?)
            """, (memory_id, embedding_blob, model))
            
            return True
        
        self._execute_write(save)
    
    def get_embedding(self, memory_id: str) -> Optional[List[float]]:
        """Get embedding for a memory (thread-safe read)"""
        with self._read_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute(
                "SELECT embedding FROM memory_embeddings WHERE memory_id = ?",
                (memory_id,)
            )
            row = cursor.fetchone()
            
            if row and row['embedding']:
                if HAS_NUMPY:
                    return np.frombuffer(row['embedding'], dtype=np.float32).tolist()
                else:
                    import struct
                    num_floats = len(row['embedding']) // 4
                    return list(struct.unpack(f'{num_floats}f', row['embedding']))
            return None
    
    def semantic_search(
        self,
        project_id: str,
        query_embedding: List[float],
        limit: int = 10
    ) -> List[Tuple[Memory, float]]:
        """
        Search memories by embedding similarity (thread-safe read).
        """
        with self._read_connection() as conn:
            cursor = conn.cursor()
            
            # Get all embeddings for project
            cursor.execute("""
                SELECT me.memory_id, me.embedding
                FROM memory_embeddings me
                JOIN memories m ON me.memory_id = m.id
                WHERE m.project_id = ? AND m.is_active = 1
            """, (project_id,))
            
            rows = cursor.fetchall()
            
            if not rows:
                return []
            
            # Calculate similarities
            results = []
            query_vec = np.array(query_embedding) if HAS_NUMPY else query_embedding
            
            for row in rows:
                if row['embedding']:
                    if HAS_NUMPY:
                        stored_vec = np.frombuffer(row['embedding'], dtype=np.float32)
                        # Cosine similarity
                        norm_q = np.linalg.norm(query_vec)
                        norm_s = np.linalg.norm(stored_vec)
                        if norm_q > 0 and norm_s > 0:
                            similarity = np.dot(query_vec, stored_vec) / (norm_q * norm_s)
                        else:
                            similarity = 0
                    else:
                        # Simple dot product fallback
                        import struct
                        num_floats = len(row['embedding']) // 4
                        stored_vec = list(struct.unpack(f'{num_floats}f', row['embedding']))
                        similarity = sum(a * b for a, b in zip(query_embedding, stored_vec))
                    
                    results.append((row['memory_id'], float(similarity)))
            
            # Sort by similarity
            results.sort(key=lambda x: x[1], reverse=True)
            results = results[:limit]
            
            # Fetch full memories
            memories_with_scores = []
            for memory_id, score in results:
                memory = self.get_memory(memory_id)
                if memory:
                    memory.relevance_score = score
                    memories_with_scores.append((memory, score))
            
            return memories_with_scores
    
    # ==================== Relationship Operations ====================
    
    def add_relation(
        self,
        source_id: str,
        target_id: str,
        relation_type: RelationType
    ):
        """Add a relationship between two memories (thread-safe write)"""
        def add(conn):
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO memory_relations (source_id, target_id, relation_type)
                VALUES (?, ?, ?)
            """, (source_id, target_id, relation_type.value))
            return True
        
        self._execute_write(add)
    
    def get_related_memories(
        self,
        memory_id: str,
        relation_type: RelationType = None
    ) -> List[Tuple[Memory, str]]:
        """Get memories related to a given memory (thread-safe read)"""
        with self._read_connection() as conn:
            cursor = conn.cursor()
            
            query = """
                SELECT m.*, mr.relation_type
                FROM memories m
                JOIN memory_relations mr ON m.id = mr.target_id
                WHERE mr.source_id = ? AND m.is_active = 1
            """
            params = [memory_id]
            
            if relation_type:
                query += " AND mr.relation_type = ?"
                params.append(relation_type.value)
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            results = []
            for row in rows:
                memory = Memory(
                    id=row['id'],
                    project_id=row['project_id'],
                    type=MemoryType(row['type']),
                    title=row['title'],
                    content=row['content'],
                    metadata=json.loads(row['metadata']) if row['metadata'] else {},
                    importance=row['importance'],
                    source=row['source'],
                    created_at=datetime.fromisoformat(row['created_at']) if row['created_at'] else datetime.now(),
                    updated_at=datetime.fromisoformat(row['updated_at']) if row['updated_at'] else datetime.now(),
                    expires_at=datetime.fromisoformat(row['expires_at']) if row['expires_at'] else None,
                    is_active=bool(row['is_active']),
                    tags=[]
                )
                results.append((memory, row['relation_type']))
            
            return results
    
    # ==================== Cleanup Operations ====================
    
    def cleanup_expired(self, project_id: str = None):
        """Remove expired memories (thread-safe write)"""
        def cleanup(conn):
            cursor = conn.cursor()
            
            query = """
                UPDATE memories SET is_active = 0
                WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP
            """
            params = []
            
            if project_id:
                query += " AND project_id = ?"
                params.append(project_id)
            
            cursor.execute(query, params)
            return cursor.rowcount
        
        return self._execute_write(cleanup)
    
    def get_memory_stats(self, project_id: str) -> Dict:
        """Get statistics about project memories (thread-safe read)"""
        with self._read_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT 
                    type,
                    COUNT(*) as count,
                    AVG(importance) as avg_importance
                FROM memories
                WHERE project_id = ? AND is_active = 1
                GROUP BY type
            """, (project_id,))
            
            type_stats = {row['type']: {
                'count': row['count'],
                'avg_importance': row['avg_importance']
            } for row in cursor.fetchall()}
            
            cursor.execute("""
                SELECT COUNT(*) as total FROM memories
                WHERE project_id = ? AND is_active = 1
            """, (project_id,))
            total = cursor.fetchone()['total']
            
            return {
                'total_memories': total,
                'by_type': type_stats
            }


# Singleton instance with thread-safe initialization
_memory_store: Optional[MemoryStore] = None
_store_lock = threading.Lock()

def get_memory_store() -> MemoryStore:
    """Get the singleton memory store instance (thread-safe)"""
    global _memory_store
    if _memory_store is None:
        with _store_lock:
            if _memory_store is None:
                _memory_store = MemoryStore()
    return _memory_store
