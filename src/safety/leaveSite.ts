/**
 * Leaves the tool by replacing the current history entry, so the browser's
 * back button does not return here. Kept in its own module so tests can
 * replace it (jsdom cannot navigate).
 */
export function leaveSite(url: string): void {
  window.location.replace(url);
}
