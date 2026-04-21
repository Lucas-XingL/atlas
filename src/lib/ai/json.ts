/**
 * Best-effort JSON extraction from LLM output. Handles:
 *  - clean JSON
 *  - fenced ```json blocks
 *  - leading/trailing prose
 *  - trailing commas before ] or }
 *  - smart quotes (“ ” ‘ ’) swapped for "
 *  - missing commas between array items (common LLM mistake)
 */
export function parseJsonLoose<T = unknown>(text: string): T {
  const trimmed = text.trim();

  // Strip markdown fence if present
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(trimmed);
  const fenced = fence ? fence[1].trim() : trimmed;

  const attempts = [
    () => JSON.parse(fenced),
    () => JSON.parse(sanitize(fenced)),
    () => JSON.parse(sanitize(extractFirstBlock(fenced))),
  ];

  let lastErr: unknown;
  for (const attempt of attempts) {
    try {
      return attempt() as T;
    } catch (e) {
      lastErr = e;
    }
  }

  throw new Error(
    `Could not parse JSON from LLM output (${(lastErr as Error)?.message}). Sample: ${text.slice(0, 200)}`
  );
}

function extractFirstBlock(s: string): string {
  const obj = s.match(/\{[\s\S]*\}/);
  const arr = s.match(/\[[\s\S]*\]/);
  return obj?.[0] ?? arr?.[0] ?? s;
}

function sanitize(s: string): string {
  return s
    // Smart quotes → ASCII
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    // Remove trailing commas before } or ]
    .replace(/,(\s*[}\]])/g, "$1")
    // Insert missing commas between adjacent objects in arrays: `} {` or `}\n{`
    .replace(/}(\s*){/g, "},$1{")
    // Same for adjacent quoted strings: `" "` or `"\n"`
    .replace(/"(\s*\n\s*)"/g, '",$1"');
}
