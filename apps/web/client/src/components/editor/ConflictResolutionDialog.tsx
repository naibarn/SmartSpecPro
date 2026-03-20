import { useI18n } from "@/lib/i18n";
import { AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface ConflictResolutionDialogProps {
  open: boolean;
  documentTitle?: string;
  onOverwrite: () => void;
  onReload: () => void;
}

export function ConflictResolutionDialog({
  open,
  documentTitle,
  onOverwrite,
  onReload,
}: ConflictResolutionDialogProps) {
  const { t } = useI18n();

  return (
    <AlertDialog open={open}>
      <AlertDialogContent
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {t("editor.conflict.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("editor.conflict.description")}
            {documentTitle && (
              <span className="block mt-1 font-medium">{documentTitle}</span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onReload}>
            {t("editor.conflict.reload")}
          </Button>
          <Button variant="destructive" onClick={onOverwrite}>
            {t("editor.conflict.overwrite")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
