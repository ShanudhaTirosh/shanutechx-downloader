import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./Button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an unhandled rendering error:", error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="glass-panel p-8 text-center max-w-lg mx-auto my-12 border-status-danger/30">
          <div className="h-12 w-12 rounded-xl bg-status-danger/10 text-status-danger flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={24} />
          </div>
          <h2 className="text-base font-semibold text-zinc-100 mb-2">Display Error Caught</h2>
          <p className="text-xs text-zinc-400 mb-4 font-mono bg-surface-base/80 p-3 rounded border border-surface-border break-all">
            {this.state.error?.message || "An unexpected rendering error occurred."}
          </p>
          <div className="flex justify-center gap-3">
            <Button size="sm" variant="secondary" onClick={this.handleReset}>
              <RefreshCw size={14} /> Retry view
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
