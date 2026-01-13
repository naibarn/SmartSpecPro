"""
Index Manager for Vector Store
Phase 3: SaaS Readiness
"""

import structlog
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, List

logger = structlog.get_logger(__name__)


class IndexType(str, Enum):
    """Types of vector indexes."""
    FLAT = "flat"  # Exact search (no index)
    IVFFLAT = "ivfflat"  # Inverted file with flat quantization
    HNSW = "hnsw"  # Hierarchical Navigable Small World


class IndexStatus(str, Enum):
    """Status of an index."""
    PENDING = "pending"
    BUILDING = "building"
    READY = "ready"
    FAILED = "failed"
    REBUILDING = "rebuilding"


@dataclass
class IndexConfig:
    """Configuration for a vector index."""
    
    name: str = ""
    index_type: IndexType = IndexType.IVFFLAT
    
    # IVFFlat parameters
    lists: int = 100  # Number of clusters
    
    # HNSW parameters
    m: int = 16  # Max connections per layer
    ef_construction: int = 64  # Size of dynamic candidate list
    
    # Common parameters
    distance_metric: str = "cosine"  # cosine, l2, inner_product
    
    # Maintenance
    auto_vacuum: bool = True
    rebuild_threshold: float = 0.3  # Rebuild when 30% of data changed


@dataclass
class IndexInfo:
    """Information about an index."""
    
    name: str = ""
    table_name: str = ""
    index_type: IndexType = IndexType.IVFFLAT
    status: IndexStatus = IndexStatus.PENDING
    
    # Statistics
    row_count: int = 0
    index_size_bytes: int = 0
    
    # Timestamps
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_rebuilt_at: Optional[datetime] = None
    
    # Performance
    avg_search_time_ms: float = 0.0
    search_count: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "name": self.name,
            "table_name": self.table_name,
            "index_type": self.index_type.value,
            "status": self.status.value,
            "row_count": self.row_count,
            "index_size_bytes": self.index_size_bytes,
            "index_size_mb": round(self.index_size_bytes / (1024 * 1024), 2),
            "created_at": self.created_at.isoformat(),
            "last_rebuilt_at": self.last_rebuilt_at.isoformat() if self.last_rebuilt_at else None,
            "avg_search_time_ms": round(self.avg_search_time_ms, 2),
            "search_count": self.search_count,
        }


class IndexManager:
    """
    Manager for vector store indexes.
    
    Features:
    - Create/drop indexes
    - Monitor index health
    - Automatic rebuilding
    - Performance tracking
    """
    
    def __init__(self, connection=None):
        """
        Initialize index manager.
        
        Args:
            connection: Database connection
        """
        self._connection = connection
        self._indexes: Dict[str, IndexInfo] = {}
        self._logger = logger.bind(component="index_manager")
    
    async def create_index(
        self,
        table_name: str,
        column_name: str = "embedding",
        config: Optional[IndexConfig] = None,
    ) -> IndexInfo:
        """
        Create a vector index.
        
        Args:
            table_name: Table name
            column_name: Column name
            config: Index configuration
        
        Returns:
            Index information
        """
        config = config or IndexConfig()
        index_name = f"idx_{table_name}_{column_name}_{config.index_type.value}"
        
        info = IndexInfo(
            name=index_name,
            table_name=table_name,
            index_type=config.index_type,
            status=IndexStatus.BUILDING,
        )
        
        self._indexes[index_name] = info
        
        if self._connection:
            try:
                # Build index SQL based on type
                if config.index_type == IndexType.IVFFLAT:
                    ops = self._get_ops_class(config.distance_metric)
                    sql = f"""
                        CREATE INDEX IF NOT EXISTS {index_name}
                        ON {table_name}
                        USING ivfflat ({column_name} {ops})
                        WITH (lists = {config.lists})
                    """
                elif config.index_type == IndexType.HNSW:
                    ops = self._get_ops_class(config.distance_metric)
                    sql = f"""
                        CREATE INDEX IF NOT EXISTS {index_name}
                        ON {table_name}
                        USING hnsw ({column_name} {ops})
                        WITH (m = {config.m}, ef_construction = {config.ef_construction})
                    """
                else:  # FLAT
                    sql = None
                
                if sql:
                    await self._connection.execute(sql)
                
                info.status = IndexStatus.READY
                self._logger.info(
                    "index_created",
                    name=index_name,
                    type=config.index_type.value,
                )
                
            except Exception as e:
                info.status = IndexStatus.FAILED
                self._logger.error(
                    "index_creation_failed",
                    name=index_name,
                    error=str(e),
                )
                raise
        else:
            # Memory mode
            info.status = IndexStatus.READY
        
        return info
    
    async def drop_index(self, index_name: str) -> bool:
        """Drop an index."""
        if index_name not in self._indexes:
            return False
        
        if self._connection:
            try:
                await self._connection.execute(f"DROP INDEX IF EXISTS {index_name}")
            except Exception as e:
                self._logger.error("index_drop_failed", name=index_name, error=str(e))
                raise
        
        del self._indexes[index_name]
        self._logger.info("index_dropped", name=index_name)
        return True
    
    async def rebuild_index(self, index_name: str) -> IndexInfo:
        """Rebuild an index."""
        info = self._indexes.get(index_name)
        if not info:
            raise ValueError(f"Index not found: {index_name}")
        
        info.status = IndexStatus.REBUILDING
        
        if self._connection:
            try:
                # Reindex
                await self._connection.execute(f"REINDEX INDEX {index_name}")
                
                info.status = IndexStatus.READY
                info.last_rebuilt_at = datetime.utcnow()
                
                self._logger.info("index_rebuilt", name=index_name)
                
            except Exception as e:
                info.status = IndexStatus.FAILED
                self._logger.error("index_rebuild_failed", name=index_name, error=str(e))
                raise
        else:
            info.status = IndexStatus.READY
            info.last_rebuilt_at = datetime.utcnow()
        
        return info
    
    async def get_index_info(self, index_name: str) -> Optional[IndexInfo]:
        """Get index information."""
        info = self._indexes.get(index_name)
        
        if info and self._connection:
            # Update statistics from database
            try:
                row = await self._connection.fetchrow(f"""
                    SELECT 
                        pg_relation_size('{index_name}') as size,
                        (SELECT COUNT(*) FROM {info.table_name}) as row_count
                """)
                
                if row:
                    info.index_size_bytes = row["size"]
                    info.row_count = row["row_count"]
                    
            except Exception as e:
                self._logger.warning("stats_fetch_failed", error=str(e))
        
        return info
    
    async def list_indexes(
        self,
        table_name: Optional[str] = None,
    ) -> List[IndexInfo]:
        """List all indexes."""
        indexes = list(self._indexes.values())
        
        if table_name:
            indexes = [i for i in indexes if i.table_name == table_name]
        
        return indexes
    
    async def analyze_table(self, table_name: str) -> Dict[str, Any]:
        """Analyze table for index optimization."""
        if not self._connection:
            return {"status": "memory_mode"}
        
        try:
            # Run ANALYZE
            await self._connection.execute(f"ANALYZE {table_name}")
            
            # Get table statistics
            row = await self._connection.fetchrow(f"""
                SELECT 
                    pg_total_relation_size('{table_name}') as total_size,
                    pg_table_size('{table_name}') as table_size,
                    pg_indexes_size('{table_name}') as indexes_size,
                    (SELECT COUNT(*) FROM {table_name}) as row_count
            """)
            
            return {
                "table_name": table_name,
                "total_size_bytes": row["total_size"],
                "table_size_bytes": row["table_size"],
                "indexes_size_bytes": row["indexes_size"],
                "row_count": row["row_count"],
                "analyzed_at": datetime.utcnow().isoformat(),
            }
            
        except Exception as e:
            self._logger.error("analyze_failed", table=table_name, error=str(e))
            raise
    
    async def vacuum_table(
        self,
        table_name: str,
        full: bool = False,
    ) -> Dict[str, Any]:
        """Vacuum table to reclaim space."""
        if not self._connection:
            return {"status": "memory_mode"}
        
        try:
            if full:
                await self._connection.execute(f"VACUUM FULL {table_name}")
            else:
                await self._connection.execute(f"VACUUM {table_name}")
            
            return {
                "table_name": table_name,
                "full": full,
                "vacuumed_at": datetime.utcnow().isoformat(),
            }
            
        except Exception as e:
            self._logger.error("vacuum_failed", table=table_name, error=str(e))
            raise
    
    def _get_ops_class(self, distance_metric: str) -> str:
        """Get pgvector operator class for distance metric."""
        ops_map = {
            "cosine": "vector_cosine_ops",
            "l2": "vector_l2_ops",
            "inner_product": "vector_ip_ops",
        }
        return ops_map.get(distance_metric, "vector_cosine_ops")
    
    def record_search(
        self,
        index_name: str,
        search_time_ms: float,
    ) -> None:
        """Record search performance."""
        info = self._indexes.get(index_name)
        if info:
            # Update rolling average
            total_time = info.avg_search_time_ms * info.search_count
            info.search_count += 1
            info.avg_search_time_ms = (total_time + search_time_ms) / info.search_count
    
    def get_recommendations(self) -> List[Dict[str, Any]]:
        """Get index optimization recommendations."""
        recommendations = []
        
        for info in self._indexes.values():
            # Check for slow searches
            if info.avg_search_time_ms > 100 and info.search_count > 100:
                recommendations.append({
                    "index": info.name,
                    "type": "performance",
                    "message": f"Average search time ({info.avg_search_time_ms:.0f}ms) is high",
                    "suggestion": "Consider using HNSW index or increasing IVFFlat lists",
                })
            
            # Check for large indexes
            if info.index_size_bytes > 1024 * 1024 * 1024:  # 1GB
                recommendations.append({
                    "index": info.name,
                    "type": "storage",
                    "message": f"Index size ({info.index_size_bytes / (1024**3):.1f}GB) is large",
                    "suggestion": "Consider partitioning or archiving old data",
                })
            
            # Check for stale indexes
            if info.last_rebuilt_at:
                days_since_rebuild = (datetime.utcnow() - info.last_rebuilt_at).days
                if days_since_rebuild > 30:
                    recommendations.append({
                        "index": info.name,
                        "type": "maintenance",
                        "message": f"Index hasn't been rebuilt in {days_since_rebuild} days",
                        "suggestion": "Consider rebuilding for optimal performance",
                    })
        
        return recommendations
