// ─────────────────────────────────────────────────────────────────────────────
// Shared utilities for agent handlers
// ─────────────────────────────────────────────────────────────────────────────

// Headers that must not be forwarded upstream (hop-by-hop per RFC 7230)
export const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade', 'proxy-connection',
]);

/**
 * Filter and normalize incoming request headers for upstream forwarding.
 * Strips hop-by-hop headers and the Host header (caller sets the correct one).
 */
export function filterHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lk = key.toLowerCase();
    if (HOP_BY_HOP.has(lk)) continue;
    if (lk === 'host') continue;
    if (value === undefined) continue;
    result[lk] = Array.isArray(value) ? value.join(', ') : value;
  }
  return result;
}
