import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MessageSquarePlus,
  Search,
  MoreVertical,
  Pin,
  Archive,
  Trash2,
  Edit2,
  Loader2,
  CheckSquare,
  X,
  Undo2,
  Trash,
  UsersRound,
  ChevronDown,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConversationScopeBadge } from "./ConversationScopeBadge";

interface ChatSidebarProps {
  selectedConversationId: number | null;
  onSelectConversation: (id: number) => void;
  onNewChat: () => void;
  onNewPersonalChat?: () => void;
  onOpenTeamRoom?: (roomId: string) => void;
}

export function ChatSidebar({
  selectedConversationId,
  onSelectConversation,
  onNewChat,
  onNewPersonalChat,
  onOpenTeamRoom,
}: ChatSidebarProps) {
  const [search, setSearch] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<number | null>(null);
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  // Select mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  // Trash view
  const [showTrash, setShowTrash] = useState(false);
  const [emptyTrashDialogOpen, setEmptyTrashDialogOpen] = useState(false);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.chat.listConversations.useQuery({
    limit: 50,
    isArchived: false,
    search: search || undefined,
  });

  const { data: trashData, isLoading: trashLoading } = trpc.chat.listTrashedConversations.useQuery(
    undefined,
    { enabled: showTrash }
  );

  const deleteMutation = trpc.chat.deleteConversation.useMutation({
    onSuccess: () => {
      utils.chat.listConversations.invalidate();
      utils.chat.listTrashedConversations.invalidate();
      if (selectedConversationId === conversationToDelete) {
        onNewChat();
      }
    },
  });

  const updateMutation = trpc.chat.updateConversation.useMutation({
    onSuccess: () => {
      utils.chat.listConversations.invalidate();
    },
  });

  const deleteEmptyMutation = trpc.chat.deleteEmptyConversations.useMutation({
    onSuccess: () => {
      utils.chat.listConversations.invalidate();
      utils.chat.listTrashedConversations.invalidate();
      setCleanupDialogOpen(false);
    },
  });

  const deleteMultipleMutation = trpc.chat.deleteMultipleConversations.useMutation({
    onSuccess: () => {
      utils.chat.listConversations.invalidate();
      utils.chat.listTrashedConversations.invalidate();
      setBulkDeleteDialogOpen(false);
      const hadSelected = selectedConversationId && selectedIds.has(selectedConversationId);
      setSelectedIds(new Set());
      setSelectMode(false);
      if (hadSelected) onNewChat();
    },
  });

  const restoreMutation = trpc.chat.restoreConversation.useMutation({
    onSuccess: () => {
      utils.chat.listConversations.invalidate();
      utils.chat.listTrashedConversations.invalidate();
    },
  });

  const permanentDeleteMutation = trpc.chat.permanentlyDeleteConversation.useMutation({
    onSuccess: () => {
      utils.chat.listTrashedConversations.invalidate();
    },
  });

  const emptyTrashMutation = trpc.chat.emptyTrash.useMutation({
    onSuccess: () => {
      utils.chat.listTrashedConversations.invalidate();
      setEmptyTrashDialogOpen(false);
    },
  });

  const handleDelete = (id: number) => {
    setConversationToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (conversationToDelete) {
      deleteMutation.mutate({ id: conversationToDelete });
    }
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
  };

  const handlePin = (id: number, isPinned: boolean) => {
    updateMutation.mutate({ id, isPinned: !isPinned });
  };

  const handleArchive = (id: number) => {
    updateMutation.mutate({ id, isArchived: true });
  };

  const startRename = (id: number, currentTitle: string) => {
    setEditingId(id);
    setEditingTitle(currentTitle);
  };

  const submitRename = () => {
    if (editingId && editingTitle.trim()) {
      updateMutation.mutate({ id: editingId, title: editingTitle.trim() });
    }
    setEditingId(null);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const d = new Date(date);
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString();
  };

  const formatDaysLeft = (trashedAt: Date | string) => {
    const trashed = new Date(trashedAt);
    const deleteDate = new Date(trashed.getTime() + 30 * 24 * 60 * 60 * 1000);
    const daysLeft = Math.ceil((deleteDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysLeft > 0 ? `${daysLeft}d left` : "Expiring";
  };

  const conversations = data?.conversations || [];
  const trashedConversations = trashData?.conversations || [];
  const emptyCount = conversations.filter((c) => c.messageCount === 0).length;

  // Group conversations by date
  const groupedConversations = conversations.reduce((groups, conv) => {
    const dateKey = formatDate(conv.updatedAt);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(conv);
    return groups;
  }, {} as Record<string, typeof conversations>);

  // ==================== TRASH VIEW ====================
  if (showTrash) {
    return (
      <div className="flex h-full flex-col border-r bg-background">
        <div className="flex items-center justify-between border-b p-3">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowTrash(false); exitSelectMode(); }}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-semibold">Trash</h2>
          </div>
          {trashedConversations.length > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setEmptyTrashDialogOpen(true)}
              className="gap-1 h-8 text-xs"
            >
              Empty Trash
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-2">
            {trashLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : trashedConversations.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Trash is empty
              </div>
            ) : (
              <div className="space-y-1">
                <p className="px-2 text-xs text-muted-foreground mb-3">
                  Items are permanently deleted after 30 days.
                </p>
                {trashedConversations.map((conv) => (
                  <div
                    key={conv.id}
                    className="group flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="truncate text-sm font-medium text-muted-foreground block">
                        {conv.title}
                      </span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{conv.messageCount} messages</span>
                        <span>·</span>
                        <span className="text-orange-500">
                          {formatDaysLeft((conv as any).trashedAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-primary hover:text-primary"
                        onClick={() => restoreMutation.mutate({ id: conv.id })}
                        title="Restore"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => permanentDeleteMutation.mutate({ id: conv.id })}
                        title="Delete permanently"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <AlertDialog open={emptyTrashDialogOpen} onOpenChange={setEmptyTrashDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Empty trash?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all {trashedConversations.length} conversation{trashedConversations.length !== 1 ? "s" : ""} in the trash. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => emptyTrashMutation.mutate()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={emptyTrashMutation.isPending}
              >
                {emptyTrashMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Empty Trash
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ==================== NORMAL VIEW ====================
  return (
    <div className="flex h-full flex-col border-r bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-3">
        {selectMode ? (
          <>
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (selectedIds.size === conversations.length) setSelectedIds(new Set());
                  else setSelectedIds(new Set(conversations.map((c) => c.id)));
                }}
                className="text-xs h-8"
              >
                {selectedIds.size === conversations.length ? "None" : "All"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setBulkDeleteDialogOpen(true)}
                disabled={selectedIds.size === 0}
                className="gap-1 h-8"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={exitSelectMode} className="h-8 w-8 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold">Chats</h2>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectMode(true)}
                className="h-8 gap-1 px-2"
                title="Select chats"
              >
                <CheckSquare className="h-4 w-4" />
                <span className="text-xs">Select</span>
              </Button>
              <Button size="sm" onClick={onNewChat} className="gap-2">
                <MessageSquarePlus className="h-4 w-4" />
                New
              </Button>
              {onNewPersonalChat ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onNewPersonalChat}
                  className="gap-2"
                  title="Create a locked personal chat"
                >
                  <Lock className="h-4 w-4" />
                  Personal
                </Button>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search chats..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {search ? "No chats found" : "No conversations yet"}
            </div>
          ) : (
            Object.entries(groupedConversations).map(([dateKey, convs]) => (
              <div key={dateKey} className="mb-4">
                <div className="mb-2 px-2 text-xs font-medium text-muted-foreground">{dateKey}</div>
                <div className="space-y-1">
                  {convs.map((conv) => (
                    <div
                      key={conv.id}
                      className={cn(
                        "group flex items-center gap-2 rounded-lg px-3 py-2 transition-colors cursor-pointer",
                        selectMode && selectedIds.has(conv.id)
                          ? "bg-destructive/10"
                          : selectedConversationId === conv.id
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted"
                      )}
                      onClick={() => {
                        if (selectMode) toggleSelect(conv.id);
                        else onSelectConversation(conv.id);
                      }}
                    >
                      {selectMode && (
                        <Checkbox
                          checked={selectedIds.has(conv.id)}
                          onCheckedChange={() => toggleSelect(conv.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {conv.isPinned && <Pin className="h-3 w-3 text-muted-foreground shrink-0" />}
                          {editingId === conv.id ? (
                            <Input
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") submitRename();
                                if (e.key === "Escape") setEditingId(null);
                              }}
                              onBlur={submitRename}
                              onClick={(e) => e.stopPropagation()}
                              className="h-6 text-sm py-0 px-1"
                              autoFocus
                            />
                          ) : (
                            <span
                              className="truncate text-sm font-medium"
                              onDoubleClick={(e) => {
                                if (selectMode) return;
                                e.stopPropagation();
                                startRename(conv.id, conv.title);
                              }}
                            >
                              {conv.title}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{conv.messageCount} messages</span>
                          {(conv as any).projectId && (
                            <>
                              <span>·</span>
                              <ConversationScopeBadge
                                projectId={(conv as any).projectId}
                                className="h-4 px-1.5"
                              />
                            </>
                          )}
                          {conv.totalCreditsUsed && Number(conv.totalCreditsUsed) > 0 && (
                            <>
                              <span>·</span>
                              <span>{Number(conv.totalCreditsUsed).toFixed(2)} credits</span>
                            </>
                          )}
                        </div>
                      </div>

                      {!selectMode && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => startRename(conv.id, conv.title)}>
                              <Edit2 className="mr-2 h-4 w-4" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handlePin(conv.id, conv.isPinned)}>
                              <Pin className="mr-2 h-4 w-4" />
                              {conv.isPinned ? "Unpin" : "Pin"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleArchive(conv.id)}>
                              <Archive className="mr-2 h-4 w-4" />
                              Archive
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(conv.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Move to Trash
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Team Rooms Section */}
      {onOpenTeamRoom && <TeamRoomsSidebarSection onOpenTeamRoom={onOpenTeamRoom} />}

      {/* Footer */}
      <div className="border-t p-2 space-y-1">
        {!selectMode && emptyCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-2 text-xs text-muted-foreground hover:text-destructive"
            onClick={() => setCleanupDialogOpen(true)}
          >
            <Trash2 className="h-3 w-3" />
            Delete empty chats ({emptyCount})
          </Button>
        )}
        {!selectMode && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-2 text-xs text-muted-foreground"
            onClick={() => setShowTrash(true)}
          >
            <Trash className="h-3 w-3" />
            Trash
          </Button>
        )}
      </div>

      {/* Move to Trash Dialog (single) */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              This conversation will be moved to trash. You can restore it within 30 days.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cleanup Empty Chats Dialog */}
      <AlertDialog open={cleanupDialogOpen} onOpenChange={setCleanupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete empty chats?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move {emptyCount} conversation{emptyCount !== 1 ? "s" : ""} with 0 messages to trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteEmptyMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteEmptyMutation.isPending}
            >
              {deleteEmptyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Move to Trash Dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move {selectedIds.size} chat{selectedIds.size !== 1 ? "s" : ""} to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              Selected conversations will be moved to trash. You can restore them within 30 days.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMultipleMutation.mutate({ ids: Array.from(selectedIds) })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMultipleMutation.isPending}
            >
              {deleteMultipleMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Collapsible sidebar section showing recent team rooms */
function TeamRoomsSidebarSection({ onOpenTeamRoom }: { onOpenTeamRoom: (roomId: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const { data: teamsData } = trpc.team.list.useQuery(undefined, { enabled: expanded });

  return (
    <div className="border-t">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <div className="flex items-center gap-2">
          <UsersRound className="h-4 w-4" />
          Team Rooms
        </div>
        <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <div className="px-2 pb-2">
          {!teamsData || teamsData.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              No teams yet
            </div>
          ) : (
            <div className="space-y-0.5">
              {teamsData.slice(0, 10).map((team: any) => (
                <button
                  key={team.id ?? team.teamId}
                  onClick={() => onOpenTeamRoom(team.id ?? team.teamId)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <UsersRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{team.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
