import { useMemo, useState } from "react";
import { Film, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { SourceMediaSegment } from "@shared/verticalDramaSeries/visualSource";

export function VerticalDramaFootageSegmentEditor({ segment, lang = "th", onSave }: { segment: SourceMediaSegment; lang?: "th" | "en"; onSave: (patch: Pick<SourceMediaSegment, "inSeconds" | "outSeconds" | "audioPolicy">) => void }) {
  const [inSeconds, setInSeconds] = useState(segment.inSeconds ?? 0);
  const [outSeconds, setOutSeconds] = useState(segment.outSeconds ?? 0);
  const [audioPolicy, setAudioPolicy] = useState<SourceMediaSegment["audioPolicy"]>(segment.audioPolicy);
  const valid = useMemo(() => outSeconds > inSeconds, [inSeconds, outSeconds]);
  return <section className="grid gap-3 rounded-lg border p-3" aria-labelledby={`footage-${segment.segmentId}`}><div className="flex items-center justify-between gap-2"><h4 id={`footage-${segment.segmentId}`} className="flex items-center gap-2 text-sm font-medium"><Film className="h-4 w-4" />{segment.label}</h4><Badge variant={valid ? "outline" : "destructive"}>{valid ? `${(outSeconds - inSeconds).toFixed(2)}s` : (lang === "th" ? "ช่วงเวลาไม่ถูกต้อง" : "Invalid range")}</Badge></div><p className="text-xs text-muted-foreground">{segment.locationLabel ?? segment.sourceLabel ?? (lang === "th" ? "วิดีโอ B-roll" : "Footage B-roll")}</p><div className="grid grid-cols-2 gap-2"><Label className="grid gap-1 text-xs">{lang === "th" ? "จุดเริ่ม (วินาที)" : "In (seconds)"}<Input type="number" min={0} step="0.01" value={inSeconds} onChange={event => setInSeconds(Number(event.target.value))} /></Label><Label className="grid gap-1 text-xs">{lang === "th" ? "จุดจบ (วินาที)" : "Out (seconds)"}<Input type="number" min={0} step="0.01" value={outSeconds} onChange={event => setOutSeconds(Number(event.target.value))} /></Label></div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant={audioPolicy === "keep" ? "default" : "outline"} onClick={() => setAudioPolicy("keep")}><Volume2 className="mr-1 h-3 w-3" />{lang === "th" ? "เสียงต้นฉบับ" : "Keep audio"}</Button><Button type="button" size="sm" variant={audioPolicy === "mute" ? "default" : "outline"} onClick={() => setAudioPolicy("mute")}><VolumeX className="mr-1 h-3 w-3" />{lang === "th" ? "ปิดเสียง" : "Mute"}</Button></div><Button type="button" size="sm" disabled={!valid} onClick={() => onSave({ inSeconds, outSeconds, audioPolicy })}>{lang === "th" ? "บันทึกช่วงเวลา" : "Save segment"}</Button></section>;
}
