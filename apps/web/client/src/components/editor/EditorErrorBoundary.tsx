import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  onSwitchToSource?: () => void;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class EditorErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || "Unknown error",
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[Editor] Rendering error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center gap-4 p-8 text-center"
          data-testid="editor-error-boundary"
        >
          <div className="text-destructive font-medium">
            Editor encountered an error
          </div>
          <p className="text-sm text-muted-foreground max-w-md">
            The rich-text editor failed to render. You can switch to Source Mode
            to safely view and edit the raw markdown.
          </p>
          {this.props.onSwitchToSource && (
            <button
              type="button"
              className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={this.props.onSwitchToSource}
            >
              Switch to Source Mode
            </button>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
