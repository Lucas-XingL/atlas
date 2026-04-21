/**
 * Decode a dynamic route `[slug]` parameter.
 *
 * Next.js doesn't consistently decode non-ASCII path params across runtimes,
 * so we defensively decodeURIComponent. Safe on already-decoded strings.
 */
export function decodeSlug(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}
