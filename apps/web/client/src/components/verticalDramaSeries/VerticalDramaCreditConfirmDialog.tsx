import { useCallback, useRef, useState, type ReactNode } from "react";

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
import { Loader2, Sparkles } from "lucide-react";

type VerticalDramaCreditConfirmRequest = {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  testId?: string;
  onConfirm: () => void;
};

export function VerticalDramaCreditConfirmDialog({
  request,
  onCancel,
}: {
  request: VerticalDramaCreditConfirmRequest | null;
  onCancel: () => void;
}) {
  const open = Boolean(request);
  return (
    <AlertDialog open={open} onOpenChange={nextOpen => !nextOpen && onCancel()}>
      <AlertDialogContent data-testid={request?.testId}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {request?.title ?? "ยืนยันการใช้เครดิต"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {request?.description ??
              "การทำงานนี้ใช้ AI และอาจมีการหักเครดิต ต้องการดำเนินการต่อหรือไม่?"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={request?.pending}>
            {request?.cancelLabel ?? "ยกเลิก"}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={request?.pending}
            onClick={() => request?.onConfirm()}
            className="gap-1.5"
            data-testid={request?.testId ? `${request.testId}-confirm` : undefined}
          >
            {request?.pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            {request?.pending
              ? "กำลังดำเนินการ…"
              : request?.confirmLabel ?? "ยืนยัน"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function useVerticalDramaCreditConfirmation() {
  const [request, setRequest] =
    useState<VerticalDramaCreditConfirmRequest | null>(null);
  const consumedRef = useRef(false);

  const requestConfirmation = useCallback(
    (nextRequest: VerticalDramaCreditConfirmRequest) => {
      consumedRef.current = false;
      setRequest({
        ...nextRequest,
        onConfirm: () => {
          if (consumedRef.current) return;
          consumedRef.current = true;
          setRequest(null);
          nextRequest.onConfirm();
        },
      });
    },
    [],
  );

  const cancelConfirmation = useCallback(() => {
    consumedRef.current = true;
    setRequest(null);
  }, []);

  const dialog = (
    <VerticalDramaCreditConfirmDialog
      request={request}
      onCancel={cancelConfirmation}
    />
  );

  return { requestConfirmation, cancelConfirmation, creditConfirmDialog: dialog };
}

export type { VerticalDramaCreditConfirmRequest };
