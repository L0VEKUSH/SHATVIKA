'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error boundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="min-h-[40vh] flex items-center justify-center px-6">
          <div className="glass rounded-3xl border border-white/10 p-8 text-center max-w-md">
            <p className="text-4xl mb-3" aria-hidden>⚠️</p>
            <h2 className="text-xl font-black text-white mb-2">Something went wrong</h2>
            <p className="text-sm text-gray-400 mb-5">
              Please refresh the page. If the problem continues, contact support.
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="btn-flame px-6 py-3 text-sm font-bold"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
