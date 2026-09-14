import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-center text-slate-100">
          <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 text-2xl font-bold">
              !
            </div>
            <h2 className="text-xl font-bold">Something went wrong</h2>
            <p className="mt-2 text-sm text-slate-400">
              {this.state.error?.message ||
                'An unexpected error occurred while loading this page.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="primary mt-6 w-full"
            >
              Reload Page
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
