/**
 * Sign-in redirects (email link, Google) come back to the site's front page, often in a new tab, so the page
 * someone was on — such as a tree link a relative sent them — is kept here until they are signed in.
 * Stored for an hour at most, and only paths on this site are used.
 */
const KEY = 'family-tree:return-url';
const MAX_AGE_MS = 60 * 60 * 1000;

export function saveReturnUrl(): void {
  const url = location.pathname + location.search;
  try {
    if (url === '/') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ url, at: Date.now() }));
  } catch { /* storage unavailable */ }
}

/** The saved page, once. */
export function takeReturnUrl(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    const { url, at } = JSON.parse(raw ?? 'null') ?? {};
    const fresh = typeof at === 'number' && Date.now() - at < MAX_AGE_MS;
    return fresh && typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : null;
  } catch {
    return null;
  }
}
