import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  X,
  Code2,
  Image,
  Video,
  FileText,
  File,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CodeArtifact } from "./CodeArtifact";
import { ImageLightbox } from "../media/ImageLightbox";
import { VideoPlayer } from "../media/VideoPlayer";
import { DashboardCard } from "@/components/dashboard";

export type ArtifactType =
  | "code"
  | "markdown"
  | "image"
  | "slideshow"
  | "video"
  | "pdf"
  | "file"
  | "chart"
  | "table";

export interface Artifact {
  id: string;
  type: ArtifactType;
  title?: string;
  content: string | string[];
  language?: string;
  metadata?: Record<string, unknown>;
}

interface ArtifactPanelProps {
  artifacts: Artifact[];
  onClose?: () => void;
  className?: string;
}

const artifactIcons: Record<ArtifactType, React.ComponentType<{ className?: string }>> = {
  code: Code2,
  markdown: FileText,
  image: Image,
  slideshow: Layers,
  video: Video,
  pdf: FileText,
  file: File,
  chart: FileText,
  table: FileText,
};

export function ArtifactPanel({ artifacts, onClose, className }: ArtifactPanelProps) {
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(
    artifacts.length > 0 ? artifacts[0] : null
  );
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  if (artifacts.length === 0) {
    return (
      <DashboardCard
        className={cn("h-full flex flex-col", className)}
        title="Artifacts"
        description="Code, images, and files from this conversation"
        trailing={onClose ? (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      >
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">No artifacts in this conversation</p>
        </div>
      </DashboardCard>
    );
  }

  const currentIndex = selectedArtifact
    ? artifacts.findIndex((a) => a.id === selectedArtifact.id)
    : 0;

  const goToPrevious = () => {
    const newIndex = currentIndex > 0 ? currentIndex - 1 : artifacts.length - 1;
    setSelectedArtifact(artifacts[newIndex]);
  };

  const goToNext = () => {
    const newIndex = currentIndex < artifacts.length - 1 ? currentIndex + 1 : 0;
    setSelectedArtifact(artifacts[newIndex]);
  };

  const openImageLightbox = (images: string[], startIndex: number = 0) => {
    setLightboxIndex(startIndex);
    setLightboxOpen(true);
  };

  const renderArtifactContent = (artifact: Artifact) => {
    switch (artifact.type) {
      case "code":
        return (
          <CodeArtifact
            code={typeof artifact.content === "string" ? artifact.content : artifact.content.join("\n")}
            language={artifact.language || "plaintext"}
            title={artifact.title}
            maxHeight="500px"
          />
        );

      case "image":
        const imageUrl = typeof artifact.content === "string" ? artifact.content : artifact.content[0];
        return (
          <div className="space-y-2">
            <img
              src={imageUrl}
              alt={artifact.title || "Image"}
              className="max-h-[500px] w-auto rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => openImageLightbox([imageUrl])}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openImageLightbox([imageUrl])}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View Full Size
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = imageUrl;
                  a.download = artifact.title || "image";
                  a.click();
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>
          </div>
        );

      case "slideshow":
        const images = Array.isArray(artifact.content) ? artifact.content : [artifact.content];
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {images.slice(0, 4).map((img, idx) => (
                <img
                  key={idx}
                  src={img}
                  alt={`Slide ${idx + 1}`}
                  className="h-32 w-full rounded-lg border object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => openImageLightbox(images, idx)}
                />
              ))}
            </div>
            {images.length > 4 && (
              <p className="text-sm text-muted-foreground text-center">
                +{images.length - 4} more images
              </p>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => openImageLightbox(images)}
            >
              <Layers className="mr-2 h-4 w-4" />
              View Slideshow ({images.length} images)
            </Button>

            <ImageLightbox
              images={images.map((src, idx) => ({
                src,
                title: `${artifact.title || "Slide"} ${idx + 1}`,
              }))}
              initialIndex={lightboxIndex}
              open={lightboxOpen}
              onClose={() => setLightboxOpen(false)}
            />
          </div>
        );

      case "video":
        const videoUrl = typeof artifact.content === "string" ? artifact.content : artifact.content[0];
        return (
          <VideoPlayer
            src={videoUrl}
            className="max-h-[400px]"
          />
        );

      case "markdown":
        return (
          <div className="prose prose-sm dark:prose-invert max-w-none rounded-lg border bg-muted/30 p-4">
            <pre className="whitespace-pre-wrap">
              {typeof artifact.content === "string" ? artifact.content : artifact.content.join("\n")}
            </pre>
          </div>
        );

      case "file":
        const fileUrl = typeof artifact.content === "string" ? artifact.content : artifact.content[0];
        return (
          <div className="flex items-center gap-4 rounded-lg border p-4">
            <File className="h-12 w-12 text-muted-foreground" />
            <div className="flex-1">
              <h4 className="font-medium">{artifact.title || "File"}</h4>
              <p className="text-sm text-muted-foreground">
                {artifact.metadata?.size
                  ? `${Math.round(Number(artifact.metadata.size) / 1024)} KB`
                  : "Download file"}
              </p>
            </div>
            <Button asChild>
              <a href={fileUrl} download={artifact.title}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </a>
            </Button>
          </div>
        );

      default:
        return (
          <div className="rounded-lg border bg-muted/30 p-4">
            <pre className="whitespace-pre-wrap text-sm">
              {typeof artifact.content === "string" ? artifact.content : JSON.stringify(artifact.content, null, 2)}
            </pre>
          </div>
        );
    }
  };

  return (
    <DashboardCard
      className={cn("h-full flex flex-col", className)}
      bodyClassName="flex flex-1 flex-col overflow-hidden p-0"
      leading={<Layers className="h-5 w-5 text-primary" />}
      title={
        <div className="flex items-center gap-2">
          <span>Artifacts</span>
          <Badge variant="secondary">{artifacts.length}</Badge>
        </div>
      }
      description="Code, images, and files from this conversation"
      trailing={onClose ? (
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    >
        {artifacts.length === 1 ? (
          <ScrollArea className="h-full px-4 pb-4">
            {renderArtifactContent(artifacts[0])}
          </ScrollArea>
        ) : (
          <Tabs
            value={selectedArtifact?.id || artifacts[0].id}
            onValueChange={(id) => {
              const artifact = artifacts.find((a) => a.id === id);
              if (artifact) setSelectedArtifact(artifact);
            }}
            className="h-full flex flex-col"
          >
            {/* Artifact tabs */}
            <div className="border-b px-4">
              <ScrollArea className="w-full">
                <TabsList className="h-10 w-full justify-start bg-transparent p-0">
                  {artifacts.map((artifact) => {
                    const Icon = artifactIcons[artifact.type] || File;
                    return (
                      <TabsTrigger
                        key={artifact.id}
                        value={artifact.id}
                        className="gap-2 data-[state=active]:bg-muted"
                      >
                        <Icon className="h-4 w-4" />
                        <span className="max-w-[100px] truncate">
                          {artifact.title || artifact.type}
                        </span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </ScrollArea>
            </div>

            {/* Artifact content */}
            {artifacts.map((artifact) => (
              <TabsContent
                key={artifact.id}
                value={artifact.id}
                className="flex-1 m-0 data-[state=active]:flex data-[state=active]:flex-col"
              >
                <ScrollArea className="flex-1 px-4 pb-4">
                  <div className="pt-4">
                    {renderArtifactContent(artifact)}
                  </div>
                </ScrollArea>
              </TabsContent>
            ))}

            {/* Navigation */}
            {artifacts.length > 1 && (
              <div className="flex items-center justify-between border-t px-4 py-2">
                <Button variant="ghost" size="sm" onClick={goToPrevious}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  {currentIndex + 1} of {artifacts.length}
                </span>
                <Button variant="ghost" size="sm" onClick={goToNext}>
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            )}
          </Tabs>
        )}
    </DashboardCard>
  );
}
