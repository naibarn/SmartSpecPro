/**
 * SmartSpec Pro - Asset Browser Component
 * UI for browsing, searching, and managing project assets
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Asset,
  AssetListResponse,
  AssetSearchParams,
  searchAssets,
  deleteAsset,
  updateAsset,
  getAssetVersions,
  formatFileSize,
  getAssetTypeIcon,
  getAssetTypeColor,
} from '../services/assetService';

// ============================================
// Types
// ============================================

interface AssetBrowserProps {
  projectId?: string;
  specId?: string;
  onAssetSelect?: (asset: Asset) => void;
  onAssetInsert?: (asset: Asset) => void;
}

type ViewMode = 'grid' | 'list';
type AssetTypeFilter = 'all' | 'image' | 'video' | 'audio';

// ============================================
// Styles
// ============================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    backgroundColor: '#1e1e1e',
    color: '#e0e0e0',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #333',
    backgroundColor: '#252526',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    margin: 0,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderBottom: '1px solid #333',
  },
  searchInput: {
    flex: 1,
    padding: '8px 12px',
    backgroundColor: '#3c3c3c',
    border: '1px solid #555',
    borderRadius: '4px',
    color: '#e0e0e0',
    fontSize: '14px',
  },
  filterButton: {
    padding: '8px 12px',
    backgroundColor: '#3c3c3c',
    border: '1px solid #555',
    borderRadius: '4px',
    color: '#e0e0e0',
    cursor: 'pointer',
    fontSize: '14px',
  },
  filterButtonActive: {
    backgroundColor: '#0e639c',
    borderColor: '#0e639c',
  },
  viewToggle: {
    display: 'flex',
    gap: '4px',
  },
  viewButton: {
    padding: '6px 10px',
    backgroundColor: 'transparent',
    border: '1px solid #555',
    borderRadius: '4px',
    color: '#e0e0e0',
    cursor: 'pointer',
    fontSize: '14px',
  },
  viewButtonActive: {
    backgroundColor: '#0e639c',
    borderColor: '#0e639c',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '16px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  assetCard: {
    backgroundColor: '#2d2d2d',
    borderRadius: '8px',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
    border: '1px solid #3c3c3c',
  },
  assetCardHover: {
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
  assetThumbnail: {
    width: '100%',
    height: '120px',
    backgroundColor: '#1e1e1e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '48px',
  },
  assetImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },
  assetInfo: {
    padding: '12px',
  },
  assetFilename: {
    fontSize: '14px',
    fontWeight: 500,
    marginBottom: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  assetMeta: {
    fontSize: '12px',
    color: '#888',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  assetTypeBadge: {
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: '#2d2d2d',
    borderRadius: '8px',
    gap: '12px',
    cursor: 'pointer',
    border: '1px solid #3c3c3c',
  },
  listItemIcon: {
    fontSize: '24px',
    width: '40px',
    textAlign: 'center' as const,
  },
  listItemInfo: {
    flex: 1,
  },
  listItemActions: {
    display: 'flex',
    gap: '8px',
  },
  actionButton: {
    padding: '6px 12px',
    backgroundColor: '#3c3c3c',
    border: 'none',
    borderRadius: '4px',
    color: '#e0e0e0',
    cursor: 'pointer',
    fontSize: '12px',
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '16px',
    borderTop: '1px solid #333',
  },
  pageButton: {
    padding: '8px 16px',
    backgroundColor: '#3c3c3c',
    border: 'none',
    borderRadius: '4px',
    color: '#e0e0e0',
    cursor: 'pointer',
  },
  pageButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  pageInfo: {
    fontSize: '14px',
    color: '#888',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '300px',
    color: '#888',
  },
  emptyIcon: {
    fontSize: '64px',
    marginBottom: '16px',
  },
  emptyText: {
    fontSize: '16px',
    marginBottom: '8px',
  },
  emptySubtext: {
    fontSize: '14px',
    color: '#666',
  },
  detailPanel: {
    position: 'fixed' as const,
    top: 0,
    right: 0,
    width: '400px',
    height: '100%',
    backgroundColor: '#252526',
    borderLeft: '1px solid #333',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column' as const,
  },
  detailHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px',
    borderBottom: '1px solid #333',
  },
  detailContent: {
    flex: 1,
    overflow: 'auto',
    padding: '16px',
  },
  detailPreview: {
    width: '100%',
    height: '200px',
    backgroundColor: '#1e1e1e',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
    overflow: 'hidden',
  },
  detailField: {
    marginBottom: '16px',
  },
  detailLabel: {
    fontSize: '12px',
    color: '#888',
    marginBottom: '4px',
  },
  detailValue: {
    fontSize: '14px',
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  tag: {
    padding: '4px 8px',
    backgroundColor: '#3c3c3c',
    borderRadius: '4px',
    fontSize: '12px',
  },
  closeButton: {
    padding: '8px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#e0e0e0',
    cursor: 'pointer',
    fontSize: '18px',
  },
};

// ============================================
// Asset Browser Component
// ============================================

export const AssetBrowser: React.FC<AssetBrowserProps> = ({
  projectId,
  specId,
  onAssetSelect,
  onAssetInsert,
}) => {
  // State
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetTypeFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [hoveredAssetId, setHoveredAssetId] = useState<string | null>(null);

  // Load assets
  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params: AssetSearchParams = {
        page,
        page_size: 20,
        is_latest: true,
        status: 'active',
      };

      if (searchQuery) {
        params.query = searchQuery;
      }
      if (assetTypeFilter !== 'all') {
        params.asset_type = assetTypeFilter;
      }
      if (projectId) {
        params.project_id = projectId;
      }
      if (specId) {
        params.spec_id = specId;
      }

      const response = await searchAssets(params);
      setAssets(response.items);
      setTotalPages(response.total_pages);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, assetTypeFilter, projectId, specId]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  // Handlers
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setPage(1);
  };

  const handleFilterChange = (filter: AssetTypeFilter) => {
    setAssetTypeFilter(filter);
    setPage(1);
  };

  const handleAssetClick = (asset: Asset) => {
    setSelectedAsset(asset);
    onAssetSelect?.(asset);
  };

  const handleInsert = (asset: Asset) => {
    onAssetInsert?.(asset);
  };

  const handleDelete = async (asset: Asset) => {
    if (confirm(`Are you sure you want to delete "${asset.filename}"?`)) {
      try {
        await deleteAsset(asset.id);
        loadAssets();
        if (selectedAsset?.id === asset.id) {
          setSelectedAsset(null);
        }
      } catch (err) {
        alert('Failed to delete asset');
      }
    }
  };

  // Render asset thumbnail
  const renderThumbnail = (asset: Asset) => {
    if (asset.asset_type === 'image' && asset.relative_path) {
      return (
        <img
          src={`file://${asset.relative_path}`}
          alt={asset.alt_text || asset.filename}
          style={styles.assetImage}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      );
    }
    return <span>{getAssetTypeIcon(asset.asset_type)}</span>;
  };

  // Render grid view
  const renderGridView = () => (
    <div style={styles.grid}>
      {assets.map((asset) => (
        <div
          key={asset.id}
          style={{
            ...styles.assetCard,
            ...(hoveredAssetId === asset.id ? styles.assetCardHover : {}),
          }}
          onClick={() => handleAssetClick(asset)}
          onMouseEnter={() => setHoveredAssetId(asset.id)}
          onMouseLeave={() => setHoveredAssetId(null)}
        >
          <div style={styles.assetThumbnail}>
            {renderThumbnail(asset)}
          </div>
          <div style={styles.assetInfo}>
            <div style={styles.assetFilename} title={asset.filename}>
              {asset.filename}
            </div>
            <div style={styles.assetMeta}>
              <span
                style={{
                  ...styles.assetTypeBadge,
                  backgroundColor: getAssetTypeColor(asset.asset_type),
                }}
              >
                {asset.asset_type}
              </span>
              <span>{formatFileSize(asset.file_size)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  // Render list view
  const renderListView = () => (
    <div style={styles.list}>
      {assets.map((asset) => (
        <div
          key={asset.id}
          style={styles.listItem}
          onClick={() => handleAssetClick(asset)}
        >
          <div style={styles.listItemIcon}>
            {getAssetTypeIcon(asset.asset_type)}
          </div>
          <div style={styles.listItemInfo}>
            <div style={styles.assetFilename}>{asset.filename}</div>
            <div style={styles.assetMeta}>
              <span
                style={{
                  ...styles.assetTypeBadge,
                  backgroundColor: getAssetTypeColor(asset.asset_type),
                }}
              >
                {asset.asset_type}
              </span>
              <span>{formatFileSize(asset.file_size)}</span>
              <span>v{asset.version}</span>
              <span>{new Date(asset.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          <div style={styles.listItemActions}>
            <button
              style={styles.actionButton}
              onClick={(e) => {
                e.stopPropagation();
                handleInsert(asset);
              }}
            >
              Insert
            </button>
            <button
              style={styles.actionButton}
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(asset);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  // Render empty state
  const renderEmptyState = () => (
    <div style={styles.emptyState}>
      <div style={styles.emptyIcon}>📁</div>
      <div style={styles.emptyText}>No assets found</div>
      <div style={styles.emptySubtext}>
        {searchQuery
          ? 'Try adjusting your search or filters'
          : 'Generate some assets to get started'}
      </div>
    </div>
  );

  // Render detail panel
  const renderDetailPanel = () => {
    if (!selectedAsset) return null;

    return (
      <div style={styles.detailPanel}>
        <div style={styles.detailHeader}>
          <h3 style={{ margin: 0 }}>Asset Details</h3>
          <button
            style={styles.closeButton}
            onClick={() => setSelectedAsset(null)}
          >
            ✕
          </button>
        </div>
        <div style={styles.detailContent}>
          <div style={styles.detailPreview}>
            {renderThumbnail(selectedAsset)}
          </div>

          <div style={styles.detailField}>
            <div style={styles.detailLabel}>Filename</div>
            <div style={styles.detailValue}>{selectedAsset.filename}</div>
          </div>

          <div style={styles.detailField}>
            <div style={styles.detailLabel}>Type</div>
            <div style={styles.detailValue}>
              {getAssetTypeIcon(selectedAsset.asset_type)} {selectedAsset.asset_type}
            </div>
          </div>

          <div style={styles.detailField}>
            <div style={styles.detailLabel}>Path</div>
            <div style={styles.detailValue}>{selectedAsset.relative_path}</div>
          </div>

          <div style={styles.detailField}>
            <div style={styles.detailLabel}>Size</div>
            <div style={styles.detailValue}>{formatFileSize(selectedAsset.file_size)}</div>
          </div>

          <div style={styles.detailField}>
            <div style={styles.detailLabel}>Version</div>
            <div style={styles.detailValue}>v{selectedAsset.version}</div>
          </div>

          {selectedAsset.description && (
            <div style={styles.detailField}>
              <div style={styles.detailLabel}>Description</div>
              <div style={styles.detailValue}>{selectedAsset.description}</div>
            </div>
          )}

          {selectedAsset.metadata?.prompt && (
            <div style={styles.detailField}>
              <div style={styles.detailLabel}>Prompt</div>
              <div style={styles.detailValue}>{selectedAsset.metadata.prompt}</div>
            </div>
          )}

          {selectedAsset.metadata?.model && (
            <div style={styles.detailField}>
              <div style={styles.detailLabel}>Model</div>
              <div style={styles.detailValue}>{selectedAsset.metadata.model}</div>
            </div>
          )}

          {selectedAsset.tags && selectedAsset.tags.length > 0 && (
            <div style={styles.detailField}>
              <div style={styles.detailLabel}>Tags</div>
              <div style={styles.tagList}>
                {selectedAsset.tags.map((tag, index) => (
                  <span key={index} style={styles.tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={styles.detailField}>
            <div style={styles.detailLabel}>Created</div>
            <div style={styles.detailValue}>
              {new Date(selectedAsset.created_at).toLocaleString()}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
            <button
              style={{ ...styles.actionButton, flex: 1 }}
              onClick={() => handleInsert(selectedAsset)}
            >
              Insert into Spec
            </button>
            <button
              style={{ ...styles.actionButton, flex: 1 }}
              onClick={() => handleDelete(selectedAsset)}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Asset Browser</h2>
        <span style={{ fontSize: '14px', color: '#888' }}>
          {total} asset{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Toolbar */}
      <div style={styles.toolbar}>
        <input
          type="text"
          placeholder="Search assets..."
          value={searchQuery}
          onChange={handleSearch}
          style={styles.searchInput}
        />

        {/* Type filters */}
        {(['all', 'image', 'video', 'audio'] as AssetTypeFilter[]).map((filter) => (
          <button
            key={filter}
            style={{
              ...styles.filterButton,
              ...(assetTypeFilter === filter ? styles.filterButtonActive : {}),
            }}
            onClick={() => handleFilterChange(filter)}
          >
            {filter === 'all' ? 'All' : getAssetTypeIcon(filter)}
          </button>
        ))}

        {/* View toggle */}
        <div style={styles.viewToggle}>
          <button
            style={{
              ...styles.viewButton,
              ...(viewMode === 'grid' ? styles.viewButtonActive : {}),
            }}
            onClick={() => setViewMode('grid')}
          >
            ⊞
          </button>
          <button
            style={{
              ...styles.viewButton,
              ...(viewMode === 'list' ? styles.viewButtonActive : {}),
            }}
            onClick={() => setViewMode('list')}
          >
            ☰
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {loading ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyText}>Loading...</div>
          </div>
        ) : error ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>⚠️</div>
            <div style={styles.emptyText}>{error}</div>
          </div>
        ) : assets.length === 0 ? (
          renderEmptyState()
        ) : viewMode === 'grid' ? (
          renderGridView()
        ) : (
          renderListView()
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button
            style={{
              ...styles.pageButton,
              ...(page === 1 ? styles.pageButtonDisabled : {}),
            }}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </button>
          <span style={styles.pageInfo}>
            Page {page} of {totalPages}
          </span>
          <button
            style={{
              ...styles.pageButton,
              ...(page === totalPages ? styles.pageButtonDisabled : {}),
            }}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next
          </button>
        </div>
      )}

      {/* Detail Panel */}
      {renderDetailPanel()}
    </div>
  );
};

export default AssetBrowser;
