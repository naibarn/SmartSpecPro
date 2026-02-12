import { useState, useEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus, vs } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/button";
import { Copy, Check, Moon, Sun } from "lucide-react";

interface CodeViewerProps {
  code: string;
  language: string;
  fileName?: string;
}

const LANGUAGE_MAP: Record<string, string> = {
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  py: "python",
  rb: "ruby",
  java: "java",
  cpp: "cpp",
  c: "c",
  cs: "csharp",
  go: "go",
  rs: "rust",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  scala: "scala",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yml: "yaml",
  yaml: "yaml",
  json: "json",
  xml: "xml",
  html: "markup",
  htm: "markup",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  md: "markdown",
  markdown: "markdown",
  dockerfile: "docker",
  makefile: "makefile",
  r: "r",
  matlab: "matlab",
  lua: "lua",
  perl: "perl",
  dart: "dart",
  graphql: "graphql",
  toml: "toml",
  ini: "ini",
  diff: "diff",
  git: "git",
};

function detectLanguageFromExtension(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  return LANGUAGE_MAP[ext] || "text";
}

export default function CodeViewer({ code, language, fileName }: CodeViewerProps) {
  const [copied, setCopied] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [lineNumbers, setLineNumbers] = useState(true);

  const detectedLanguage = fileName ? detectLanguageFromExtension(fileName) : language;
  const displayLanguage = detectedLanguage || "text";

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
  };

  return (
    <div className="space-y-2 rounded-xl border bg-slate-50 dark:bg-slate-900 shadow-inner">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b bg-white dark:bg-slate-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="font-mono text-xs">
            {displayLanguage.toUpperCase()}
          </Badge>
          {fileName && (
            <span className="text-xs text-muted-foreground font-mono">{fileName}</span>
          )}
          <span className="text-xs text-muted-foreground">
            {code.split("\n").length} lines
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setLineNumbers(!lineNumbers)}
            className="h-7 text-xs"
          >
            {lineNumbers ? "Hide" : "Show"} Lines
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="h-7 w-7 p-0"
          >
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            className="h-7 text-xs"
          >
            {copied ? (
              <>
                <Check className="mr-1 h-3 w-3" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-1 h-3 w-3" />
                Copy
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Code Display */}
      <div className="max-h-[70vh] overflow-auto">
        <SyntaxHighlighter
          language={displayLanguage}
          style={isDarkMode ? vscDarkPlus : vs}
          showLineNumbers={lineNumbers}
          wrapLines
          customStyle={{
            margin: 0,
            borderRadius: "0 0 0.75rem 0.75rem",
            fontSize: "0.875rem",
            lineHeight: "1.5",
          }}
          codeTagProps={{
            style: {
              fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
            },
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

function Badge({ children, variant, className }: { children: React.ReactNode; variant?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}
