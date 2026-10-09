import * as Sentry from "@sentry/react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Keep a decorative renderer failure from taking down the Chat/Feedback surface. */
export class AssistantMascotErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    Sentry.captureException(error, {
      tags: { component: "assistant-mascot-renderer" },
      contexts: { react: { componentStack: errorInfo.componentStack } },
    });
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
