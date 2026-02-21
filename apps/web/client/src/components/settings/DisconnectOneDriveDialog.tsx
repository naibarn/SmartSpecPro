/**
 * Confirmation dialog shown before disconnecting OneDrive.
 * Warns user that indexed content will be removed but OneDrive files are unaffected.
 */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDisconnected: () => void;
}

export function DisconnectOneDriveDialog({
  open,
  onOpenChange,
  onDisconnected,
}: Props) {
  const disconnectMutation = trpc.oneDrive.disconnect.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onDisconnected();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disconnect OneDrive</DialogTitle>
          <DialogDescription>
            This will remove your OneDrive connection and delete all indexed
            files from the library. Your files on OneDrive will not be
            affected.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => disconnectMutation.mutate()}
            disabled={disconnectMutation.isPending}
          >
            {disconnectMutation.isPending && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            Disconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
