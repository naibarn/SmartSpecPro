import { useState, useMemo } from "react";
import JsonView from "@uiw/react-json-view";
import { vscodeTheme } from "@uiw/react-json-view/vscode";
import { Button } from "@/components/ui/button";
import { Copy, Check, Moon, Sun, Maximize2, Minimize2, AlertCircle } from "lucide-react";

interface JSONViewerProps {
  jsonData: string;
  fileName?: string;
}

export default function JSONViewer({ jsonData, fileName }: JSONViewerProps) {
  const [copied, setCopied] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedJSON = useMemo(() => {
    try {
      setError(null);
      return JSON.parse(jsonData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
      return null;
    }
  }, [jsonData]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonData);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyFormatted = async () => {
    if (parsedJSON) {
      const formatted = JSON.stringify(parsedJSON, null, 2);
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (error) {
    return (
      <div className="space-y-3 rounded-xl border bg-slate-50 p-4">
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-red-800">JSON Parsing Error</p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>

        {/* Show raw text as fallback */}
        <div>
          <div className="flex items-center justify-between border-b bg-white px-3 py-2 mb-2">
            <span className="text-xs font-medium text-muted-foreground">Raw Content</span>
            <Button size="sm" variant="ghost" onClick={handleCopy} className="h-7 text-xs">
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
          <pre className="max-h-[60vh] overflow-auto rounded-lg border bg-slate-900 p-3 text-xs text-slate-100 font-mono">
            {jsonData}
          </pre>
        </div>
      </div>
    );
  }

  if (!parsedJSON) {
    return (
      <div className="rounded-xl border bg-slate-50 p-4 text-center text-sm text-muted-foreground">
        No JSON data to display
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border bg-slate-50 dark:bg-slate-900 shadow-inner">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b bg-white dark:bg-slate-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="font-mono text-xs">
            JSON
          </Badge>
          {fileName && (
            <span className="text-xs text-muted-foreground font-mono">{fileName}</span>
          )}
          <span className="text-xs text-muted-foreground">
            {Object.keys(parsedJSON).length} top-level keys
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 text-xs"
          >
            {isExpanded ? (
              <>
                <Minimize2 className="mr-1 h-3 w-3" />
                Collapse All
              </>
            ) : (
              <>
                <Maximize2 className="mr-1 h-3 w-3" />
                Expand All
              </>
            )}
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
            onClick={handleCopyFormatted}
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

      {/* JSON Tree View */}
      <div className="max-h-[70vh] overflow-auto p-3">
        <JsonView
          value={parsedJSON}
          collapsed={isExpanded ? false : 3}
          displayDataTypes={false}
          displayObjectSize={true}
          enableClipboard={false}
          style={isDarkMode ? vscodeTheme : undefined}
        />
      </div>
    </div>
  );
}

function Badge({ children, variant, className }: { children: React.ReactNode; variant?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-slate-100 text-slate-700 ${className}`}>
      {children}
    </span>
  );
}
