"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: "blackout" | "message";
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback === "blackout") {
      return <div className="w-full h-full bg-black" />;
    }

    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-900 text-white gap-4">
        <p className="text-xl font-semibold text-red-400">오류가 발생했습니다</p>
        <p className="text-sm text-zinc-500 max-w-sm text-center">
          {this.state.error?.message ?? "알 수 없는 오류"}
        </p>
        <button
          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
          onClick={() => window.location.reload()}
        >
          새로고침
        </button>
      </div>
    );
  }
}
