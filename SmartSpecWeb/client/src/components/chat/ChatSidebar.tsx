import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatSidebarProps {
  selectedConversationId: number | null;
  onSelectConversation: (id: number) => void;
  onNewChat: () => void;
}

export function ChatSidebar({
  selectedConversationId,
  onSelectConversation,
  onNewChat,
}: ChatSidebarProps) {
  const [search, setSearch] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.chat.listConversations.useQuery({
    limit: 50,
    isArchived: false,
    search: search || undefined,
  });

  const deleteMutation = trpc.chat.deleteConversation.useMutation({
    onSuccess: () => {
      utils.chat.listConversations.invalidate();
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

  const formatDate = (date: Date) => {
    const now = new Date();
    const d = new Date(date);
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString();
  };

  const conversations = data?.conversations || [];

  // Group conversations by date
  const groupedConversations = conversations.reduce((groups, conv) => {
    const dateKey = formatDate(conv.updatedAt);
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(conv);
    return groups;
  }, {} as Record<string, typeof conversations>);

  return (
    <div className="flex h-full flex-col border-r bg-muted/30">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-3">
        <h2 className="text-lg font-semibold">Chats</h2>
        <Button size="sm" onClick={onNewChat} className="gap-2">
          <MessageSquarePlus className="h-4 w-4" />
          New
        </Button>
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
      <ScrollArea className="flex-1">
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
                <div className="mb-2 px-2 text-xs font-medium text-muted-foreground">
                  {dateKey}
                </div>
                <div className="space-y-1">
                  {convs.map((conv) => (
                    <div
                      key={conv.id}
                      className={cn(
                        "group flex items-center gap-2 rounded-lg px-3 py-2 transition-colors cursor-pointer",
                        selectedConversationId === conv.id
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted"
                      )}
                      onClick={() => onSelectConversation(conv.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {conv.isPinned && (
                            <Pin className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span className="truncate text-sm font-medium">
                            {conv.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{conv.messageCount} messages</span>
                          {(conv as any).projectId && (
                            <>
                              <span>·</span>
                              <span className="text-primary">{(conv as any).projectId}</span>
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
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All messages in this conversation will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
