/**
 * VerticalDramaReferenceFrameDialog — Phase 6c (`planning/vd-start-frame-
 * reference-mapping/plan.md`, Phase 6 "User-controlled supplementary
 * reference frames") client UI.
 *
 * Presentational, two-step dialog: (1) the user picks which characters
 * appear (checkboxes, defaulted to the shot's current
 * `requiredCharacterRefs`) and types a free-text pose/camera/action
 * directive; (2) the app authors an image prompt via
 * `generateShotReferenceFramePrompt` (passed in as `onGeneratePrompt`) and
 * shows it for the user to review/edit and CONFIRM before the paid render
 * (`generateShotReferenceFrameImage`, passed in as `onConfirmRender`) is
 * submitted. All network calls live in the caller (`VerticalDramaEpisodePage
 * .tsx`, same "page owns mutations, dialog is presentational" convention as
 * `VerticalDramaRepairDialog`) — this component only orchestrates the two
 * local UI steps and their loading/disabled states.
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  vdCopy,
  vdCopyWithCount,
  type VdLocale,
} from "./verticalDramaWorkspaceCopy";

export interface VerticalDramaReferenceFrameCharacterOption {
  key: string;
  name: string;
  portraitUrl: string | null;
}

export interface VerticalDramaReferenceFramePromptResult {
  prompt: string;
  negativePrompt: string;
  creditsUsed: number;
  model: string;
  characterKeys: string[];
}

export interface VerticalDramaReferenceFrameDialogProps {
  locale?: VdLocale;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shotNumber: number;
  /** Full selectable roster (series characters with a resolved portrait
   *  status) — characters with no portrait yet are shown disabled, since the
   *  paid render fails closed without one. */
  characterOptions: VerticalDramaReferenceFrameCharacterOption[];
  /** Pre-checked on open — the shot's current `requiredCharacterRefs`. */
  defaultSelectedKeys: string[];
  /** This shot's already-linked `source: "reference_frame"` count. */
  existingCount: number;
  /** Server-enforced cap (Phase 6 user spec: "cap 10 per shot"). */
  cap?: number;
  generatingPrompt?: boolean;
  generatingImage?: boolean;
  onGeneratePrompt: (args: {
    shotNumber: number;
    characterKeys: string[];
    instruction: string;
  }) => Promise<VerticalDramaReferenceFramePromptResult | null>;
  /** Returns `true` on success (closes the dialog); `false` keeps the review
   *  step open so the user can retry (the caller has already surfaced the
   *  error via toast). */
  onConfirmRender: (args: {
    shotNumber: number;
    prompt: string;
    negativePrompt?: string;
    characterKeys: string[];
  }) => Promise<boolean>;
}

type Step = "select" | "review";

export function VerticalDramaReferenceFrameDialog({
  locale = "en",
  open,
  onOpenChange,
  shotNumber,
  characterOptions,
  defaultSelectedKeys,
  existingCount,
  cap = 10,
  generatingPrompt = false,
  generatingImage = false,
  onGeneratePrompt,
  onConfirmRender,
}: VerticalDramaReferenceFrameDialogProps) {
  const t = vdCopy(locale);
  const [step, setStep] = useState<Step>("select");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [instruction, setInstruction] = useState("");
  const [promptResult, setPromptResult] =
    useState<VerticalDramaReferenceFramePromptResult | null>(null);
  const [editedPrompt, setEditedPrompt] = useState("");
  const [editedNegativePrompt, setEditedNegativePrompt] = useState("");

  // Reset on (re)open so a previous shot's/session's draft never leaks in.
  useEffect(() => {
    if (open) {
      setStep("select");
      setSelectedKeys(defaultSelectedKeys);
      setInstruction("");
      setPromptResult(null);
      setEditedPrompt("");
      setEditedNegativePrompt("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shotNumber]);

  const atCap = existingCount >= cap;
  const canGeneratePrompt =
    !atCap &&
    !generatingPrompt &&
    selectedKeys.length > 0 &&
    instruction.trim().length > 0;
  const canConfirmRender =
    !generatingImage && editedPrompt.trim().length > 0;

  function toggleKey(key: string) {
    setSelectedKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  async function handleGeneratePrompt() {
    const result = await onGeneratePrompt({
      shotNumber,
      characterKeys: selectedKeys,
      instruction: instruction.trim(),
    });
    if (!result) return;
    setPromptResult(result);
    setEditedPrompt(result.prompt);
    setEditedNegativePrompt(result.negativePrompt ?? "");
    setStep("review");
  }

  async function handleConfirmRender() {
    if (!promptResult) return;
    const ok = await onConfirmRender({
      shotNumber,
      prompt: editedPrompt.trim(),
      negativePrompt: editedNegativePrompt.trim() || undefined,
      characterKeys: promptResult.characterKeys,
    });
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby="vd-reference-frame-desc"
        data-testid={`vd-reference-frame-dialog-${shotNumber}`}
      >
        <DialogHeader>
          <DialogTitle>{t.referenceFrameDialogTitle}</DialogTitle>
          <DialogDescription id="vd-reference-frame-desc">
            {t.referenceFrameDialogHint}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {vdCopyWithCount(t.referenceFrameCountLabel, existingCount)}
          </span>
          {atCap ? (
            <span className="text-destructive">
              {t.referenceFrameCapReached}
            </span>
          ) : null}
        </div>

        {step === "select" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">
                {t.referenceFrameCharactersLabel}
              </p>
              <div
                className="flex max-h-52 flex-col gap-0.5 overflow-y-auto"
                data-testid={`vd-reference-frame-characters-${shotNumber}`}
              >
                {characterOptions.map(opt => {
                  const disabled = !opt.portraitUrl;
                  const checked = selectedKeys.includes(opt.key);
                  return (
                    <label
                      key={opt.key}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-1.5 py-1 text-sm",
                        disabled
                          ? "cursor-not-allowed opacity-50"
                          : "cursor-pointer hover:bg-muted"
                      )}
                      data-testid={`vd-reference-frame-character-${shotNumber}-${opt.key}`}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={() => toggleKey(opt.key)}
                      />
                      {opt.portraitUrl ? (
                        <img
                          src={opt.portraitUrl}
                          alt=""
                          className="h-5 w-5 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] text-muted-foreground">
                          ?
                        </span>
                      )}
                      <span className="flex-1 truncate">{opt.name}</span>
                      {disabled ? (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {t.referenceFrameNoPortraitHint}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                className="block text-sm font-medium"
                htmlFor={`vd-reference-frame-instruction-${shotNumber}`}
              >
                {t.referenceFrameInstructionLabel}
              </label>
              <Textarea
                id={`vd-reference-frame-instruction-${shotNumber}`}
                value={instruction}
                onChange={e => setInstruction(e.target.value)}
                placeholder={t.referenceFrameInstructionPlaceholder}
                rows={3}
                disabled={generatingPrompt}
                data-testid={`vd-reference-frame-instruction-${shotNumber}`}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label
                className="block text-sm font-medium"
                htmlFor={`vd-reference-frame-prompt-${shotNumber}`}
              >
                {t.referenceFramePromptLabel}
              </label>
              <Textarea
                id={`vd-reference-frame-prompt-${shotNumber}`}
                value={editedPrompt}
                onChange={e => setEditedPrompt(e.target.value)}
                rows={8}
                disabled={generatingImage}
                data-testid={`vd-reference-frame-prompt-${shotNumber}`}
              />
            </div>
            <div className="space-y-1.5">
              <label
                className="block text-sm font-medium"
                htmlFor={`vd-reference-frame-negative-prompt-${shotNumber}`}
              >
                {t.referenceFrameNegativePromptLabel}
              </label>
              <Textarea
                id={`vd-reference-frame-negative-prompt-${shotNumber}`}
                value={editedNegativePrompt}
                onChange={e => setEditedNegativePrompt(e.target.value)}
                rows={2}
                disabled={generatingImage}
                data-testid={`vd-reference-frame-negative-prompt-${shotNumber}`}
              />
            </div>
            {promptResult ? (
              <p className="text-[11px] text-muted-foreground">
                {vdCopyWithCount(
                  t.referenceFrameCreditsNote,
                  promptResult.creditsUsed
                )}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={generatingPrompt || generatingImage}
            data-testid={`vd-reference-frame-cancel-${shotNumber}`}
          >
            {t.cancel}
          </Button>
          {step === "review" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("select")}
              disabled={generatingImage}
              data-testid={`vd-reference-frame-back-${shotNumber}`}
            >
              {t.referenceFrameBackToSelection}
            </Button>
          ) : null}
          {step === "select" ? (
            <Button
              type="button"
              onClick={() => void handleGeneratePrompt()}
              disabled={!canGeneratePrompt}
              aria-busy={generatingPrompt}
              data-testid={`vd-reference-frame-generate-prompt-${shotNumber}`}
            >
              {generatingPrompt ? (
                <>
                  <Loader2
                    aria-hidden="true"
                    className="mr-1.5 h-3.5 w-3.5 animate-spin"
                  />
                  {t.referenceFrameGeneratingPrompt}
                </>
              ) : (
                t.referenceFrameGeneratePromptButton
              )}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void handleConfirmRender()}
              disabled={!canConfirmRender}
              aria-busy={generatingImage}
              data-testid={`vd-reference-frame-confirm-render-${shotNumber}`}
            >
              {generatingImage ? (
                <>
                  <Loader2
                    aria-hidden="true"
                    className="mr-1.5 h-3.5 w-3.5 animate-spin"
                  />
                  {t.referenceFrameGeneratingImage}
                </>
              ) : (
                t.referenceFrameConfirmRenderButton
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default VerticalDramaReferenceFrameDialog;
