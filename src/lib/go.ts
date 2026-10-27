/** Full-page navigation, in its own module so tests can mock it (jsdom can't navigate). */
export function go(url: string): void {
  window.location.assign(url)
}
