import * as Sentry from "@sentry/react";
import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const CHUNK_RELOAD_MARKER = "__smartspec_chunk_reload_at__";
const CHUNK_RELOAD_WINDOW_MS = 30_000;
const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading chunk [\w-]+ failed/i,
  /ChunkLoadError/i,
];

function isChunkLoadError(error: Error): boolean {
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(error.message));
}

function reloadForChunkError(): boolean {
  const lastReloadAtRaw = sessionStorage.getItem(CHUNK_RELOAD_MARKER);
  const lastReloadAt = lastReloadAtRaw ? Number(lastReloadAtRaw) : 0;
  const now = Date.now();
  if (Number.isFinite(lastReloadAt) && now - lastReloadAt < CHUNK_RELOAD_WINDOW_MS) {
    return false;
  }

  sessionStorage.setItem(CHUNK_RELOAD_MARKER, String(now));
  window.location.reload();
  return true;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    if (isChunkLoadError(error) && reloadForChunkError()) {
      // Return hasError: false so the blank screen is not shown while reloading
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack } },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">An unexpected error occurred.</h2>

            {import.meta.env.DEV && this.state.error?.stack && (
              <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
                <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                  {this.state.error.stack}
                </pre>
              </div>
            )}

            <button
              onClick={() => {
                sessionStorage.removeItem(CHUNK_RELOAD_MARKER);
                sessionStorage.removeItem("chunk_reload_attempted");
                window.location.reload();
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
