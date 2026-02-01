// File Explorer Component
// File tree view with search and preview

import { useState, useEffect, useCallback } from 'react';
import { 
  useCli, 
  FileNode, 
  searchFiles,
  SearchResult,
  getLanguageIcon,
  formatFileSize,
} from '../../services/cliService';

interface FileExplorerProps {
  className?: string;
  onFileSelect?: (path: string) => void;
}

export function FileExplorer({ className = '', onFileSelect }: FileExplorerProps) {
  const { files, openFile, refreshFiles, workspace } = useCli();
  
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Search files
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchFiles(searchQuery);
        setSearchResults(results);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleFileClick = useCallback((path: string) => {
    setSelectedPath(path);
    openFile(path);
    onFileSelect?.(path);
  }, [openFile, onFileSelect]);

  const handleSearchResultClick = useCallback((result: SearchResult) => {
    setSelectedPath(result.file_path);
    openFile(result.file_path);
    onFileSelect?.(result.file_path);
    setSearchQuery('');
  }, [openFile, onFileSelect]);

  return (
    <div className={`flex flex-col h-full bg-gray-800 ${className}`}>
      {/* Header */}
      <div className="p-3 border-b border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-300">Explorer</span>
          <button
            onClick={refreshFiles}
            className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
            title="Refresh"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
        
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files... (Ctrl+P)"
            className="w-full px-3 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded focus:border-blue-500 focus:outline-none text-white placeholder-gray-400"
          />
          {isSearching && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
              ⏳
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Search Results */}
        {searchQuery && searchResults.length > 0 && (
          <div className="p-2 border-b border-gray-700">
            <div className="text-xs text-gray-500 mb-2">
              {searchResults.length} results
            </div>
            {searchResults.slice(0, 20).map((result, i) => (
              <button
                key={i}
                onClick={() => handleSearchResultClick(result)}
                className="w-full text-left px-2 py-1 hover:bg-gray-700 rounded text-sm"
              >
                <div className="text-gray-300 truncate">{result.file_path}</div>
                <div className="text-xs text-gray-500 truncate">
                  Line {result.line_number}: {result.line_content}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* File Tree */}
        {!searchQuery && (
          <div className="p-2">
            {workspace && (
              <div className="text-xs text-gray-500 mb-2 truncate" title={workspace}>
                📁 {workspace.split('/').pop()}
              </div>
            )}
            {files.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                No workspace selected
              </div>
            ) : (
              <FileTree
                nodes={files}
                expandedDirs={expandedDirs}
                selectedPath={selectedPath}
                onToggle={toggleDir}
                onSelect={handleFileClick}
                level={0}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// File Tree Component
function FileTree({
  nodes,
  expandedDirs,
  selectedPath,
  onToggle,
  onSelect,
  level,
}: {
  nodes: FileNode[];
  expandedDirs: Set<string>;
  selectedPath: string | null;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  level: number;
}) {
  return (
    <div className="space-y-0.5">
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          expandedDirs={expandedDirs}
          selectedPath={selectedPath}
          onToggle={onToggle}
          onSelect={onSelect}
          level={level}
        />
      ))}
    </div>
  );
}

// File Tree Node Component
function FileTreeNode({
  node,
  expandedDirs,
  selectedPath,
  onToggle,
  onSelect,
  level,
}: {
  node: FileNode;
  expandedDirs: Set<string>;
  selectedPath: string | null;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  level: number;
}) {
  const isExpanded = expandedDirs.has(node.path);
  const isSelected = selectedPath === node.path;

  const handleClick = () => {
    if (node.is_dir) {
      onToggle(node.path);
    } else {
      onSelect(node.path);
    }
  };

  const getFileIcon = () => {
    if (node.is_dir) {
      return isExpanded ? '📂' : '📁';
    }
    return getLanguageIcon(node.extension || '');
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-1 px-2 py-0.5 text-sm rounded hover:bg-gray-700 ${
          isSelected ? 'bg-gray-700 text-white' : 'text-gray-300'
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {node.is_dir && (
          <span className="text-gray-500 text-xs">
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
        <span className="text-sm">{getFileIcon()}</span>
        <span className="truncate flex-1 text-left">{node.name}</span>
        {!node.is_dir && node.size && (
          <span className="text-xs text-gray-500">
            {formatFileSize(node.size)}
          </span>
        )}
      </button>
      
      {node.is_dir && isExpanded && node.children && (
        <FileTree
          nodes={node.children}
          expandedDirs={expandedDirs}
          selectedPath={selectedPath}
          onToggle={onToggle}
          onSelect={onSelect}
          level={level + 1}
        />
      )}
    </div>
  );
}

export default FileExplorer;
