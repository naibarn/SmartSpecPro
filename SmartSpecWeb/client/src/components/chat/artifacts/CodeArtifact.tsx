import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Check,
  Download,
  Maximize2,
  Minimize2,
  Code2,
  FileCode,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeArtifactProps {
  code: string;
  language?: string;
  title?: string;
  fileName?: string;
  showLineNumbers?: boolean;
  maxHeight?: string;
  className?: string;
}

// Language display names and file extensions
const languageConfig: Record<string, { name: string; ext: string }> = {
  javascript: { name: "JavaScript", ext: ".js" },
  typescript: { name: "TypeScript", ext: ".ts" },
  jsx: { name: "JSX", ext: ".jsx" },
  tsx: { name: "TSX", ext: ".tsx" },
  python: { name: "Python", ext: ".py" },
  java: { name: "Java", ext: ".java" },
  csharp: { name: "C#", ext: ".cs" },
  cpp: { name: "C++", ext: ".cpp" },
  c: { name: "C", ext: ".c" },
  go: { name: "Go", ext: ".go" },
  rust: { name: "Rust", ext: ".rs" },
  ruby: { name: "Ruby", ext: ".rb" },
  php: { name: "PHP", ext: ".php" },
  swift: { name: "Swift", ext: ".swift" },
  kotlin: { name: "Kotlin", ext: ".kt" },
  html: { name: "HTML", ext: ".html" },
  css: { name: "CSS", ext: ".css" },
  scss: { name: "SCSS", ext: ".scss" },
  json: { name: "JSON", ext: ".json" },
  yaml: { name: "YAML", ext: ".yaml" },
  xml: { name: "XML", ext: ".xml" },
  markdown: { name: "Markdown", ext: ".md" },
  sql: { name: "SQL", ext: ".sql" },
  bash: { name: "Bash", ext: ".sh" },
  shell: { name: "Shell", ext: ".sh" },
  powershell: { name: "PowerShell", ext: ".ps1" },
  dockerfile: { name: "Dockerfile", ext: "" },
  plaintext: { name: "Plain Text", ext: ".txt" },
};

export function CodeArtifact({
  code,
  language = "plaintext",
  title,
  fileName,
  showLineNumbers = true,
  maxHeight = "400px",
  className,
}: CodeArtifactProps) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const lines = code.split("\n");
  const langConfig = languageConfig[language.toLowerCase()] || { name: language, ext: ".txt" };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || `code${langConfig.ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-muted/30", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-muted-foreground" />
          {title ? (
            <span className="text-sm font-medium">{title}</span>
          ) : fileName ? (
            <span className="text-sm font-medium">{fileName}</span>
          ) : (
            <Badge variant="secondary" className="text-xs">
              {langConfig.name}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 w-7"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            className="h-7 w-7"
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            className="h-7 w-7"
            title={copied ? "Copied!" : "Copy"}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Code content */}
      <div
        className={cn(
          "overflow-auto bg-[#1e1e1e] p-0 font-mono text-sm",
          !isExpanded && "max-h-[var(--max-height)]"
        )}
        style={{ "--max-height": maxHeight } as React.CSSProperties}
      >
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, index) => (
              <tr
                key={index}
                className="hover:bg-white/5"
              >
                {showLineNumbers && (
                  <td className="select-none border-r border-white/10 px-3 py-0.5 text-right text-xs text-gray-500">
                    {index + 1}
                  </td>
                )}
                <td className="whitespace-pre px-4 py-0.5 text-gray-300">
                  <HighlightedLine line={line} language={language} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer with line count */}
      <div className="border-t bg-muted/50 px-3 py-1.5">
        <span className="text-xs text-muted-foreground">
          {lines.length} line{lines.length !== 1 ? "s" : ""}
          {language !== "plaintext" && ` • ${langConfig.name}`}
        </span>
      </div>
    </div>
  );
}

// HTML escape function to prevent XSS
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}

// Simple syntax highlighting (basic implementation)
function HighlightedLine({ line, language }: { line: string; language: string }) {
  // Basic keyword highlighting for common languages
  const keywords: Record<string, string[]> = {
    javascript: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "import", "export", "from", "async", "await", "try", "catch", "throw", "new", "this", "true", "false", "null", "undefined"],
    typescript: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "import", "export", "from", "async", "await", "try", "catch", "throw", "new", "this", "true", "false", "null", "undefined", "interface", "type", "enum", "implements", "extends", "public", "private", "protected", "readonly"],
    python: ["def", "class", "return", "if", "else", "elif", "for", "while", "import", "from", "as", "try", "except", "raise", "with", "True", "False", "None", "and", "or", "not", "in", "is", "lambda", "yield", "async", "await"],
    java: ["public", "private", "protected", "class", "interface", "extends", "implements", "return", "if", "else", "for", "while", "new", "this", "super", "static", "final", "void", "int", "boolean", "String", "true", "false", "null", "try", "catch", "throw", "throws"],
    go: ["func", "return", "if", "else", "for", "range", "switch", "case", "default", "package", "import", "var", "const", "type", "struct", "interface", "map", "chan", "go", "defer", "true", "false", "nil"],
    rust: ["fn", "let", "mut", "const", "if", "else", "for", "while", "loop", "match", "return", "struct", "enum", "impl", "trait", "pub", "use", "mod", "self", "true", "false", "Some", "None", "Ok", "Err"],
  };

  const langKeywords = keywords[language.toLowerCase()] || keywords.javascript || [];

  // IMPORTANT: Escape HTML first to prevent XSS attacks
  // This must happen BEFORE any regex replacements that add HTML tags
  let result = escapeHtml(line);

  // Highlight strings
  result = result.replace(
    /(["'`])(?:(?!\1)[^\\]|\\.)*\1/g,
    '<span class="text-green-400">$&</span>'
  );

  // Highlight comments (single line)
  result = result.replace(
    /(\/\/.*$|#.*$)/g,
    '<span class="text-gray-500 italic">$&</span>'
  );

  // Highlight numbers
  result = result.replace(
    /\b(\d+\.?\d*)\b/g,
    '<span class="text-orange-400">$1</span>'
  );

  // Highlight keywords
  for (const keyword of langKeywords) {
    const regex = new RegExp(`\\b(${keyword})\\b`, "g");
    result = result.replace(
      regex,
      '<span class="text-purple-400 font-medium">$1</span>'
    );
  }

  // Highlight function calls
  result = result.replace(
    /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,
    '<span class="text-blue-400">$1</span>('
  );

  return <span dangerouslySetInnerHTML={{ __html: result }} />;
}

// Export a simpler inline code component
export function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
      {children}
    </code>
  );
}
