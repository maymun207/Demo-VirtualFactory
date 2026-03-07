/**
 * SceneErrorBoundary.tsx — WebGL Error Boundary
 *
 * A React class component error boundary that wraps the 3D <Canvas>.
 * Catches runtime errors from Three.js, WebGL context loss, shader
 * compilation failures, and font loading issues—preventing full-app crashes.
 *
 * When an error is caught:
 *  - Renders a user-friendly error screen with the error message
 *  - Provides a "Retry" button that resets the boundary and re-mounts the canvas
 *  - Logs the full error + component stack to console for debugging
 *
 * This is the only class component in the project (React error boundaries
 * require class components—there is no hooks equivalent).
 *
 * Used by: Scene.tsx
 */
import { Component, type ReactNode } from "react";
import { createLogger } from "../../lib/logger";

/** Module-level logger for WebGL scene error boundary. */
const log = createLogger("SceneError");

/** Props for SceneErrorBoundary */
interface Props {
  /** The 3D scene tree to protect */
  children: ReactNode;
}

/** Internal state for the error boundary */
interface State {
  /** Whether an error has been caught */
  hasError: boolean;
  /** The caught error's message string */
  errorMessage: string;
}

export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    log.error("Caught error:", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white gap-4 p-8">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-lg font-bold text-red-400">3D Scene Error</h2>
          <p className="text-sm text-white/60 text-center max-w-md">
            The WebGL renderer encountered an error. This may be caused by GPU
            resource limits or shader compilation failure.
          </p>
          <code className="text-xs text-white/40 bg-white/5 px-3 py-1.5 rounded-lg max-w-md truncate">
            {this.state.errorMessage}
          </code>
          <button
            onClick={this.handleRetry}
            className="mt-2 px-6 py-2 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-sm font-medium hover:bg-emerald-500/30 transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
