import React, { useState, useRef, useEffect } from "react";
import {
  Volume2,
  Mic,
  Sparkles,
  Wind,
  RotateCcw,
  Wrench,
  CheckCircle,
  AlertTriangle,
  Play,
  Pause,
  Headphones,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

export interface AudioMixDeltas {
  dialogueDb: number;
  foleyDb: number;
  ambienceDb: number;
}

export interface AudioInspectorProps {
  seriesId: string;
  episodeId: string;
  shotNumber: number;
  nativeAudioEnabled: boolean;
  videoUrl?: string;
  audioUrl?: string;
  isRepairing?: boolean;
  mixDeltas?: AudioMixDeltas;
  qcScore?: number;
  qcStatus?: "PASS" | "WARNING_MINOR" | "FAIL_RETRY";
  currentTake?: number;
  takesCount?: number;
  onUpdateMixDeltas?: (deltas: AudioMixDeltas) => void;
  onTriggerRepair?: () => void;
  onRollbackTake?: (takeNumber: number) => void;
  onClose?: () => void;
}

export const VerticalDramaAudioInspector: React.FC<AudioInspectorProps> = ({
  shotNumber,
  nativeAudioEnabled,
  videoUrl,
  audioUrl,
  isRepairing = false,
  mixDeltas = { dialogueDb: 0, foleyDb: -2, ambienceDb: -6 },
  qcScore = 9.2,
  qcStatus = "PASS",
  currentTake = 1,
  takesCount = 1,
  onUpdateMixDeltas,
  onTriggerRepair,
  onRollbackTake,
  onClose,
}) => {
  const [dialogueDb, setDialogueDb] = useState(mixDeltas.dialogueDb);
  const [foleyDb, setFoleyDb] = useState(mixDeltas.foleyDb);
  const [ambienceDb, setAmbienceDb] = useState(mixDeltas.ambienceDb);
  const [dialogueMuted, setDialogueMuted] = useState(false);
  const [foleyMuted, setFoleyMuted] = useState(false);
  const [ambienceMuted, setAmbienceMuted] = useState(false);
  const [soloStem, setSoloStem] = useState<"dialogue" | "foley" | "ambience" | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  const audioSourceUrl = audioUrl || videoUrl;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Synchronize audio volume / mute with the faders
  useEffect(() => {
    if (!audioRef.current) return;
    const isMuted = dialogueMuted || (soloStem !== null && soloStem !== "dialogue");
    if (isMuted) {
      audioRef.current.volume = 0;
    } else {
      const linearGain = Math.min(1.0, Math.max(0.0, Math.pow(10, dialogueDb / 20)));
      audioRef.current.volume = linearGain;
    }
  }, [dialogueDb, dialogueMuted, soloStem]);

  // Pause audio on unmount or URL change
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [audioSourceUrl]);

  const togglePreview = () => {
    if (!audioSourceUrl) {
      toast.warning("ยังไม่มีคลิปวิดีโอหรือไฟล์เสียงสำหรับช็อตนี้");
      setIsPlayingPreview(!isPlayingPreview);
      return;
    }
    if (!audioRef.current) {
      setIsPlayingPreview(!isPlayingPreview);
      return;
    }

    if (isPlayingPreview) {
      audioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      audioRef.current.currentTime = 0;
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlayingPreview(true);
          })
          .catch(err => {
            console.warn("Audio playback notice:", err?.message);
            setIsPlayingPreview(true);
          });
      } else {
        setIsPlayingPreview(true);
      }
    }
  };

  const handleDialogueChange = (vals: number[]) => {
    const val = vals[0];
    setDialogueDb(val);
    onUpdateMixDeltas?.({ dialogueDb: val, foleyDb, ambienceDb });
  };

  const handleFoleyChange = (vals: number[]) => {
    const val = vals[0];
    setFoleyDb(val);
    onUpdateMixDeltas?.({ dialogueDb, foleyDb: val, ambienceDb });
  };

  const handleAmbienceChange = (vals: number[]) => {
    const val = vals[0];
    setAmbienceDb(val);
    onUpdateMixDeltas?.({ dialogueDb, foleyDb, ambienceDb: val });
  };

  const handleResetFaders = () => {
    setDialogueDb(0);
    setFoleyDb(-2);
    setAmbienceDb(-6);
    setDialogueMuted(false);
    setFoleyMuted(false);
    setAmbienceMuted(false);
    onUpdateMixDeltas?.({ dialogueDb: 0, foleyDb: -2, ambienceDb: -6 });
  };

  const isDialogueActive = !dialogueMuted && (soloStem === null || soloStem === "dialogue");
  const isFoleyActive = !foleyMuted && (soloStem === null || soloStem === "foley");
  const isAmbienceActive = !ambienceMuted && (soloStem === null || soloStem === "ambience");

  return (
    <div
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm text-card-foreground"
      data-testid={`vd-audio-inspector-shot-${shotNumber}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Volume2 className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm">
            สตูดิโอมิกซ์เสียง — ช็อตที่ #{shotNumber}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={togglePreview}
            className="h-7 text-xs gap-1.5"
            data-testid="vd-audio-preview-toggle-btn"
          >
            {isPlayingPreview ? (
              <>
                <Pause className="h-3 w-3 text-primary" />
                <span>กำลังฟัง...</span>
              </>
            ) : (
              <>
                <Play className="h-3 w-3" />
                <span>ฟังตัวอย่าง</span>
              </>
            )}
          </Button>
          {qcStatus === "PASS" ? (
            <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="h-3 w-3" />
              QC ผ่าน ({qcScore.toFixed(1)}/10)
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              QC ต้องตรวจสอบ ({qcScore.toFixed(1)}/10)
            </Badge>
          )}
          {onClose ? (
            <Button variant="ghost" size="sm" onClick={onClose}>
              ปิด
            </Button>
          ) : null}
        </div>
      </div>

      {/* Mode Indicator */}
      <div className="rounded-md bg-muted/50 p-2 text-xs">
        <span className="font-medium">โหมดเสียงปัจจุบัน: </span>
        {nativeAudioEnabled ? (
          <span className="text-primary font-medium">เสียงสมจริงภาพยนตร์ (Cinematic Dialogue + Foley + Ambience)</span>
        ) : (
          <span className="text-muted-foreground font-medium">เสียงพูดอย่างเดียว (Spoken Dialogue Only)</span>
        )}
      </div>

      {/* 3-Stem Fader Console */}
      <div className="flex flex-col gap-3 py-1">
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>ระดับความดัง 3 แทร็ก (Stems Faders)</span>
          <button
            type="button"
            onClick={handleResetFaders}
            className="text-[10px] text-muted-foreground hover:underline font-normal cursor-pointer"
            data-testid="vd-audio-reset-faders-btn"
          >
            รีเซ็ตค่าเริ่มต้น
          </button>
        </div>

        {/* Stem 1: Dialogue */}
        <div className={`flex flex-col gap-1.5 transition-opacity ${!isDialogueActive ? "opacity-50" : "opacity-100"}`}>
          <div className="flex justify-between items-center text-xs">
            <span className="flex items-center gap-1.5">
              <Mic className="h-3.5 w-3.5 text-blue-500" />
              <span>เสียงพูด (Dialogue)</span>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className={`text-[10px] px-1.5 py-0.5 rounded border ${soloStem === "dialogue" ? "bg-amber-500/20 text-amber-500 border-amber-500/50" : "text-muted-foreground border-border hover:bg-muted"}`}
                onClick={() => setSoloStem(soloStem === "dialogue" ? null : "dialogue")}
                data-testid="vd-audio-solo-dialogue"
              >
                Solo
              </button>
              <button
                type="button"
                className={`text-[10px] px-1.5 py-0.5 rounded border ${dialogueMuted ? "bg-red-500/20 text-red-500 border-red-500/50" : "text-muted-foreground border-border hover:bg-muted"}`}
                onClick={() => setDialogueMuted(!dialogueMuted)}
                data-testid="vd-audio-mute-dialogue"
              >
                {dialogueMuted ? "Muted" : "Mute"}
              </button>
              <span className="font-mono text-muted-foreground">{!isDialogueActive ? "-∞" : (dialogueDb > 0 ? `+${dialogueDb}` : dialogueDb)} dB</span>
            </div>
          </div>
          <Slider
            min={-12}
            max={6}
            step={0.5}
            disabled={!isDialogueActive}
            value={[dialogueDb]}
            onValueChange={handleDialogueChange}
            data-testid="vd-audio-fader-dialogue"
          />
          {/* Mini LED Level Indicator */}
          <div className="flex items-center gap-1 h-1 w-full bg-muted/70 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-150 rounded-full ${
                dialogueDb > 3 ? "bg-amber-500" : dialogueDb > 0 ? "bg-blue-500" : "bg-emerald-500"
              }`}
              style={{ width: !isDialogueActive ? "0%" : `${Math.max(5, Math.min(100, ((dialogueDb + 12) / 18) * 100))}%` }}
            />
          </div>
        </div>

        {/* Stem 2: Foley */}
        {nativeAudioEnabled ? (
          <div className={`flex flex-col gap-1.5 transition-opacity ${!isFoleyActive ? "opacity-50" : "opacity-100"}`}>
            <div className="flex justify-between items-center text-xs">
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span>เสียงประกอบวัตถุ (Foley)</span>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${soloStem === "foley" ? "bg-amber-500/20 text-amber-500 border-amber-500/50" : "text-muted-foreground border-border hover:bg-muted"}`}
                  onClick={() => setSoloStem(soloStem === "foley" ? null : "foley")}
                  data-testid="vd-audio-solo-foley"
                >
                  Solo
                </button>
                <button
                  type="button"
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${foleyMuted ? "bg-red-500/20 text-red-500 border-red-500/50" : "text-muted-foreground border-border hover:bg-muted"}`}
                  onClick={() => setFoleyMuted(!foleyMuted)}
                  data-testid="vd-audio-mute-foley"
                >
                  {foleyMuted ? "Muted" : "Mute"}
                </button>
                <span className="font-mono text-muted-foreground">{!isFoleyActive ? "-∞" : (foleyDb > 0 ? `+${foleyDb}` : foleyDb)} dB</span>
              </div>
            </div>
            <Slider
              min={-18}
              max={6}
              step={0.5}
              disabled={!isFoleyActive}
              value={[foleyDb]}
              onValueChange={handleFoleyChange}
              data-testid="vd-audio-fader-foley"
            />
            {/* Mini LED Level Indicator */}
            <div className="flex items-center gap-1 h-1 w-full bg-muted/70 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-150 rounded-full ${
                  foleyDb > 3 ? "bg-amber-500" : foleyDb > 0 ? "bg-amber-400" : "bg-emerald-500"
                }`}
                style={{ width: !isFoleyActive ? "0%" : `${Math.max(5, Math.min(100, ((foleyDb + 18) / 24) * 100))}%` }}
              />
            </div>
          </div>
        ) : null}

        {/* Stem 3: Ambience */}
        {nativeAudioEnabled ? (
          <div className={`flex flex-col gap-1.5 transition-opacity ${!isAmbienceActive ? "opacity-50" : "opacity-100"}`}>
            <div className="flex justify-between items-center text-xs">
              <span className="flex items-center gap-1.5">
                <Wind className="h-3.5 w-3.5 text-emerald-500" />
                <span>เสียงบรรยากาศห้อง (Ambience)</span>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${soloStem === "ambience" ? "bg-amber-500/20 text-amber-500 border-amber-500/50" : "text-muted-foreground border-border hover:bg-muted"}`}
                  onClick={() => setSoloStem(soloStem === "ambience" ? null : "ambience")}
                  data-testid="vd-audio-solo-ambience"
                >
                  Solo
                </button>
                <button
                  type="button"
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${ambienceMuted ? "bg-red-500/20 text-red-500 border-red-500/50" : "text-muted-foreground border-border hover:bg-muted"}`}
                  onClick={() => setAmbienceMuted(!ambienceMuted)}
                  data-testid="vd-audio-mute-ambience"
                >
                  {ambienceMuted ? "Muted" : "Mute"}
                </button>
                <span className="font-mono text-muted-foreground">{!isAmbienceActive ? "-∞" : (ambienceDb > 0 ? `+${ambienceDb}` : ambienceDb)} dB</span>
              </div>
            </div>
            <Slider
              min={-24}
              max={3}
              step={0.5}
              disabled={!isAmbienceActive}
              value={[ambienceDb]}
              onValueChange={handleAmbienceChange}
              data-testid="vd-audio-fader-ambience"
            />
            {/* Mini LED Level Indicator */}
            <div className="flex items-center gap-1 h-1 w-full bg-muted/70 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-150 rounded-full ${
                  ambienceDb > 0 ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{ width: !isAmbienceActive ? "0%" : `${Math.max(5, Math.min(100, ((ambienceDb + 24) / 27) * 100))}%` }}
              />
            </div>
          </div>
        ) : null}

        {/* Acoustic Ducking Notice */}
        <p className="text-[10px] text-muted-foreground/80 italic pt-1">
          💡 เสียงประกอบและเสียงบรรยากาศจะถูกลดความดังอัตโนมัติ (Sidechain Ducking -12dB) ขณะตัวละครพูด เพื่อให้เสียงบทสนทนาคมชัด
        </p>
      </div>

      {/* Studio Metering Indicator */}
      <div className="flex items-center justify-between rounded-md border border-border/70 bg-background/50 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">มาตรฐาน EBU R128:</span>
          <Badge variant="secondary" className="font-mono text-[10px]">-14.0 LUFS</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">True Peak:</span>
          {dialogueDb > 3 || foleyDb > 3 || ambienceDb > 0 ? (
            <Badge variant="outline" className="font-mono text-[10px] border-amber-500/50 text-amber-500" data-testid="vd-audio-clipping-warning">
              &gt; -1.0 dBFS (ระวังเสียงแตก)
            </Badge>
          ) : (
            <Badge variant="secondary" className="font-mono text-[10px]">&le; -1.0 dBFS</Badge>
          )}
        </div>
      </div>

      {/* Actions & Take History */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">เวอร์ชันเสียง (Take):</span>
          <span className="font-medium">Take #{currentTake} จาก {takesCount}</span>
          {takesCount > 1 && onRollbackTake ? (
            <div className="flex items-center gap-1.5">
              <select
                aria-label="เลือกเวอร์ชันเสียง"
                value={currentTake}
                onChange={e => onRollbackTake(Number(e.target.value))}
                className="h-7 rounded border border-border bg-background px-2 text-xs"
                data-testid="vd-audio-take-select"
              >
                {Array.from({ length: takesCount }, (_, i) => i + 1).map(tNum => (
                  <option key={tNum} value={tNum}>
                    Take #{tNum} {tNum === currentTake ? "(ปัจจุบัน)" : ""}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRollbackTake(Math.max(1, currentTake - 1))}
                className="h-7 text-xs gap-1"
                data-testid="vd-audio-rollback-btn"
              >
                <RotateCcw className="h-3 w-3" />
                ย้อนกลับ (0 เครดิต)
              </Button>
            </div>
          ) : null}
        </div>

        {onTriggerRepair ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={onTriggerRepair}
            disabled={isRepairing}
            className="h-7 text-xs gap-1"
            data-testid="vd-audio-trigger-repair-btn"
          >
            <Wrench className="h-3.5 w-3.5" />
            {isRepairing ? "กำลังซ่อมเสียง..." : "ซ่อมเฉพาะเสียงพูด (5 เครดิต)"}
          </Button>
        ) : null}
      </div>

      {audioSourceUrl ? (
        <audio
          ref={audioRef}
          src={audioSourceUrl}
          preload="auto"
          onEnded={() => setIsPlayingPreview(false)}
          onPause={() => setIsPlayingPreview(false)}
        />
      ) : null}
    </div>
  );
};
