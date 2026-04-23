import { useEffect, useState } from "react";
import { Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";

type PublishContextPackDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savedView: { id: number; title: string } | null;
  onPublished?: () => void;
};

export function PublishContextPackDialog(props: PublishContextPackDialogProps) {
  const trpcUtils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [snapshot, setSnapshot] = useState(true);
  const [defaultRuntimeTier, setDefaultRuntimeTier] = useState<
    "retrieved_evidence" | "durable_memory"
  >("retrieved_evidence");

  useEffect(() => {
    if (!props.open || !props.savedView) {
      return;
    }
    setTitle(`${props.savedView.title} Memory Pack`);
    setSnapshot(true);
    setDefaultRuntimeTier("retrieved_evidence");
  }, [props.open, props.savedView]);

  const publishMutation = trpc.library.publishSavedViewAsContextPack.useMutation({
    onSuccess: async () => {
      await Promise.all([
        trpcUtils.library.listContextPacks.invalidate(),
        trpcUtils.library.listSavedViews.invalidate(),
      ]);
      toast.success("Context pack published from saved view.");
      props.onOpenChange(false);
      props.onPublished?.();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg border-slate-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <PackagePlus className="h-5 w-5 text-sky-600" />
            Publish Context Pack
          </DialogTitle>
          <DialogDescription>
            Freeze or track this saved view as an approval-ready memory pack for
            agent and skill runtime.
          </DialogDescription>
        </DialogHeader>

        {props.savedView ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Source view: <span className="font-medium text-slate-900">{props.savedView.title}</span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="publish-context-pack-title">Pack title</Label>
              <Input
                id="publish-context-pack-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Operations escalation pack"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
              <div className="space-y-1">
                <Label htmlFor="publish-context-pack-snapshot">Snapshot mode</Label>
                <p className="text-sm text-slate-500">
                  Snapshot freezes membership now while still re-checking ACL at
                  resolve time.
                </p>
              </div>
              <Switch
                id="publish-context-pack-snapshot"
                checked={snapshot}
                onCheckedChange={setSnapshot}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="publish-context-pack-runtime-tier">
                Default runtime tier
              </Label>
              <Select
                value={defaultRuntimeTier}
                onValueChange={(value) =>
                  setDefaultRuntimeTier(
                    value as "retrieved_evidence" | "durable_memory",
                  )
                }
              >
                <SelectTrigger id="publish-context-pack-runtime-tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="retrieved_evidence">
                    Retrieved evidence
                  </SelectItem>
                  <SelectItem value="durable_memory">
                    Durable memory
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              !props.savedView
              || !title.trim()
              || publishMutation.isPending
            }
            onClick={() => {
              if (!props.savedView || !title.trim()) {
                return;
              }
              publishMutation.mutate({
                savedViewId: props.savedView.id,
                title: title.trim(),
                snapshot,
                defaultRuntimeTier,
              });
            }}
          >
            {publishMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PublishContextPackDialog;
