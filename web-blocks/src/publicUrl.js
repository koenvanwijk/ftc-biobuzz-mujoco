/**
 * Resolve a path under Vite's BASE_URL (works for GitHub Pages subpaths).
 * @param {string} path Absolute-from-site-root or relative public path
 */
export function publicUrl(path) {
  const base = import.meta.env.BASE_URL || '/';
  const cleaned = String(path || '').replace(/^\/+/, '');
  return base.endsWith('/') ? base + cleaned : base + '/' + cleaned;
}
