import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Camera, Clock, Film, Mic, Sun, MessageCircle } from "lucide-react";

interface StoryboardPreviewContentProps {
  data: {
    title: string;
    totalDurationSeconds: number;
    style: string;
    scenes: Array<{
      sceneNumber: number;
      durationSeconds: number;
      description: string;
      dialogue: string | null;
      camera: string;
      lighting: string;
      videoPrompt: string;
      audioPrompt: string | null;
    }>;
  };
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export function StoryboardPreviewContent({
  data,
}: StoryboardPreviewContentProps) {
  return (
    <div className="space-y-4">
      {/* Meta row */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" />
          {formatDuration(data.totalDurationSeconds)}
        </Badge>
        <Badge variant="outline">{data.style}</Badge>
        <Badge variant="outline">{data.scenes.length} scenes</Badge>
      </div>

      {/* Scenes */}
      <div className="space-y-3">
        {data.scenes.map((scene) => (
          <div
            key={scene.sceneNumber}
            className="rounded-xl border bg-background p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
                  {scene.sceneNumber}
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">
                    Scene {scene.sceneNumber}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(scene.durationSeconds)}
              </Badge>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-foreground/80">
              {scene.description}
            </p>

            {scene.dialogue && (
              <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-muted/40 p-2 text-xs">
                <MessageCircle className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="italic text-foreground/70">
                  &ldquo;{scene.dialogue}&rdquo;
                </span>
              </div>
            )}

            <Separator className="my-3" />

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Camera className="h-3 w-3" />
                <span>{scene.camera}</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Sun className="h-3 w-3" />
                <span>{scene.lighting}</span>
              </div>
            </div>

            <div className="mt-2 rounded-lg bg-violet-50/50 p-2">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-violet-700">
                <Film className="h-3 w-3" />
                Video Prompt
              </div>
              <p className="text-xs leading-relaxed text-violet-900/70">
                {scene.videoPrompt}
              </p>
            </div>

            {scene.audioPrompt && (
              <div className="mt-2 rounded-lg bg-blue-50/50 p-2">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-blue-700">
                  <Mic className="h-3 w-3" />
                  Audio Prompt
                </div>
                <p className="text-xs leading-relaxed text-blue-900/70">
                  {scene.audioPrompt}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
