import { Component, type ErrorInfo, type ReactNode } from 'react'

interface SidebarErrorBoundaryProps {
  children: ReactNode
  /** Shown when the sidebar tree throws; editor mount stays outside this boundary. */
  fallback?: ReactNode
}

interface SidebarErrorBoundaryState {
  error: Error | null
}

/**
 * Isolate sidebar React failures so the editor mount is not unmounted.
 */
export class SidebarErrorBoundary extends Component<
  SidebarErrorBoundaryProps,
  SidebarErrorBoundaryState
> {
  state: SidebarErrorBoundaryState = { error: null }

  /**
   * Capture render/commit errors into local state.
   *
   * @param error - Thrown error.
   * @returns Next state.
   */
  static getDerivedStateFromError(error: Error): SidebarErrorBoundaryState {
    return { error }
  }

  /**
   * Log sidebar crashes for diagnostics.
   *
   * @param error - Thrown error.
   * @param info - React component stack.
   */
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Editor sidebar crashed', error, info.componentStack)
  }

  /**
   * Render children or the fallback UI.
   *
   * @returns Tree to display.
   */
  render(): ReactNode {
    if (this.state.error) {
      return this.props.fallback ?? null
    }
    return this.props.children
  }
}
