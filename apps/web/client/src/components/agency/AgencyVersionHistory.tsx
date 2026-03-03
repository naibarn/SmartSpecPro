import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Loader2, RotateCcw, Clock } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface AgencyVersionHistoryProps {
  agencyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgencyVersionHistory({ agencyId, open, onOpenChange }: AgencyVersionHistoryProps) {
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const { data, isLoading, refetch } = (trpc as any).agency.listVersions.useQuery(
    { agencyId, limit: 30 },
    { enabled: open },
  );

  const restoreMutation = (trpc as any).agency.restoreVersion.useMutation({
    onSuccess: () => {
      toast.success("Version restored — refresh the page to see changes");
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Failed to restore version");
      setRestoringId(null);
    },
  });

  const handleRestore = async (versionId: number) => {
    setRestoringId(versionId);
    await restoreMutation.mutateAsync({ versionId });
  };

  const versions: Array<{
    id: number;
    versionNumber: number;
    contentHash: string;
    changeDescription?: string;
    createdAt: string;
  }> = data?.versions ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Version History
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No saved versions yet.
              <br />
              Save the agency to create a version.
            </div>
          ) : (
            <div className="divide-y">
              {versions.map((v, idx) => (
                <div key={v.id} className="px-4 py-3 hover:bg-muted/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">
                        v{v.versionNumber}
                        {idx === 0 && (
                          <span className="ml-1.5 text-[10px] uppercase tracking-wider text-green-600 font-bold">
                            latest
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}
                      </p>
                      {v.changeDescription && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{v.changeDescription}</p>
                      )}
                      <p className="text-[10px] text-slate-300 mt-0.5 font-mono">{v.contentHash.slice(0, 8)}…</p>
                    </div>

                    {idx !== 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        title="Restore this version"
                        disabled={restoringId === v.id}
                        onClick={() => handleRestore(v.id)}
                      >
                        {restoringId === v.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
