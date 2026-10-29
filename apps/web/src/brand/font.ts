/**
 * Load a Google Fonts family with a <link>. Not an @import in tokens.css: Tailwind's rules come
 * first in the bundle, and a late @import is invalid CSS the browser ignores.
 */
export function loadGoogleFont(family: string) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;500;600;700&display=swap`;
  document.head.append(link);
}
