import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Brain,
  Plus,
  Trash2,
  User,
  FolderGit2,
  Settings2,
  Code2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const entityTypeConfig = {
  user: { icon: User, label: "User", color: "bg-blue-500" },
  project: { icon: FolderGit2, label: "Project", color: "bg-green-500" },
  preference: { icon: Settings2, label: "Preference", color: "bg-purple-500" },
  technical: { icon: Code2, label: "Technical", color: "bg-orange-500" },
};

type EntityType = keyof typeof entityTypeConfig;

interface MemoryPanelProps {
  onClose?: () => void;
}

export function MemoryPanel({ onClose }: MemoryPanelProps) {
  const [selectedType, setSelectedType] = useState<EntityType | "all">("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [memoryToDelete, setMemoryToDelete] = useState<number | null>(null);

  // Form state for adding new memory
  const [newMemory, setNewMemory] = useState({
    entityType: "preference" as EntityType,
    entityName: "",
    fact: "",
  });

  const utils = trpc.useUtils();

  // Fetch memories
  const { data: memories, isLoading } = trpc.memory.getEntityMemories.useQuery({
    entityType: selectedType === "all" ? undefined : selectedType,
    limit: 50,
  });

  // Mutations
  const addMemoryMutation = trpc.memory.upsertEntityMemory.useMutation({
    onSuccess: () => {
      utils.memory.getEntityMemories.invalidate();
      setAddDialogOpen(false);
      setNewMemory({ entityType: "preference", entityName: "", fact: "" });
    },
  });

  const deleteMemoryMutation = trpc.memory.deleteEntityMemory.useMutation({
    onSuccess: () => {
      utils.memory.getEntityMemories.invalidate();
      setDeleteDialogOpen(false);
      setMemoryToDelete(null);
    },
  });

  const handleAddMemory = () => {
    if (!newMemory.entityName.trim() || !newMemory.fact.trim()) return;

    addMemoryMutation.mutate({
      entityType: newMemory.entityType,
      entityName: newMemory.entityName.trim(),
      facts: [newMemory.fact.trim()],
    });
  };

  const handleDeleteMemory = (id: number) => {
    setMemoryToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (memoryToDelete) {
      deleteMemoryMutation.mutate({ id: memoryToDelete });
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Memory</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => utils.memory.getEntityMemories.invalidate()}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Memory</DialogTitle>
                  <DialogDescription>
                    Add a fact that the AI should remember about you or your projects.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Type</label>
                    <Select
                      value={newMemory.entityType}
                      onValueChange={(v) =>
                        setNewMemory({ ...newMemory, entityType: v as EntityType })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(entityTypeConfig).map(([type, config]) => (
                          <SelectItem key={type} value={type}>
                            <div className="flex items-center gap-2">
                              <config.icon className="h-4 w-4" />
                              {config.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Name</label>
                    <Input
                      placeholder="e.g., 'coding style', 'SmartSpec project'"
                      value={newMemory.entityName}
                      onChange={(e) =>
                        setNewMemory({ ...newMemory, entityName: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Fact</label>
                    <Input
                      placeholder="e.g., 'I prefer TypeScript over JavaScript'"
                      value={newMemory.fact}
                      onChange={(e) =>
                        setNewMemory({ ...newMemory, fact: e.target.value })
                      }
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setAddDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddMemory}
                    disabled={
                      addMemoryMutation.isPending ||
                      !newMemory.entityName.trim() ||
                      !newMemory.fact.trim()
                    }
                  >
                    {addMemoryMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Add Memory
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <CardDescription>
          Facts the AI remembers about you and your projects
        </CardDescription>
      </CardHeader>

      <div className="px-4 pb-3">
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={selectedType === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSelectedType("all")}
          >
            All
          </Button>
          {Object.entries(entityTypeConfig).map(([type, config]) => {
            const Icon = config.icon;
            return (
              <Button
                key={type}
                variant={selectedType === type ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setSelectedType(type as EntityType)}
                className="gap-1"
              >
                <Icon className="h-3 w-3" />
                {config.label}
              </Button>
            );
          })}
        </div>
      </div>

      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-4 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !memories || memories.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No memories yet. The AI will learn about you as you chat.
            </div>
          ) : (
            <div className="space-y-3">
              {memories.map((memory) => {
                const config = entityTypeConfig[memory.entityType as EntityType];
                const Icon = config?.icon || Brain;
                return (
                  <div
                    key={memory.id}
                    className="group rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "rounded-full p-1",
                            config?.color || "bg-gray-500"
                          )}
                        >
                          <Icon className="h-3 w-3 text-white" />
                        </div>
                        <span className="font-medium text-sm">
                          {memory.entityName}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteMemory(memory.id)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                    <div className="mt-2 space-y-1">
                      {memory.facts.slice(0, 3).map((fact, i) => (
                        <p key={i} className="text-sm text-muted-foreground">
                          • {fact}
                        </p>
                      ))}
                      {memory.facts.length > 3 && (
                        <p className="text-xs text-muted-foreground">
                          +{memory.facts.length - 3} more facts
                        </p>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs">
                        {config?.label || memory.entityType}
                      </Badge>
                      <span>•</span>
                      <span>
                        Reinforced {memory.reinforcementCount}x
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete memory?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this memory permanently. The AI will no longer
              remember this fact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMemoryMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
