import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AuthenticatedMediaImage } from "@/components/media/AuthenticatedMediaImage";
import { trpc } from "@/lib/trpc";
import {
  buildSeriesLogoPrompt,
  type VerticalDramaLogoSlotId,
} from "@shared/verticalDramaSeries/logoGeneration";

type LogoTask = {
  id?: string;
  taskId?: string;
  status?: string;
  resultUrl?: string;
  errorMessage?: string;
};

type LogoGenerationModel = {
  modelId: string;
  name: string;
  provider: string;
  description?: string | null;
  creditCost: number;
};

const POLL_INTERVAL_MS = 2500;
const MAX_POLL_ATTEMPTS = 120;

function taskIdOf(task: LogoTask | null | undefined): string {
  // The media API exposes `id` (our durable task ID) and `taskId` (the
  // provider's external ID). The status endpoint accepts only the durable
  // ID; after the first poll the response includes both, so always prefer
  // `id` or apply will send the provider ID and receive "Task not found".
  return String(task?.id ?? task?.taskId ?? "").trim();
}

function isTransientPollError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? "");
  return /429|rate.?limit|timeout|temporarily unavailable|not found|5\d\d/i.test(
    text
  );
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface VerticalDramaLogoGenerationDialogProps {
  lang: "th" | "en";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seriesId: string;
  seriesTitle: string;
  slotId: VerticalDramaLogoSlotId;
  onApplied: (imageUrl: string) => void;
}

export function VerticalDramaLogoGenerationDialog({
  lang,
  open,
  onOpenChange,
  seriesId,
  seriesTitle,
  slotId,
  onApplied,
}: VerticalDramaLogoGenerationDialogProps) {
  const utils = trpc.useUtils();
  const modelsQuery =
    trpc.verticalDramaSeries.listLogoGenerationModels.useQuery(
      { seriesId },
      { enabled: open }
    );
  const generateMutation =
    trpc.verticalDramaSeries.generateSeriesLogo.useMutation();
  const applyMutation =
    trpc.verticalDramaSeries.applyGeneratedSeriesLogo.useMutation();

  const [channelName, setChannelName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [promptTouched, setPromptTouched] = useState(false);
  const [modelId, setModelId] = useState("");
  const [task, setTask] = useState<LogoTask | null>(null);
  const [phase, setPhase] = useState<
    "editing" | "polling" | "preview" | "error"
  >("editing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
  const generationInFlight = useRef(false);
  const applyInFlight = useRef(false);

  const isChannel = slotId === "secondary";
  const models = (modelsQuery.data?.models ?? []) as LogoGenerationModel[];
  const selectedModel =
    models.find(model => model.modelId === modelId) ?? models[0];
  const isBusy =
    phase === "polling" ||
    generateMutation.isPending ||
    applyMutation.isPending;
  const canGenerate = Boolean(
    selectedModel &&
    prompt.trim() &&
    (!isChannel || channelName.trim()) &&
    !isBusy &&
    !generationInFlight.current
  );

  useEffect(() => {
    if (!open) return;
    const initialPrompt = !isChannel
      ? buildSeriesLogoPrompt({ slotId, seriesTitle })
      : "";
    setChannelName("");
    setPrompt(initialPrompt);
    setPromptTouched(false);
    setModelId("");
    setTask(null);
    setPhase("editing");
    setErrorMessage(null);
    setApplyConfirmOpen(false);
    generationInFlight.current = false;
    applyInFlight.current = false;
  }, [open, isChannel, seriesTitle, slotId]);

  useEffect(() => {
    if (!modelId && models[0]?.modelId) setModelId(models[0].modelId);
  }, [modelId, models]);

  const handleChannelNameChange = (value: string) => {
    setChannelName(value);
    if (!promptTouched) {
      setPrompt(
        value.trim()
          ? buildSeriesLogoPrompt({ slotId, channelName: value })
          : ""
      );
    }
  };

  const pollTask = async (initialTask: LogoTask) => {
    const taskId = taskIdOf(initialTask);
    if (!taskId) throw new Error("ไม่พบรหัสงานสร้างโลโก้");

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      try {
        const current = await utils.media.getTask.fetch({ taskId });
        const nextTask = current as LogoTask;
        setTask(nextTask);
        if (nextTask.status === "completed") {
          if (!nextTask.resultUrl)
            throw new Error("สร้างภาพสำเร็จแต่ไม่พบไฟล์ภาพ");
          if (!nextTask.resultUrl.trim().startsWith("/api/storage/files/")) {
            await wait(POLL_INTERVAL_MS);
            continue;
          }
          setPhase("preview");
          return;
        }
        if (["failed", "cancelled"].includes(String(nextTask.status))) {
          throw new Error(nextTask.errorMessage || "การสร้างโลโก้ไม่สำเร็จ");
        }
      } catch (error) {
        if (!isTransientPollError(error)) throw error;
      }
      await wait(POLL_INTERVAL_MS);
    }
    throw new Error("การสร้างโลโก้ใช้เวลานานเกินไป กรุณาลองตรวจสอบอีกครั้ง");
  };

  const handleGenerate = async () => {
    if (!canGenerate || !selectedModel) return;
    generationInFlight.current = true;
    setErrorMessage(null);
    setPhase("polling");
    try {
      const created = await generateMutation.mutateAsync({
        seriesId,
        slotId,
        prompt: prompt.trim(),
        modelId: selectedModel.modelId,
        idempotencyKey: crypto.randomUUID(),
      });
      const initialTask = created as LogoTask;
      setTask(initialTask);
      await pollTask(initialTask);
    } catch (error) {
      setPhase("error");
      setErrorMessage(
        error instanceof Error ? error.message : "การสร้างโลโก้ไม่สำเร็จ"
      );
    } finally {
      generationInFlight.current = false;
    }
  };

  const handleApply = async () => {
    if (applyInFlight.current) return;
    const taskId = taskIdOf(task);
    if (!taskId || !task?.resultUrl) return;
    applyInFlight.current = true;
    setErrorMessage(null);
    try {
      const result = await applyMutation.mutateAsync({
        seriesId,
        slotId,
        taskId,
        idempotencyKey: crypto.randomUUID(),
      });
      onApplied(result.imageUrl);
      setApplyConfirmOpen(false);
      onOpenChange(false);
      void Promise.resolve(
        utils.verticalDramaSeries.get.invalidate({ seriesId })
      ).catch(() => undefined);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "บันทึกโลโก้ไม่สำเร็จ"
      );
    } finally {
      applyInFlight.current = false;
    }
  };

  const close = (nextOpen: boolean) => {
    if (!nextOpen && isBusy) return;
    onOpenChange(nextOpen);
  };

  const copy =
    lang === "th"
      ? {
          title: isChannel
            ? "สร้างโลโก้ช่องด้วย AI"
            : "สร้างโลโก้ชื่อเรื่องด้วย AI",
          description:
            "เลือกโมเดล ตรวจสอบคำสั่ง และยืนยันก่อนสร้างภาพ PNG พื้นหลังโปร่งใส",
          model: "โมเดลสร้างภาพ",
          channel: "ชื่อช่อง Facebook",
          prompt: "Prompt ที่ใช้สร้างภาพ (แก้ไขได้)",
          generate: "ยืนยันการสร้างภาพ",
          loading: "กำลังสร้างภาพ…",
          preview: "ตัวอย่างโลโก้ที่สร้างได้",
          apply: "ใช้ภาพนี้แทนโลโก้",
          cancel: "ยกเลิก",
          applyTitle: "ยืนยันการแทนที่โลโก้",
          applyDescription:
            "ภาพนี้จะถูกบันทึกแทนโลโก้เดิมของช่องนี้ โดยคงตำแหน่งและขนาดเดิมไว้",
          applyConfirm: "ยืนยันใช้ภาพนี้",
          noModels: "ยังไม่มีโมเดลที่รองรับพื้นหลังโปร่งใส",
          retry: "แก้ prompt แล้วลองใหม่",
        }
      : {
          title: isChannel
            ? "Generate channel logo with AI"
            : "Generate title logo with AI",
          description:
            "Choose a model, review the prompt, and confirm to generate a transparent PNG.",
          model: "Image model",
          channel: "Facebook page/channel name",
          prompt: "Generation prompt (editable)",
          generate: "Confirm generation",
          loading: "Generating image…",
          preview: "Generated logo preview",
          apply: "Use this image as logo",
          cancel: "Cancel",
          applyTitle: "Confirm logo replacement",
          applyDescription:
            "This image will replace the current logo while keeping its placement and size settings.",
          applyConfirm: "Confirm and use image",
          noModels:
            "No models with transparent-background support are available.",
          retry: "Edit the prompt and try again",
        };

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
          data-testid={`vd-logo-dialog-${slotId}`}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {copy.title}
            </DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>

          {phase === "preview" && task?.resultUrl ? (
            <div className="grid gap-4">
              <Label>{copy.preview}</Label>
              <div className="flex min-h-48 items-center justify-center rounded-lg border bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:1rem_1rem] bg-[position:0_0,0_0,.5rem_.5rem,.5rem_.5rem] p-5">
                <AuthenticatedMediaImage
                  src={task.resultUrl}
                  alt={copy.preview}
                  className="max-h-64 max-w-full object-contain"
                />
              </div>
              <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                <p className="font-medium">{copy.prompt}</p>
                <p className="mt-1 whitespace-pre-wrap break-words">{prompt}</p>
              </div>
              {errorMessage ? (
                <p className="text-sm text-destructive" role="alert">
                  {errorMessage}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor={`vd-logo-model-${slotId}`}>{copy.model}</Label>
                {modelsQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    {lang === "th" ? "กำลังโหลดโมเดล…" : "Loading models…"}
                  </p>
                ) : modelsQuery.isError ? (
                  <p
                    className="rounded-md border border-dashed p-3 text-sm text-destructive"
                    role="alert"
                  >
                    {lang === "th"
                      ? "โหลดรายการโมเดลไม่สำเร็จ กรุณาลองใหม่"
                      : "Unable to load image models. Please try again."}
                  </p>
                ) : models.length === 0 ? (
                  <p
                    className="rounded-md border border-dashed p-3 text-sm text-muted-foreground"
                    role="status"
                  >
                    {copy.noModels}
                  </p>
                ) : (
                  <Select
                    value={modelId || models[0]?.modelId}
                    onValueChange={setModelId}
                    disabled={isBusy}
                  >
                    <SelectTrigger
                      id={`vd-logo-model-${slotId}`}
                      data-testid={`vd-logo-model-${slotId}`}
                    >
                      <SelectValue placeholder={copy.model} />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map(model => (
                        <SelectItem key={model.modelId} value={model.modelId}>
                          {model.name} · {model.provider} · {model.creditCost}{" "}
                          credits
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {isChannel ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="vd-logo-channel-name">{copy.channel}</Label>
                  <Input
                    id="vd-logo-channel-name"
                    value={channelName}
                    onChange={event =>
                      handleChannelNameChange(event.target.value)
                    }
                    disabled={isBusy}
                    data-testid="vd-logo-channel-name"
                  />
                </div>
              ) : null}

              <div className="grid gap-1.5">
                <Label htmlFor={`vd-logo-prompt-${slotId}`}>
                  {copy.prompt}
                </Label>
                <Textarea
                  id={`vd-logo-prompt-${slotId}`}
                  value={prompt}
                  onChange={event => {
                    setPromptTouched(true);
                    setPrompt(event.target.value);
                  }}
                  disabled={isBusy || (isChannel && !channelName.trim())}
                  rows={5}
                  data-testid={`vd-logo-prompt-${slotId}`}
                />
              </div>
              {phase === "polling" ? (
                <p
                  className="flex items-center gap-2 text-sm text-primary"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  {copy.loading}
                </p>
              ) : null}
              {phase === "error" && errorMessage ? (
                <p className="text-sm text-destructive" role="alert">
                  {errorMessage}
                </p>
              ) : null}
            </div>
          )}

          {phase === "preview" ? (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => close(false)}
                disabled={applyMutation.isPending}
              >
                {copy.cancel}
              </Button>
              <Button
                onClick={() => setApplyConfirmOpen(true)}
                disabled={applyMutation.isPending}
                data-testid={`vd-logo-apply-${slotId}`}
              >
                {copy.apply}
              </Button>
            </DialogFooter>
          ) : (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => close(false)}
                disabled={isBusy}
              >
                {copy.cancel}
              </Button>
              <Button
                onClick={() => void handleGenerate()}
                disabled={
                  !canGenerate || modelsQuery.isLoading || models.length === 0
                }
                data-testid={`vd-logo-generate-${slotId}`}
              >
                {phase === "polling" ? (
                  <Loader2
                    className="mr-1.5 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />
                )}
                {phase === "polling"
                  ? copy.loading
                  : phase === "error"
                    ? copy.retry
                    : copy.generate}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={applyConfirmOpen}
        onOpenChange={next =>
          !applyMutation.isPending && setApplyConfirmOpen(next)
        }
      >
        <AlertDialogContent data-testid={`vd-logo-apply-confirm-${slotId}`}>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.applyTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {copy.applyDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applyMutation.isPending}>
              {copy.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleApply()}
              disabled={applyMutation.isPending}
            >
              {applyMutation.isPending ? (
                <Loader2
                  className="mr-1.5 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {copy.applyConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
