import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Top-level error boundary. Catches uncaught render errors and shows a
 * graceful fallback instead of a white screen. Added in Prompt 13 (pre-demo polish).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] Uncaught error:", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-surface border border-border rounded-lg p-6 space-y-4">
            <h1 className="text-lg font-semibold text-foreground">
              Something went wrong
            </h1>
            <p className="text-sm text-foreground-muted">
              An unexpected error occurred while rendering this page. Try refreshing
              to recover. If the problem persists, contact your administrator.
            </p>
            {this.state.error?.message && (
              <pre className="text-xs text-foreground-muted bg-elevated rounded p-2 overflow-x-auto max-h-32">
                {this.state.error.message}
              </pre>
            )}
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full px-4 py-2 rounded-md bg-accent text-background text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Refresh page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
