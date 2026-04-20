/**
 * Best-effort JSON extraction from LLM output. Handles:
 *  - clean JSON
 *  - fenced ```json blocks
 *  - leading/trailing prose
 */
export function parseJsonLoose<T = unknown>(text: string): T {
  const trimmed = text.trim();

  // Strip markdown fence if present
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(trimmed);
  const candidate = fence ? fence[1].trim() : trimmed;

  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Fall through to regex extraction
  }

  // Try to find the first {...} or [...] block
  const objMatch = candidate.match(/\{[\s\S]*\}/);
  const arrMatch = candidate.match(/\[[\s\S]*\]/);
  const block = objMatch?.[0] ?? arrMatch?.[0];
  if (!block) {
    throw new Error(`Could not extract JSON from LLM output: ${text.slice(0, 200)}`);
  }
  return JSON.parse(block) as T;
}
