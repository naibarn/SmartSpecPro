import { useState, useEffect, useCallback } from 'react';
import { detectPlatform } from '@smartspec/shared';
import DesktopOnlyMessage from '@/components/DesktopOnlyMessage';
import { tauriInvoke } from '@/hooks/useTauriInvoke';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  File, Folder, FolderOpen, ChevronRight, ChevronDown,
  Save, GitBranch, RefreshCw, Loader2, Search,
} from 'lucide-react';

interface TreeEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children?: TreeEntry[];
}

interface GitBranchInfo {
  name: string;
  is_current: boolean;
}

export default function CLIPage() {
  if (detectPlatform() !== 'desktop') {
    return <DesktopOnlyMessage feature="CLI" />;
  }
  return <CLIDashboard />;
}

function CLIDashboard() {
  const [rootPath, setRootPath] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('cli-root-path') || '/home';
    }
    return '/home';
  });
  const [tree, setTree] = useState<TreeEntry | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [modified, setModified] = useState(false);
  const [gitStatus, setGitStatus] = useState('');
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);

  const loadTree = useCallback(async () => {
    try {
      const t = await tauriInvoke<TreeEntry>('fs_get_file_tree', { path: rootPath, depth: 3 });
      setTree(t);
    } catch { /* ignore */ }
    setLoading(false);
  }, [rootPath]);

  const loadGitInfo = useCallback(async () => {
    try {
      const [status, br] = await Promise.allSettled([
        tauriInvoke<string>('git_status', { path: rootPath }),
        tauriInvoke<GitBranchInfo[]>('git_list_branches', { path: rootPath }),
      ]);
      setGitStatus(status.status === 'fulfilled' ? status.value : '');
      setBranches(br.status === 'fulfilled' ? br.value : []);
    } catch { /* not a git repo */ }
  }, [rootPath]);

  useEffect(() => {
    loadTree();
    loadGitInfo();
  }, [loadTree, loadGitInfo]);

  const openFile = async (path: string) => {
    try {
      const content = await tauriInvoke<string>('fs_read_file', { path });
      setSelectedFile(path);
      setFileContent(content);
      setModified(false);
    } catch (e) {
      console.error(e);
    }
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await tauriInvoke('fs_write_file', { path: selectedFile, content: fileContent });
      setModified(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      const results = await tauriInvoke<string[]>('fs_search_files', { path: rootPath, query: searchQuery });
      setSearchResults(results);
    } catch { /* ignore */ }
  };

  const changeRoot = () => {
    const newPath = prompt('Enter absolute path:', rootPath);
    if (newPath) {
      setRootPath(newPath);
      localStorage.setItem('cli-root-path', newPath);
      setSelectedFile(null);
      setLoading(true);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentBranch = branches.find(b => b.is_current)?.name;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
        <Button variant="outline" size="sm" onClick={changeRoot} className="gap-1.5 text-xs">
          <Folder className="w-3.5 h-3.5" />
          {rootPath}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { loadTree(); loadGitInfo(); }}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>

        <div className="flex-1" />

        <div className="flex items-center gap-1">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search files..."
            className="h-7 px-2 text-xs rounded-md border bg-background w-40"
          />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSearch}>
            <Search className="w-3.5 h-3.5" />
          </Button>
        </div>

        {currentBranch && (
          <Badge variant="outline" className="gap-1 text-xs">
            <GitBranch className="w-3 h-3" />
            {currentBranch}
          </Badge>
        )}
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* File tree sidebar */}
        <div className="w-72 border-r overflow-auto bg-muted/20 shrink-0">
          {searchResults.length > 0 ? (
            <div className="p-2 space-y-0.5">
              <div className="text-xs text-muted-foreground px-2 py-1">Search Results ({searchResults.length})</div>
              {searchResults.map(r => (
                <button
                  key={r}
                  onClick={() => openFile(r)}
                  className="w-full text-left text-xs px-2 py-1 rounded hover:bg-muted truncate flex items-center gap-1.5"
                >
                  <File className="w-3 h-3 shrink-0 text-muted-foreground" />
                  {r.replace(rootPath, '.')}
                </button>
              ))}
              <Button variant="ghost" size="sm" className="w-full text-xs mt-1" onClick={() => setSearchResults([])}>
                Clear Results
              </Button>
            </div>
          ) : tree ? (
            <div className="p-1">
              <TreeNode entry={tree} depth={0} onSelect={openFile} selectedPath={selectedFile} />
            </div>
          ) : (
            <div className="p-4 text-sm text-muted-foreground">No files</div>
          )}
        </div>

        {/* Editor area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedFile ? (
            <>
              <div className="flex items-center justify-between px-4 py-1.5 border-b bg-muted/20 shrink-0">
                <span className="text-xs text-muted-foreground truncate">
                  {selectedFile}
                  {modified && <span className="text-primary ml-1">(modified)</span>}
                </span>
                <Button
                  variant="default"
                  size="sm"
                  onClick={saveFile}
                  disabled={!modified || saving}
                  className="gap-1.5 h-6 text-xs"
                >
                  <Save className="w-3 h-3" />
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
              <textarea
                value={fileContent}
                onChange={(e) => { setFileContent(e.target.value); setModified(true); }}
                className="flex-1 w-full p-4 font-mono text-sm bg-background text-foreground resize-none outline-none"
                spellCheck={false}
              />
            </>
          ) : (
            <div className="flex items-center justify-center flex-1 text-muted-foreground">
              <div className="text-center space-y-2">
                <File className="w-12 h-12 mx-auto opacity-30" />
                <p className="text-sm">Select a file to view</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Git status bar */}
      {gitStatus && (
        <div className="border-t px-4 py-1 bg-muted/30 shrink-0">
          <pre className="text-xs text-muted-foreground font-mono truncate">{gitStatus.trim().split('\n').slice(0, 3).join(' | ')}</pre>
        </div>
      )}
    </div>
  );
}

function TreeNode({ entry, depth, onSelect, selectedPath }: {
  entry: TreeEntry;
  depth: number;
  onSelect: (path: string) => void;
  selectedPath: string | null;
}) {
  const [open, setOpen] = useState(depth < 1);
  const isSelected = selectedPath === entry.path;

  if (entry.is_dir) {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className={`w-full flex items-center gap-1 px-1.5 py-0.5 text-xs rounded hover:bg-muted transition-colors ${
            isSelected ? 'bg-primary/10 text-primary' : 'text-foreground'
          }`}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
          {open ? <FolderOpen className="w-3.5 h-3.5 shrink-0 text-primary" /> : <Folder className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate">{entry.name}</span>
        </button>
        {open && entry.children?.map(child => (
          <TreeNode key={child.path} entry={child} depth={depth + 1} onSelect={onSelect} selectedPath={selectedPath} />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(entry.path)}
      className={`w-full flex items-center gap-1.5 px-1.5 py-0.5 text-xs rounded hover:bg-muted transition-colors ${
        isSelected ? 'bg-primary/10 text-primary' : 'text-foreground'
      }`}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      <File className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{entry.name}</span>
    </button>
  );
}
