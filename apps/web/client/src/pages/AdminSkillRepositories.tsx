import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GitBranch,
  Plus,
  Download,
  RefreshCw,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  Package,
  ExternalLink,
  ArrowLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DashboardCard } from "@/components/dashboard";

export default function AdminSkillRepositories() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState<number | null>(null);
  const [removeSkills, setRemoveSkills] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formGitUrl, setFormGitUrl] = useState("");
  const [formBranch, setFormBranch] = useState("main");
  const [formFormat, setFormFormat] = useState("auto");
  const [formSubdir, setFormSubdir] = useState("skills");

  // Queries
  const reposQuery = trpc.skillRepositories.list.useQuery();
  const utils = trpc.useUtils();

  // Mutations
  const addMutation = trpc.skillRepositories.add.useMutation({
    onSuccess: () => {
      toast({ title: "Repository added", description: "Click Fetch to import skills" });
      setShowAddDialog(false);
      resetForm();
      utils.skillRepositories.list.invalidate();
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const fetchMutation = trpc.skillRepositories.fetch.useMutation({
    onSuccess: (result) => {
      toast({
        title: "Fetch complete",
        description: `Imported: ${result.imported}, Updated: ${result.updated}, Skipped: ${result.skipped}${result.errors.length > 0 ? `, Errors: ${result.errors.length}` : ""}`,
      });
      utils.skillRepositories.list.invalidate();
    },
    onError: (err) => toast({ title: "Fetch failed", description: err.message, variant: "destructive" }),
  });

  const removeMutation = trpc.skillRepositories.remove.useMutation({
    onSuccess: () => {
      toast({ title: "Repository removed" });
      setShowRemoveDialog(null);
      utils.skillRepositories.list.invalidate();
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (!user || user.role !== "admin") {
    setLocation("/");
    return null;
  }

  function resetForm() {
    setFormName("");
    setFormGitUrl("");
    setFormBranch("main");
    setFormFormat("auto");
    setFormSubdir("skills");
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "ready":
        return <Badge className="bg-green-100 text-green-700"><CheckCircle className="h-3 w-3 mr-1" />Ready</Badge>;
      case "fetching":
        return <Badge className="bg-blue-100 text-blue-700"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Fetching...</Badge>;
      case "error":
        return <Badge className="bg-red-100 text-red-700"><AlertCircle className="h-3 w-3 mr-1" />Error</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-700"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/skills")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Skills
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GitBranch className="h-6 w-6" />
              Skill Repositories
            </h1>
            <p className="text-muted-foreground text-sm">
              Manage external Git repositories containing skill collections
            </p>
          </div>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Repository
        </Button>
      </div>

      {/* Repository List */}
      {reposQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : reposQuery.data?.length === 0 ? (
        <DashboardCard>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mb-3 opacity-30" />
            <p className="font-medium">No repositories added yet</p>
            <p className="text-sm mt-1">Add a Git repository to import skills</p>
            <Button className="mt-4" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Repository
            </Button>
          </div>
        </DashboardCard>
      ) : (
        <div className="space-y-4">
          {reposQuery.data?.map((repo) => (
            <DashboardCard key={repo.id}>
              <div className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg flex items-center gap-2">
                      {repo.name}
                      {getStatusBadge(repo.status)}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" />
                      {repo.gitUrl}
                      {repo.branch !== "main" && <span className="ml-2">({repo.branch})</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => fetchMutation.mutate({ id: repo.id })}
                      disabled={fetchMutation.isPending}
                    >
                      {fetchMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : repo.lastFetchedAt ? (
                        <RefreshCw className="h-4 w-4 mr-1" />
                      ) : (
                        <Download className="h-4 w-4 mr-1" />
                      )}
                      {repo.lastFetchedAt ? "Upgrade" : "Fetch"}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setShowRemoveDialog(repo.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Package className="h-4 w-4" />
                    {repo.skillCount || 0} skills
                  </span>
                  <span>Format: {repo.formatType || "auto"}</span>
                  <span>Subdir: {repo.skillsSubdir || "skills"}</span>
                  {repo.lastFetchedAt && (
                    <span>Last fetch: {new Date(repo.lastFetchedAt).toLocaleDateString()}</span>
                  )}
                  {repo.lastCommitHash && (
                    <span className="font-mono text-xs">{repo.lastCommitHash.substring(0, 8)}</span>
                  )}
                </div>
                {repo.errorMessage && (
                  <div className="mt-3 p-3 bg-red-50 rounded-lg text-sm text-red-700 max-h-32 overflow-auto">
                    {repo.errorMessage}
                  </div>
                )}
              </div>
            </DashboardCard>
          ))}
        </div>
      )}

      {/* Add Repository Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Skill Repository</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Display Name</Label>
              <Input
                placeholder="e.g. Antigravity Awesome Skills"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div>
              <Label>Git URL or GitHub Shorthand</Label>
              <Input
                placeholder="e.g. sickn33/antigravity-awesome-skills"
                value={formGitUrl}
                onChange={(e) => setFormGitUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Accepts: user/repo, https://github.com/user/repo.git
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Branch</Label>
                <Input
                  value={formBranch}
                  onChange={(e) => setFormBranch(e.target.value)}
                />
              </div>
              <div>
                <Label>Format</Label>
                <Select value={formFormat} onValueChange={setFormFormat}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto Detect</SelectItem>
                    <SelectItem value="antigravity">Antigravity</SelectItem>
                    <SelectItem value="claude">Shared Skill Bundle</SelectItem>
                    <SelectItem value="custom-gpt">Custom GPT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Skills Subdirectory</Label>
              <Input
                value={formSubdir}
                onChange={(e) => setFormSubdir(e.target.value)}
                placeholder="skills"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Folder within the repo that contains skill folders
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={() => addMutation.mutate({
                name: formName,
                gitUrl: formGitUrl,
                branch: formBranch,
                formatType: formFormat as any,
                skillsSubdir: formSubdir,
              })}
              disabled={!formName || !formGitUrl || addMutation.isPending}
            >
              {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Repository
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <Dialog open={showRemoveDialog !== null} onOpenChange={() => setShowRemoveDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Repository</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to remove this repository?
            </p>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="removeSkills"
                checked={removeSkills}
                onChange={(e) => setRemoveSkills(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="removeSkills" className="text-sm">
                Also delete all skills imported from this repository
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemoveDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (showRemoveDialog !== null) {
                  removeMutation.mutate({ id: showRemoveDialog, removeSkills });
                }
              }}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
