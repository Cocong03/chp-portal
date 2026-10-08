import { Component, type ReactNode } from 'react'
import { go } from '@/lib/go'
import { Button } from '@/ui/button'

/**
 * Catches a section page that fails to render, typically a lazy chunk that no longer exists after a new build
 * was uploaded while the tab was open. Without it React unmounts the whole app and leaves a blank page.
 */
export class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-destructive-soft px-4 py-3 text-[13.5px] text-destructive"
      >
        <span>We couldn't load this page. Please reload.</span>
        <Button variant="outline" size="sm" onClick={() => go(window.location.href)}>
          Reload
        </Button>
      </div>
    )
  }
}
