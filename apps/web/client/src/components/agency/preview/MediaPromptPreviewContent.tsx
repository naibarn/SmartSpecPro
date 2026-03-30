import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Image, Video, Music, ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

interface MediaPromptPreviewContentProps {
  data: {
    mediaType: "image" | "video" | "audio";
    prompt: string;
    model: string | null;
    referenceImageUrls: string[];
  };
}

const mediaTypeConfig = {
  image: { icon: Image, label: "Image", color: "text-emerald-700 bg-emerald-100" },
  video: { icon: Video, label: "Video", color: "text-violet-700 bg-violet-100" },
  audio: { icon: Music, label: "Audio", color: "text-blue-700 bg-blue-100" },
} as const;

export function MediaPromptPreviewContent({
  data,
}: MediaPromptPreviewContentProps) {
  const [, setLocation] = useLocation();
  const config = mediaTypeConfig[data.mediaType];
  const Icon = config.icon;

  const copyPrompt = () => {
    navigator.clipboard.writeText(data.prompt);
    toast.success("Prompt copied to clipboard");
  };

  const openInStudio = () => {
    const params = new URLSearchParams();
    params.set("prompt", data.prompt);
    params.set("type", data.mediaType);
    if (data.model) params.set("model", data.model);
    data.referenceImageUrls.forEach((url) => {
      params.append("referenceImages", url);
    });
    setLocation(`/media-studio?${params.toString()}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge className={`gap-1 ${config.color}`}>
          <Icon className="h-3 w-3" />
          {config.label}
        </Badge>
        {data.model && (
          <Badge variant="outline">{data.model}</Badge>
        )}
      </div>

      <div className="rounded-lg border bg-background p-3">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {data.prompt}
        </p>
      </div>

      {data.referenceImageUrls.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Reference Images
          </p>
          <div className="flex flex-wrap gap-2">
            {data.referenceImageUrls.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Reference ${i + 1}`}
                className="h-16 w-16 rounded-lg border object-cover"
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={copyPrompt}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy Prompt
        </Button>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={openInStudio}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open in Media Studio
        </Button>
      </div>
    </div>
  );
}
