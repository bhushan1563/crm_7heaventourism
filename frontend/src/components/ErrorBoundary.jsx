import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Catches render errors (and failed lazy-chunk loads after a new deploy) so a bug in one screen shows a
 * recoverable message instead of a blank white page.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI error:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Navigating to another screen clears the error.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    const isChunkError = /Loading chunk|dynamically imported module|Importing a module script failed/i.test(String(this.state.error?.message));

    return (
      <div className="error-boundary" role="alert">
        <div className="error-boundary-card glass-panel">
          <AlertTriangle size={36} color="#F59E0B" />
          <h2>{isChunkError ? 'A new version is available' : 'Something went wrong'}</h2>
          <p>
            {isChunkError
              ? 'The app was updated while this page was open. Reload to get the latest version.'
              : 'This screen hit an unexpected error. Your data is safe. Try again, or reload the page.'}
          </p>
          <div className="error-boundary-actions">
            {!isChunkError && (
              <button className="btn btn-outline" onClick={() => this.setState({ error: null })}>
                Try again
              </button>
            )}
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              <RefreshCw size={15} /> Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
