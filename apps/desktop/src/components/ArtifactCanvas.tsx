import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

type AttachmentLike = {
  kind: "image" | "video" | "file";
  name: string;
  mime: string;
  url: string;
};

type ArtifactCanvasProps = {
  attachment: AttachmentLike;
};

type ArtifactKind =
  | "image"
  | "video"
  | "markdown"
  | "code"
  | "text"
  | "file";

const CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "cs",
  "cpp",
  "c",
  "h",
  "hpp",
  "swift",
  "php",
  "scala",
  "sh",
  "bash",
  "zsh",
  "json",
  "yml",
  "yaml",
  "toml",
  "sql",
  "mdx",
  "html",
  "css",
]);

const EXT_LANG_MAP: Record<string, string> = {
  ts: "ts",
  tsx: "tsx",
  js: "js",
  jsx: "jsx",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  cs: "csharp",
  cpp: "cpp",
  c: "c",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  html: "html",
  css: "css",
  mdx: "mdx",
};

function detectArtifactKind(att: AttachmentLike): ArtifactKind {
  const mime = (att.mime || "").toLowerCase();
  const name = (att.name || "").toLowerCase();
  const ext = name.split(".").pop() || "";

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";

  if (mime === "text/markdown" || name.endsWith(".md")) {
    return "markdown";
  }

  if (mime.startsWith("text/")) {
    if (CODE_EXTENSIONS.has(ext)) return "code";
    return "text";
  }

  if (CODE_EXTENSIONS.has(ext)) {
    return "code";
  }

  return "file";
}

function getLanguageFromFilename(filename: string): string | undefined {
  const ext = (filename.toLowerCase().split(".").pop() || "") as string;
  return EXT_LANG_MAP[ext];
}

type ViewMode = "rendered" | "raw";

const MAX_PREVIEW_CHARS = 200_000;

export function ArtifactCanvas({ attachment }: ArtifactCanvasProps) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("rendered");
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const kind = useMemo(() => detectArtifactKind(attachment), [attachment]);
  const language = useMemo(
    () => getLanguageFromFilename(attachment.name),
    [attachment.name],
  );

  const onCopy = async () => {
    if (!textContent) return;
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (kind === "markdown" || kind === "code" || kind === "text") {
      let cancelled = false;
      setLoading(true);
      setFetchError(null);

      fetch(attachment.url)
        .then((res) => {
          if (!res.ok) {
            throw new Error(`Failed to fetch file: ${res.status}`);
          }
          return res.text();
        })
        .then((txt) => {
          if (!cancelled) {
            const tooLong = txt.length > MAX_PREVIEW_CHARS;
            const slice = tooLong ? txt.slice(0, MAX_PREVIEW_CHARS) : txt;
            setTextContent(slice);
            setTruncated(tooLong);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setFetchError(err.message || "Failed to load file");
            setLoading(false);
          }
        });

      return () => {
        cancelled = true;
      };
    }
  }, [attachment.url, kind]);

  const renderBody = () => {
    if (kind === "image") {
      return (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="cursor-zoom-in"
          >
            <img
              src={attachment.url}
              alt={attachment.name}
              className="max-h-72 rounded-lg border border-gray-200 dark:border-gray-700 object-contain"
            />
          </button>
        </div>
      );
    }

    if (kind === "video") {
      return (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="block w-full cursor-pointer"
          >
            <video
              src={attachment.url}
              controls
              className="max-h-72 rounded-lg border border-gray-200 dark:border-gray-700"
            />
          </button>
        </div>
      );
    }

    if (kind === "file" && !textContent && !loading && !fetchError) {
      return (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          No inline preview available for this file type.
        </div>
      );
    }

    if (loading) {
      return (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Loading preview...
        </div>
      );
    }

    if (fetchError) {
      return (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400">
          {fetchError}
        </div>
      );
    }

    if (!textContent) {
      return null;
    }

    if (kind === "markdown" || kind === "code") {
      const renderedContent =
        kind === "markdown"
          ? textContent
          : "```" + (language || "") + "\n" + textContent + "\n```";

      return (
        <div className="mt-2 flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 justify-between">
            <div className="inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/70 p-1 text-[11px]">
              <button
                type="button"
                onClick={() => setViewMode("rendered")}
                className={
                  "px-2 py-0.5 rounded-full " +
                  (viewMode === "rendered"
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                    : "text-gray-600 dark:text-gray-300")
                }
              >
                Rendered
              </button>
              <button
                type="button"
                onClick={() => setViewMode("raw")}
                className={
                  "px-2 py-0.5 rounded-full " +
                  (viewMode === "raw"
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                    : "text-gray-600 dark:text-gray-300")
                }
              >
                Raw
              </button>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={onCopy}
                className="px-2 py-0.5 rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              {truncated && (
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  Preview truncated. Download to see full file.
                </span>
              )}
            </div>
          </div>
          {viewMode === "rendered" ? (
            <div className="prose prose-sm dark:prose-invert max-w-none max-h-80 overflow-auto border border-gray-100 dark:border-gray-800 rounded-lg p-3 bg-white/80 dark:bg-gray-900/60">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  a: (props) => (
                    <a {...props} target="_blank" rel="noreferrer noopener" />
                  ),
                }}
              >
                {renderedContent}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="max-h-80 overflow-auto border border-gray-100 dark:border-gray-800 rounded-lg bg-gray-950/95">
              <pre className="text-xs text-gray-100 whitespace-pre font-mono p-3">
                {textContent}
              </pre>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="mt-2 max-h-80 overflow-auto border border-gray-100 dark:border-gray-800 rounded-lg bg-white/80 dark:bg-gray-900/60">
        <div className="flex items-center justify-between px-3 pt-2 text-[11px]">
          <button
            type="button"
            onClick={onCopy}
            className="px-2 py-0.5 rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          {truncated && (
            <span className="text-[10px] text-gray-500 dark:text-gray-400">
              Preview truncated. Download to see full file.
            </span>
          )}
        </div>
        <pre className="text-xs text-gray-900 dark:text-gray-100 whitespace-pre-wrap font-mono p-3">
          {textContent}
        </pre>
      </div>
    );
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-900 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <div className="text-xs font-mono text-gray-900 dark:text-gray-100 truncate">
            {attachment.name}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
            {attachment.mime || "unknown"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-gray-200 dark:border-gray-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-600 dark:text-gray-300">
            {kind}
          </span>
          <a
            href={attachment.url}
            download={attachment.name}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Download
          </a>
        </div>
      </div>

      {renderBody()}

      {lightboxOpen && (kind === "image" || kind === "video") && (
        <div className="fixed inset-0 z-[100] bg-black/75 flex items-center justify-center">
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 text-white text-xl"
            aria-label="Close"
          >
            ×
          </button>
          <div className="max-w-[90vw] max-h-[90vh] flex items-center justify-center">
            {kind === "image" ? (
              <img
                src={attachment.url}
                alt={attachment.name}
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-xl"
              />
            ) : (
              <video
                src={attachment.url}
                controls
                autoPlay
                className="max-w-full max-h-[90vh] rounded-lg shadow-xl"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
