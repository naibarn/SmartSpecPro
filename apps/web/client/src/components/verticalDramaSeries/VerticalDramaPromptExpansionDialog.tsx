import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type ExpansionPreview = {
  revision: number;
  originalPrompt: string;
  originalPromptHash: string;
  status: "preview" | "applied" | "cancelled" | "stale" | "failed";
  brief: {
    title: string;
    oneLineSummary: string;
    profile: "review" | "documentary" | "news_report" | "software_review" | "story";
    angle: string;
    scope: string[];
    factualClaims: string[];
    creativeAssumptions: string[];
    exclusions: string[];
  };
  expandedPrompt: string;
  sources: Array<{ url: string; title: string; publisher?: string; accessedAt: string; supports: string[] }>;
  warnings: string[];
  slots: Array<{
    slotKey: string;
    title: string;
    description: string;
    semanticRole: "scene_anchor" | "reference" | "b_roll_still" | "b_roll_footage";
    mediaType: "image" | "video" | "mixed";
    required: boolean;
    evidenceStatus: "not_applicable" | "illustrative" | "needs_verification" | "verified";
    rationale?: string;
  }>;
};

export function VerticalDramaPromptExpansionDialog({
  open,
  prompt,
  seriesId,
  draftSessionId,
  lang = "th",
  onOpenChange,
  onApply,
}: {
  open: boolean;
  prompt: string;
  seriesId?: number;
  draftSessionId?: string;
  lang?: "th" | "en";
  onOpenChange: (open: boolean) => void;
  onApply: (expandedPrompt: string) => void;
}) {
  const [preview, setPreview] = useState<ExpansionPreview | null>(null);
  const [runId, setRunId] = useState<number | null>(null);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [slotDrafts, setSlotDrafts] = useState<Record<string, string>>({});
  const previewMutation = trpc.verticalDramaSeries.previewPromptExpansion.useMutation({
    onSuccess: result => {
      setPreview(result.preview as ExpansionPreview);
      setRunId(result.runId);
      setDraftPrompt(result.preview.expandedPrompt);
      setSlotDrafts(Object.fromEntries(result.preview.slots.map(slot => [slot.slotKey, slot.description])));
    },
    onError: error => toast.error(error.message),
  });
  const applyMutation = trpc.verticalDramaSeries.applyPromptExpansion.useMutation({
    onSuccess: () => {
      if (draftPrompt.trim()) onApply(draftPrompt.trim());
      onOpenChange(false);
      toast.success(lang === "th" ? "นำโจทย์ที่ตรวจแล้วไปใช้ใน flow เดิมแล้ว" : "Applied to the existing flow");
    },
    onError: error => toast.error(error.message),
  });
  const startPreview = () => {
    previewMutation.mutate({
      prompt,
      seriesId,
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
      slots: preview.slots.map(slot => ({ ...slot, description: slotDrafts[slot.slotKey] ?? slot.description })),
    };
    applyMutation.mutate({ runId, expectedRevision: preview.revision, originalPromptHash: preview.originalPromptHash, approved });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" />{lang === "th" ? "ขยายโจทย์ด้วย AI" : "Expand premise with AI"}</DialogTitle>
          <DialogDescription>{lang === "th" ? "ระบบจะแสดงผลให้ตรวจและแก้ไขก่อนนำไปใช้ โจทย์ต้นฉบับจะไม่ถูกแก้จนกว่าจะกดยืนยัน" : "Review and edit the interpretation before applying it. The original premise stays unchanged until confirmation."}</DialogDescription>
        </DialogHeader>
        {!preview ? (
          <section className="grid gap-3">
            <p className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{prompt}</p>
            <Button type="button" onClick={startPreview} disabled={previewMutation.isPending || !prompt.trim()}>
              {previewMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {lang === "th" ? "คิดและแสดงผลก่อน" : "Generate preview"}
            </Button>
          </section>
        ) : (
          <section className="grid gap-4">
            <div className="flex flex-wrap gap-2"><Badge>{preview.brief.profile}</Badge><Badge variant="outline">revision {preview.revision}</Badge></div>
            <label className="grid gap-1 text-sm font-medium">{lang === "th" ? "โจทย์ฉบับแก้ไขได้" : "Editable expanded premise"}<Textarea value={draftPrompt} onChange={event => setDraftPrompt(event.target.value)} rows={8} /></label>
            <div className="grid gap-2 rounded-md border p-3"><p className="text-sm font-semibold">{preview.brief.title}</p><p className="text-sm text-muted-foreground">{preview.brief.angle}</p><p className="text-xs">{preview.brief.scope.join(" • ")}</p></div>
            {preview.sources.length > 0 && <section className="grid gap-2"><h4 className="text-sm font-semibold">{lang === "th" ? "แหล่งข้อมูลที่ค้นพบ" : "Research sources"}</h4>{preview.sources.map(source => <a className="text-sm underline" key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}{source.publisher ? ` — ${source.publisher}` : ""}</a>)}</section>}
            {preview.warnings.length > 0 && <section className="grid gap-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"><strong>{lang === "th" ? "ข้อควรตรวจสอบ" : "Review warnings"}</strong>{preview.warnings.map((warning, index) => <p key={`${index}-${warning}`}>{warning}</p>)}</section>}
            <section className="grid gap-3"><h4 className="text-sm font-semibold">{lang === "th" ? "ภาพ/วิดีโอที่ระบบเสนอ" : "Suggested visual slots"}</h4>{preview.slots.map(slot => <label className="grid gap-1 rounded-md border p-3 text-sm" key={slot.slotKey}><span className="font-medium">{slot.title} <Badge variant="outline">{slot.semanticRole}</Badge></span><Textarea value={slotDrafts[slot.slotKey] ?? slot.description} onChange={event => setSlotDrafts(previous => ({ ...previous, [slot.slotKey]: event.target.value }))} rows={2} /><span className="text-xs text-muted-foreground">{slot.evidenceStatus} · {slot.mediaType}{slot.required ? " · required" : ""}</span></label>)}</section>
          </section>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{lang === "th" ? "ยกเลิก" : "Cancel"}</Button>
          {preview && <Button type="button" onClick={apply} disabled={applyMutation.isPending || !draftPrompt.trim()}>{applyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{lang === "th" ? "ยืนยันและนำไปใช้" : "Confirm and apply"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
