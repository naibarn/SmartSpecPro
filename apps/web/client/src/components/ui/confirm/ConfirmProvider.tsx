/**
 * ConfirmProvider — themed replacement for native window.confirm/window.prompt.
 *
 * Mount once near the app root (see App.tsx). Anywhere below the provider,
 * call `useConfirm()` to get `confirm()` / `prompt()` functions that resolve
 * to the same values the native APIs would have returned:
 *   - confirm(...) -> Promise<boolean>            (true = OK, false = Cancel/Escape)
 *   - prompt(...)  -> Promise<string | null>       (string = OK, null = Cancel/Escape)
 *
 * Both are backed by a single shadcn/Radix AlertDialog instance so every
 * confirmation/prompt in the app shares the same look, follows the active
 * Astryx theme + light/dark mode, and is keyboard/screen-reader accessible.
 *
 * Requests are queued: if `confirm()`/`prompt()` is called again before the
 * current dialog is dismissed, the new request waits its turn instead of
 * clobbering the one on screen.
 */
import * as React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** "danger" renders the confirm button with destructive styling. */
  tone?: "default" | "danger";
}

export interface PromptOptions {
  title: string;
  description?: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
}

interface ConfirmRequest {
  kind: "confirm";
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

interface PromptRequest {
  kind: "prompt";
  options: PromptOptions;
  resolve: (value: string | null) => void;
}

type Request = ConfirmRequest | PromptRequest;

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Request[]>([]);
  const [promptValue, setPromptValue] = useState("");
  // Tracks whether the dialog is closing because the user clicked the
  // confirm/OK action (true) or cancelled/escaped/closed it (false).
  // AlertDialogAction/AlertDialogCancel both trigger onOpenChange(false)
  // internally after their own onClick handler runs, so this ref is always
  // set (or explicitly cleared) before onOpenChange sees the close.
  const pendingConfirmedRef = useRef(false);

  const current = queue[0] ?? null;

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setQueue((prev) => [...prev, { kind: "confirm", options, resolve }]);
    });
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setQueue((prev) => [...prev, { kind: "prompt", options, resolve }]);
    });
  }, []);

  const advanceQueue = useCallback((confirmed: boolean, value: string) => {
    setQueue((prev) => {
      const [head, ...rest] = prev;
      if (head) {
        if (head.kind === "confirm") {
          head.resolve(confirmed);
        } else {
          head.resolve(confirmed ? value : null);
        }
      }
      return rest;
    });
  }, []);

  const handleActionClick = useCallback(() => {
    pendingConfirmedRef.current = true;
  }, []);

  const handleCancelClick = useCallback(() => {
    pendingConfirmedRef.current = false;
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) return;
      const confirmed = pendingConfirmedRef.current;
      pendingConfirmedRef.current = false;
      advanceQueue(confirmed, promptValue);
    },
    [advanceQueue, promptValue],
  );

  // Seed the prompt input with the request's default value whenever a new
  // request becomes current. This is React's documented "adjust state while
  // rendering" pattern (https://react.dev/reference/react/useState#storing-information-from-previous-renders):
  // calling setState directly during render is safe as long as it's guarded
  // by a comparison, since React re-renders immediately before committing.
  const [prevRequest, setPrevRequest] = useState<Request | null>(null);
  if (prevRequest !== current) {
    setPrevRequest(current);
    if (current?.kind === "prompt") {
      setPromptValue(current.options.defaultValue ?? "");
    }
  }

  const value = useMemo<ConfirmContextValue>(
    () => ({ confirm, prompt }),
    [confirm, prompt],
  );

  const isPrompt = current?.kind === "prompt";
  const tone = current?.kind === "confirm" ? current.options.tone : undefined;

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <AlertDialog open={current !== null} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{current?.options.title}</AlertDialogTitle>
            {current?.options.description ? (
              <AlertDialogDescription>
                {current.options.description}
              </AlertDialogDescription>
            ) : (
              // AlertDialog requires a description for a11y; keep it visually
              // empty but present when the caller didn't supply one.
              <AlertDialogDescription className="sr-only">
                {current?.options.title}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>

          {isPrompt && current?.kind === "prompt" && (
            <div className="grid gap-2">
              {current.options.label && (
                <Label htmlFor="confirm-provider-prompt-input">
                  {current.options.label}
                </Label>
              )}
              <Input
                id="confirm-provider-prompt-input"
                autoFocus
                value={promptValue}
                placeholder={current.options.placeholder}
                onChange={(event) => setPromptValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    pendingConfirmedRef.current = true;
                    advanceQueue(true, promptValue);
                  }
                }}
              />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelClick}>
              {current?.options.cancelText ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleActionClick}
              className={cn(
                tone === "danger" && buttonVariants({ variant: "destructive" }),
              )}
            >
              {current?.options.confirmText ?? "OK"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm() must be used within <ConfirmProvider>");
  }
  return ctx;
}
