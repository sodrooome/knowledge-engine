/**
 * YAML frontmatter extraction.
 *
 * Obsidian markdown files commonly start with a YAML block delimited by `---`:
 *
 * ```
 * ---
 * title: My Note
 * tags: [systems, design]
 * ---
 *
 * # Body starts here
 * ```
 *
 * This module splits that frontmatter block from the body and parses the YAML
 * into a plain object. If a file has no frontmatter, the result is null.
 */

import { parse as parseYaml } from "yaml";
import type { Frontmatter } from "../types/IndexedDocument.js";

/** Delimiter that opens and closes a frontmatter block. */
const FRONTMATTER_DELIMITER = "---";

/**
 * Result of splitting a markdown file: the raw YAML block (if any) and the body.
 */
export interface SplitResult {
  /** Raw YAML text (including the delimiters), or null if no frontmatter. */
  readonly frontmatter: string | null;
  /** Body text with frontmatter (if any) removed. */
  readonly body: string;
}

/**
 * Splits raw markdown into the frontmatter block and the body.
 *
 * Frontmatter is only recognized if it appears at the very start of the file
 * (matching Obsidian's convention). A stray `---` later in the document is
 * treated as ordinary content.
 *
 * @param raw - The full markdown file as a string.
 * @returns The extracted frontmatter (or null) and the remaining body.
 */
export function splitFrontmatter(raw: string): SplitResult {
  // Frontmatter must be the very first thing in the file (no leading whitespace).
  if (!raw.startsWith(FRONTMATTER_DELIMITER)) {
    return { frontmatter: null, body: raw };
  }

  // The opening delimiter is on the first line. The closing delimiter is the
  // next line that is exactly "---". Anything in between is YAML.
  const lines = raw.split("\n");
  let closeIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === FRONTMATTER_DELIMITER) {
      closeIndex = i;
      break;
    }
  }

  // No closing delimiter means there's no valid frontmatter — treat the whole
  // file as body so the parser still sees all the content.
  if (closeIndex === -1) {
    return { frontmatter: null, body: raw };
  }

  const yamlLines = lines.slice(1, closeIndex);
  const frontmatter = yamlLines.join("\n");
  const body = lines
    .slice(closeIndex + 1)
    .join("\n")
    .replace(/^\n+/, "");

  return { frontmatter, body };
}

/**
 * Parses raw markdown and returns the frontmatter as an object plus the body.
 *
 * Convenience wrapper around `splitFrontmatter` + YAML parsing. If the YAML is
 * malformed, we throw — the caller is expected to handle that (e.g. log and
 * skip the file).
 *
 * @param raw - The full markdown file as a string.
 * @returns Parsed frontmatter (or null) and the body text.
 * @throws Error if the YAML block cannot be parsed.
 */
export function extractFrontmatter(raw: string): {
  frontmatter: Frontmatter | null;
  body: string;
} {
  const { frontmatter: yamlText, body } = splitFrontmatter(raw);

  if (yamlText === null) {
    return { frontmatter: null, body };
  }

  const parsed = parseYaml(yamlText);
  // An empty frontmatter block (`---\n---`) parses to null — normalize to an
  // empty object so downstream code never has to handle both null and {}.
  const frontmatter: Frontmatter =
    parsed === null || parsed === undefined ? {} : (parsed as Frontmatter);

  return { frontmatter, body };
}
