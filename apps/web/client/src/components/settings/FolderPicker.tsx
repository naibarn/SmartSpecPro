/**
 * FolderPicker - lazy-loading folder tree dialog for Google Drive folder selection.
 *
 * Used by the Google Drive dashboard to let users choose which folders
 * to include/exclude from indexing.
 */

import { useState, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronRight, ChevronDown, Loader2, FolderOpen } from "lucide-react";

interface FolderPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  indexingMode: "selected_folders" | "all_except";
  initialSelectedFolders: Array<{ id: string; name: string }>;
  onConfirm: (folders: Array<{ id: string; name: string }>) => void;
}

interface FolderTreeNodeProps {
  folder: { id: string; name: string; hasChildren: boolean };
  depth: number;
  expandedFolders: Set<string>;
  selectedFolders: Map<string, string>;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (id: string, name: string) => void;
}

function FolderTreeNode({
  folder,
  depth,
  expandedFolders,
  selectedFolders,
  onToggleExpand,
  onToggleSelect,
}: FolderTreeNodeProps) {
  const isExpanded = expandedFolders.has(folder.id);
  const isSelected = selectedFolders.has(folder.id);

  const childrenQuery = trpc.googleDrive.listDriveFolders.useQuery(
    { parentFolderId: folder.id },
    { enabled: isExpanded },
  );

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1.5 px-2 rounded hover:bg-gray-50 cursor-pointer"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {folder.hasChildren ? (
          <button
            onClick={() => onToggleExpand(folder.id)}
            className="p-0.5 hover:bg-gray-200 rounded"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}

        <label className="flex items-center gap-2 flex-1 cursor-pointer">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(folder.id, folder.name)}
            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          <FolderOpen className="w-4 h-4 text-amber-500" />
          <span className="text-sm text-gray-700">{folder.name}</span>
        </label>
      </div>

      {isExpanded && (
        <div>
          {childrenQuery.isLoading && (
            <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: `${(depth + 1) * 20 + 16}px` }}>
              <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
              <span className="text-xs text-gray-400">Loading...</span>
            </div>
          )}
          {childrenQuery.data?.length === 0 && !childrenQuery.isLoading && (
            <div className="py-1.5 text-xs text-gray-400" style={{ paddingLeft: `${(depth + 1) * 20 + 16}px` }}>
              No subfolders
            </div>
          )}
          {childrenQuery.data?.map((child) => (
            <FolderTreeNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              expandedFolders={expandedFolders}
              selectedFolders={selectedFolders}
              onToggleExpand={onToggleExpand}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderPicker({
  open,
  onOpenChange,
  indexingMode,
  initialSelectedFolders,
  onConfirm,
}: FolderPickerProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Map<string, string>>(
    () => new Map(initialSelectedFolders.map((f) => [f.id, f.name])),
  );

  // Reset selection state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedFolders(new Map(initialSelectedFolders.map((f) => [f.id, f.name])));
    }
  }, [open, initialSelectedFolders]);

  const rootFoldersQuery = trpc.googleDrive.listDriveFolders.useQuery(
    { parentFolderId: null },
    { enabled: open },
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelect = useCallback((id: string, name: string) => {
    setSelectedFolders((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, name);
      return next;
    });
  }, []);

  const handleConfirm = () => {
    const folders = Array.from(selectedFolders.entries()).map(([id, name]) => ({ id, name }));
    onConfirm(folders);
    onOpenChange(false);
  };

  const modeLabel =
    indexingMode === "selected_folders"
      ? "Select folders to include in indexing"
      : "Select folders to exclude from indexing";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Folders</DialogTitle>
          <p className="text-sm text-gray-500">{modeLabel}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto border rounded-lg p-2 min-h-[200px] max-h-[400px]">
          {rootFoldersQuery.isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400 mr-2" />
              <span className="text-sm text-gray-500">Loading folders...</span>
            </div>
          )}
          {rootFoldersQuery.data?.map((folder) => (
            <FolderTreeNode
              key={folder.id}
              folder={folder}
              depth={0}
              expandedFolders={expandedFolders}
              selectedFolders={selectedFolders}
              onToggleExpand={toggleExpand}
              onToggleSelect={toggleSelect}
            />
          ))}
          {rootFoldersQuery.data?.length === 0 && !rootFoldersQuery.isLoading && (
            <div className="flex items-center justify-center py-8 text-sm text-gray-500">
              No folders found in your Google Drive
            </div>
          )}
        </div>

        <div className="text-xs text-gray-500">
          {selectedFolders.size} folder{selectedFolders.size !== 1 ? "s" : ""} selected
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Save Selection</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
