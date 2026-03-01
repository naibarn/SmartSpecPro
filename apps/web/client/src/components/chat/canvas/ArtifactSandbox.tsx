import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";

interface ArtifactSandboxProps {
  artifactType: "react" | "html";
  content: string;
}

const SANDBOX_ORIGIN = "https://sandbox.smartaihub.app";

export function ArtifactSandbox({ artifactType, content }: ArtifactSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(300);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== SANDBOX_ORIGIN) return;

      const data = event.data;
      if (data?.type === "rendered" && typeof data.height === "number") {
        setHeight(Math.min(data.height + 20, 800));
        setError(null);
      } else if (data?.type === "error") {
        setError(data.message || "Rendering error");
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    // Send content to iframe after it loads
    const iframe = iframeRef.current;
    if (!iframe) return;

    const sendContent = () => {
      iframe.contentWindow?.postMessage(
        { type: "render", artifactType, content },
        SANDBOX_ORIGIN,
      );
    };

    iframe.addEventListener("load", sendContent);
    // Also try immediately in case already loaded
    sendContent();

    return () => iframe.removeEventListener("load", sendContent);
  }, [artifactType, content]);

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 p-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <p className="text-sm text-destructive">Sandbox error: {error}</p>
        </div>
      </div>
    );
  }

  const sandboxSrc = `${SANDBOX_ORIGIN}/sandbox.html`;

  return (
    <div className="overflow-hidden rounded-md border">
      <iframe
        ref={iframeRef}
        src={sandboxSrc}
        sandbox="allow-scripts allow-forms"
        style={{ width: "100%", height, border: "none" }}
        title={`${artifactType} artifact`}
      />
    </div>
  );
}
