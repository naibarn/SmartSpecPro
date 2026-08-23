import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { NewsClaim } from "@shared/verticalDramaSeries/newsReport";

export function VerticalDramaNewsEvidencePanel({ claims, lang = "th", onClaimsChange }: { claims: NewsClaim[]; lang?: "th" | "en"; onClaimsChange?: (claims: NewsClaim[]) => void }) {
  const [draft, setDraft] = useState("");
  const [evaluated, setEvaluated] = useState<NewsClaim[]>(claims);
  const evaluateMutation = trpc.verticalDramaSeries.evaluateNewsReport.useMutation({ onSuccess: result => setEvaluated(result.claims), onError: error => toast.error(error.message) });
  const readiness = useMemo(() => evaluated.length ? evaluated.every(claim => claim.status === "verified" && claim.freshness === "current" && claim.visualSlotIds.length > 0) : false, [evaluated]);
  const addClaim = () => {
    if (!draft.trim()) return;
    const next: NewsClaim = { claimId: `claim-${Date.now()}`, text: draft.trim(), claimType: "current_event", geography: null, validFrom: null, validUntil: null, asOf: null, evidenceRefs: [], visualSlotIds: [], attribution: null, status: "needs_verification", freshness: "unknown", correctionRevision: 0, correctionNote: null };
    const nextClaims = [...evaluated, next];
    setEvaluated(nextClaims);
    onClaimsChange?.(nextClaims);
    setDraft("");
  };
  return (
    <section className="grid gap-3 rounded-xl border bg-background p-4" aria-labelledby="vd-news-evidence-title">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 id="vd-news-evidence-title" className="text-sm font-semibold">{lang === "th" ? "หลักฐานข่าวและความพร้อมเผยแพร่" : "News evidence and publish readiness"}</h3><p className="text-xs text-muted-foreground">{lang === "th" ? "ข้อมูลที่ระบบค้นหรือ AI สร้างยังไม่ถือเป็นข้อเท็จจริงจนกว่าจะมีหลักฐานและเวลาอ้างอิง" : "Research and AI visuals are not facts until evidence and as-of time are present."}</p></div><Badge variant={readiness ? "default" : "destructive"}>{readiness ? (lang === "th" ? "พร้อมตรวจเผยแพร่" : "Ready for review") : (lang === "th" ? "ยังไม่พร้อม" : "Blocked")}</Badge></div>
      <div className="flex gap-2"><Textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder={lang === "th" ? "เพิ่ม claim ที่ต้องตรวจสอบ" : "Add a claim to verify"} rows={2} /><Button type="button" variant="outline" onClick={addClaim}>{lang === "th" ? "เพิ่ม" : "Add"}</Button></div>
      {evaluated.length === 0 ? <p className="text-sm text-muted-foreground">{lang === "th" ? "ยังไม่มี claim — เพิ่มข้อความเพื่อเริ่มตรวจสอบ" : "No claims yet — add one to start."}</p> : <div className="grid gap-2">{evaluated.map(claim => <article className="grid gap-2 rounded-md border p-3" key={claim.claimId}><div className="flex items-start gap-2 text-sm"><span className="mt-0.5">{claim.status === "verified" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : claim.status === "stale" ? <Clock3 className="h-4 w-4 text-amber-600" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />}</span><p>{claim.text}</p></div><div className="flex flex-wrap gap-1 text-xs"><Badge variant="outline">{claim.status}</Badge><Badge variant="outline">{claim.freshness}</Badge><Badge variant="outline">{claim.visualSlotIds.length ? `${claim.visualSlotIds.length} visual` : "no visual coverage"}</Badge></div></article>)}</div>}
      <Button type="button" variant="secondary" onClick={() => evaluateMutation.mutate({ claims: evaluated })} disabled={evaluateMutation.isPending || evaluated.length === 0}>{evaluateMutation.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}{lang === "th" ? "ตรวจ freshness และ readiness" : "Check freshness and readiness"}</Button>
    </section>
  );
}
