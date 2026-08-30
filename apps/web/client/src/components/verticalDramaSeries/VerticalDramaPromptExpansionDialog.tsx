import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  PROMPT_EXPANSION_PREMISE_LIMIT,
  type PromptExpansionPreview,
} from "@shared/verticalDramaSeries/promptExpansion";

type ExpansionPreview = PromptExpansionPreview;

export function formatPromptExpansionError(
  rawMessage: string,
  lang: "th" | "en"
): string {
  const raw = rawMessage ?? "";
  if (
    /524|proxy connection|before returning JSON|content-type=text\/html|<!DOCTYPE html>/i.test(
      raw
    )
  ) {
    return lang === "th"
      ? "เซิร์ฟเวอร์ใช้เวลาประมวลผลนานเกินกำหนด จึงยังไม่มีผลลัพธ์และไม่มีการใช้ fallback กรุณากดลองใหม่อีกครั้ง"
      : "The server took too long to complete the real LLM run. No result or fallback was used; please retry.";
  }
  const withoutHtml = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return withoutHtml.length > 500
    ? `${withoutHtml.slice(0, 500)}…`
    : withoutHtml ||
        (lang === "th"
          ? "การขยายโจทย์ไม่สำเร็จ กรุณาลองใหม่"
          : "Prompt expansion failed; please retry.");
}

export function VerticalDramaPromptExpansionDialog({
  open,
  prompt,
  seriesId,
  modelId,
  packId,
  draftSessionId,
  lang = "th",
  onOpenChange,
  onApply,
}: {
  open: boolean;
  prompt: string;
  seriesId?: number;
  modelId?: string | null;
  packId?: number;
  draftSessionId?: string;
  lang?: "th" | "en";
  onOpenChange: (open: boolean) => void;
  onApply: (result: {
    expandedPrompt: string;
    originalPromptHash: string;
    runId: number;
  }) => void;
}) {
  const [preview, setPreview] = useState<ExpansionPreview | null>(null);
  const [runId, setRunId] = useState<number | null>(null);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [slotDrafts, setSlotDrafts] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [interactiveJobId, setInteractiveJobId] = useState<string | null>(null);
  const [interactiveJobScope, setInteractiveJobScope] = useState<string>("");
  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setRunId(null);
    setDraftPrompt("");
    setSlotDrafts({});
    setErrorMessage(null);
    setInteractiveJobId(null);
    setInteractiveJobScope("");
  }, [open, prompt]);
  const sourcePackQuery = trpc.verticalDramaSeries.getSourcePack.useQuery(
    { packId: packId ?? 0 },
    { enabled: Boolean(open && packId), staleTime: 0 }
  );
  const previewMutation =
    trpc.verticalDramaSeries.previewPromptExpansion.useMutation({
      onSuccess: result => {
        if (result.jobId) {
          setErrorMessage(null);
          setInteractiveJobId(result.jobId);
          setInteractiveJobScope(
            seriesId != null
              ? `series:${seriesId}`
              : `prompt:${draftSessionId ?? "draft"}`
          );
          return;
        }
        const previewResult = result.preview as ExpansionPreview | undefined;
        if (!previewResult || result.runId == null) {
          setErrorMessage(
            lang === "th"
              ? "งานขยายโจทย์ไม่มีผลลัพธ์ที่สมบูรณ์"
              : "Prompt expansion returned no complete result"
          );
          return;
        }
        setErrorMessage(null);
        setPreview(previewResult);
        setRunId(result.runId);
        setDraftPrompt(previewResult.expandedPrompt);
        setSlotDrafts(
          Object.fromEntries(
            previewResult.slots.map(slot => [slot.slotKey, slot.description])
          )
        );
      },
      onError: error => {
        const message = formatPromptExpansionError(error.message, lang);
        setErrorMessage(message);
        toast.error(message);
      },
    });
  const interactiveJobStatusProcedure =
    trpc.verticalDramaSeries.getInteractiveJobStatus;
  const interactiveJobQuery = interactiveJobStatusProcedure?.useQuery(
    {
      jobId: interactiveJobId ?? "00000000-0000-0000-0000-000000000000",
      scopeKey: interactiveJobScope || "prompt:pending",
    },
    {
      enabled: Boolean(interactiveJobId && interactiveJobScope),
      refetchInterval: interactiveJobId ? 2000 : false,
      staleTime: 0,
    }
  ) ?? { data: undefined };
  useEffect(() => {
    const job = interactiveJobQuery.data;
    if (!job || !interactiveJobId) return;
    if (job.status === "succeeded") {
      const result = job.result as
        | { preview?: ExpansionPreview; runId?: number }
        | undefined;
      if (!result?.preview || result.runId == null) {
        setErrorMessage(
          lang === "th"
            ? "งานขยายโจทย์เสร็จแล้วแต่ผลลัพธ์ไม่ครบ"
            : "Expansion finished without a complete result"
        );
      } else {
        setPreview(result.preview);
        setRunId(result.runId);
        setDraftPrompt(result.preview.expandedPrompt);
        setSlotDrafts(
          Object.fromEntries(
            result.preview.slots.map(slot => [slot.slotKey, slot.description])
          )
        );
      }
      setInteractiveJobId(null);
      setInteractiveJobScope("");
    } else if (job.status === "failed") {
      const message = formatPromptExpansionError(
        job.error ?? "Prompt expansion failed",
        lang
      );
      setErrorMessage(
        `${message}${job.traceId ? ` (trace: ${job.traceId})` : ""}`
      );
      toast.error(message);
      setInteractiveJobId(null);
      setInteractiveJobScope("");
    }
  }, [interactiveJobId, interactiveJobQuery.data, lang]);
  const applyMutation =
    trpc.verticalDramaSeries.applyPromptExpansion.useMutation({
      onSuccess: () => {
        if (draftPrompt.trim() && preview && runId != null) {
          onApply({
            expandedPrompt: draftPrompt.trim(),
            originalPromptHash: preview.originalPromptHash,
            runId,
          });
        }
        onOpenChange(false);
        toast.success(
          lang === "th"
            ? "นำโจทย์ที่ตรวจแล้วไปใช้ใน flow เดิมแล้ว"
            : "Applied to the existing flow"
        );
      },
      onError: error => {
        const message = formatPromptExpansionError(error.message, lang);
        setErrorMessage(message);
        toast.error(message);
      },
    });
  const startPreview = () => {
    if (prompt.trim().length > PROMPT_EXPANSION_PREMISE_LIMIT) {
      setErrorMessage(
        lang === "th"
          ? `โจทย์เกิน ${PROMPT_EXPANSION_PREMISE_LIMIT.toLocaleString()} ตัวอักษร ระบบล็อกการขยายไว้`
          : `The premise exceeds ${PROMPT_EXPANSION_PREMISE_LIMIT} characters; expansion is locked.`
      );
      return;
    }
    previewMutation.mutate({
      prompt,
      locale: lang,
      seriesId,
      modelId,
      draftSessionId,
      idempotencyKey: `vd-prompt-expansion-${seriesId ?? "draft"}-${Date.now()}`,
    });
  };
  const apply = () => {
    if (!preview || runId == null) return;
    const approved: ExpansionPreview = {
      ...preview,
      status: "preview",
      expandedPrompt: draftPrompt.trim(),
      slots: preview.slots.map(slot => ({
        ...slot,
        description: slotDrafts[slot.slotKey] ?? slot.description,
      })),
    };
    applyMutation.mutate({
      runId,
      expectedRevision: preview.revision,
      originalPromptHash: preview.originalPromptHash,
      approved,
      ...(packId && sourcePackQuery.data
        ? {
            packId,
            expectedPackVersion: sourcePackQuery.data.pack.version,
          }
        : {}),
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            {lang === "th" ? "ขยายโจทย์ด้วย AI" : "Expand premise with AI"}
          </DialogTitle>
          <DialogDescription>
            {lang === "th"
              ? "ระบบจะเรียก skill ขยายโจทย์ด้วย LLM จริงเท่านั้น ผลลัพธ์เป็นเนื้อเรื่องย่อกึ่งสมบูรณ์สำหรับตรวจ/แก้ไข และยังไม่ใช่ Draft ฉากเต็ม โจทย์ต้นฉบับจะไม่ถูกแก้จนกว่าจะกดยืนยัน"
              : "A real LLM-only expansion skill creates an editable treatment. It is not the later scene Draft, and the original premise stays unchanged until confirmation."}
          </DialogDescription>
        </DialogHeader>
        {!preview ? (
          <section className="grid gap-3">
            <p className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              {prompt}
            </p>
            <p
              className={`text-xs ${prompt.length > PROMPT_EXPANSION_PREMISE_LIMIT ? "text-destructive" : "text-muted-foreground"}`}
              role="status"
            >
              {prompt.length.toLocaleString()} /{" "}
              {PROMPT_EXPANSION_PREMISE_LIMIT.toLocaleString()} ตัวอักษร
            </p>
            {errorMessage && (
              <div
                className="max-h-48 max-w-full overflow-y-auto break-words whitespace-pre-wrap rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
                role="alert"
              >
                {errorMessage}
                <p className="mt-1 text-xs">
                  ระบบไม่แสดงผลลัพธ์บางส่วนและไม่ใช้ fallback
                  เมื่อการรันจริงไม่สำเร็จ
                </p>
              </div>
            )}
            <Button
              type="button"
              onClick={startPreview}
              disabled={
                previewMutation.isPending ||
                !prompt.trim() ||
                prompt.length > PROMPT_EXPANSION_PREMISE_LIMIT
              }
            >
              {previewMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {lang === "th" ? "คิดและแสดงผลก่อน" : "Generate preview"}
            </Button>
          </section>
        ) : (
          <section className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              <Badge>{preview.brief.profile}</Badge>
              <Badge variant="outline">revision {preview.revision}</Badge>
            </div>
            {preview.execution && (
              <p
                className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-950"
                role="status"
              >
                LLM-only skill run: {preview.execution.provider} /{" "}
                {preview.execution.model} · {preview.execution.attemptCount}{" "}
                attempt(s) ·{" "}
                {preview.execution.inputTokens + preview.execution.outputTokens}{" "}
                tokens · mocked=false
              </p>
            )}
            <label className="grid gap-1 text-sm font-medium">
              {lang === "th"
                ? "โจทย์ฉบับแก้ไขได้"
                : "Editable expanded premise"}
              <Textarea
                value={draftPrompt}
                onChange={event => setDraftPrompt(event.target.value)}
                rows={8}
              />
            </label>
            <div className="grid gap-2 rounded-md border p-3">
              <p className="text-sm font-semibold">{preview.brief.title}</p>
              <p className="text-sm text-muted-foreground">
                {preview.brief.angle}
              </p>
              <p className="text-xs">{preview.brief.scope.join(" • ")}</p>
            </div>
            {preview.brief.storyTreatment && (
              <section className="grid gap-2 rounded-md border border-primary/30 bg-primary/5 p-3">
                <h4 className="text-sm font-semibold">
                  {lang === "th"
                    ? "โครงเรื่องย่อที่ skill ขยายให้"
                    : "Story treatment from the skill"}
                </h4>
                <p className="text-sm">
                  <strong>ตัวละคร:</strong>{" "}
                  {preview.brief.storyTreatment.protagonists
                    .map(
                      character =>
                        `${character.name} — ${character.background} เป้าหมาย: ${character.goal}`
                    )
                    .join(" | ")}
                </p>
                <p className="text-sm">
                  <strong>สถานที่/บริบท:</strong>{" "}
                  {preview.brief.storyTreatment.setting}
                </p>
                <p className="text-sm">
                  <strong>พบกัน/เหตุเริ่มเรื่อง:</strong>{" "}
                  {preview.brief.storyTreatment.meetingAndIncitingEvent}
                </p>
                <p className="text-sm">
                  <strong>ความสัมพันธ์:</strong>{" "}
                  {preview.brief.storyTreatment.relationshipProgression.join(
                    " → "
                  )}
                </p>
                <p className="text-sm">
                  <strong>อุปสรรค:</strong>{" "}
                  {preview.brief.storyTreatment.obstacles.join(" • ")}
                </p>
                <p className="text-sm">
                  <strong>คำถามหลัก:</strong>{" "}
                  {preview.brief.storyTreatment.centralQuestion}
                </p>
                <p className="text-sm">
                  <strong>ปมใหญ่:</strong>{" "}
                  {preview.brief.storyTreatment.majorConflict}
                </p>
                <p className="text-sm">
                  <strong>ไคลแมกซ์:</strong>{" "}
                  {preview.brief.storyTreatment.climax}
                </p>
                <p className="text-sm">
                  <strong>ทิศทางตอนจบ:</strong>{" "}
                  {preview.brief.storyTreatment.endingDirection}
                </p>
              </section>
            )}
            {preview.sources.length > 0 && (
              <section className="grid gap-2">
                <h4 className="text-sm font-semibold">
                  {lang === "th" ? "แหล่งข้อมูลที่ค้นพบ" : "Research sources"}
                </h4>
                {preview.sources.map(source => (
                  <a
                    className="text-sm underline"
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {source.title}
                    {source.publisher ? ` — ${source.publisher}` : ""}
                  </a>
                ))}
              </section>
            )}
            {preview.warnings.length > 0 && (
              <section className="grid gap-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                <strong>
                  {lang === "th" ? "ข้อควรตรวจสอบ" : "Review warnings"}
                </strong>
                {preview.warnings.map((warning, index) => (
                  <p key={`${index}-${warning}`}>{warning}</p>
                ))}
              </section>
            )}
            <section className="grid gap-3">
              <h4 className="text-sm font-semibold">
                {lang === "th"
                  ? "ภาพ/วิดีโอที่ระบบเสนอ"
                  : "Suggested visual slots"}
              </h4>
              {preview.slots.map(slot => (
                <label
                  className="grid gap-1 rounded-md border p-3 text-sm"
                  key={slot.slotKey}
                >
                  <span className="font-medium">
                    {slot.title}{" "}
                    <Badge variant="outline">{slot.semanticRole}</Badge>
                  </span>
                  <Textarea
                    value={slotDrafts[slot.slotKey] ?? slot.description}
                    onChange={event =>
                      setSlotDrafts(previous => ({
                        ...previous,
                        [slot.slotKey]: event.target.value,
                      }))
                    }
                    rows={2}
                  />
                  <span className="text-xs text-muted-foreground">
                    {slot.evidenceStatus} · {slot.mediaType}
                    {slot.required ? " · required" : ""}
                  </span>
                </label>
              ))}
            </section>
          </section>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {lang === "th" ? "ยกเลิก" : "Cancel"}
          </Button>
          {preview && (
            <Button
              type="button"
              onClick={apply}
              disabled={
                applyMutation.isPending ||
                !draftPrompt.trim() ||
                Boolean(packId && !sourcePackQuery.data)
              }
            >
              {applyMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {lang === "th" ? "ยืนยันและนำไปใช้" : "Confirm and apply"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
