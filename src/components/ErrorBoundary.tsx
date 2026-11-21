import React from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onReset?: () => void;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = error instanceof Error ? error.message : String(error || 'Unexpected UI error');
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('PRO RIDER UI Boundary caught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-[#0D0D10] text-white flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#16171C] border border-[#D4A017]/40 p-6 sm:p-8 space-y-5 shadow-2xl text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#D4A017]/15 border border-[#D4A017]/40 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7 text-[#D4A017]" />
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-xl font-bold text-white">PRO RIDER AI — Session Recovery</h1>
              <p className="text-xs text-zinc-400 leading-relaxed">
                سکرین لوڈ کرتے وقت عارضی خرابی آئی ہے۔ براہِ کرم نیچے بٹن سے دوبارہ لوڈ کریں۔
              </p>
              {this.state.errorMessage && (
                <p className="text-[11px] font-mono text-amber-300 bg-black/40 border border-zinc-800 rounded-xl px-3 py-2 break-words">
                  {this.state.errorMessage.slice(0, 180)}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, errorMessage: '' });
                  this.props.onReset?.();
                  window.location.reload();
                }}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-[#EAB308]"
              >
                <RefreshCw className="w-4 h-4" />
                Reload App
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem('pr_token_passenger');
                    localStorage.removeItem('pr_user_passenger');
                    localStorage.removeItem('pr_token_partner');
                    localStorage.removeItem('pr_user_partner');
                    localStorage.removeItem('pr_profile_partner');
                  } catch {
                    // ignore
                  }
                  window.location.href = '/';
                }}
                className="flex items-center justify-center gap-2 py-3 rounded-xl border border-zinc-700 text-zinc-200 text-xs font-semibold hover:bg-zinc-800"
              >
                <Home className="w-4 h-4" />
                Back Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
