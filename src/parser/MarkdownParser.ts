/**
 * Heading-aware markdown parser.
 *
 * Converts a raw markdown string (with frontmatter already stripped) into a
 * list of Sections. Each Section corresponds to a single heading and contains
 * all the content beneath it until the next heading at the same or higher level.
 *
 * Approach (Option A — line-based, no AST library):
 * - Recognizes ATX headings only (`#`, `##`, ... up to `######`).
 * - Setext headings (`text\n===`) are NOT supported — Obsidian predominantly
 *   uses ATX, and we accept this trade-off for simplicity.
 * - Code fences (``` ... ```) are respected so a `#` inside a code block is
 *   not mistaken for a heading.
 *
 * The parser is a pure function: same input always yields the same sections.
 */

import type { Section } from "../types/IndexedDocument.js";

/** Regex matching an ATX heading, e.g. "## My Heading". */
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*$/;

/** Detects start/end of a fenced code block (``` or ~~~). */
const FENCE_RE = /^(`{3,}|~{3,})/;

/** An entry in the heading stack tracking level + text. */
interface StackEntry {
  readonly level: number;
  readonly text: string;
}

/**
 * Attempts to match a line as an ATX heading.
 *
 * Returns null if the line is not a heading, or if we are inside a fenced
 * code block (so `#` inside code is not mistaken for a heading).
 *
 * @param line - A single line of markdown.
 * @param inFence - Whether we are currently inside a code fence.
 * @returns Matched level and text, or null.
 */
function matchHeading(
  line: string,
  inFence: boolean
): { level: number; text: string } | null {
  if (inFence) {
    return null;
  }
  const m = HEADING_RE.exec(line);
  if (m === null) {
    return null;
  }
  // m[1] is the run of `#` characters; its length is the heading level.
  // m[2] is the heading text (already trimmed by the regex).
  return { level: m[1].length, text: m[2] };
}

/**
 * Detects whether a line opens or closes a fenced code block.
 *
 * Returns the fence marker string (e.g. "```") if the line starts/ends a fence,
 * or null if the line is normal content. A line that matches while we are
 * already inside a fence closes it; otherwise it opens one.
 *
 * @param line - A single line of markdown.
 * @param currentFence - The open fence marker, or null if not in a fence.
 * @returns Updated fence marker (null means we are outside any fence).
 */
function updateFence(
  line: string,
  currentFence: string | null
): string | null {
  const m = FENCE_RE.exec(line);
  if (m === null) {
    return currentFence;
  }
  const marker = m[1];
  // If we're inside a fence, only a matching marker closes it.
  if (currentFence !== null && marker.startsWith(currentFence)) {
    return null;
  }
  // Otherwise this line opens a new fence (only if we weren't in one).
  if (currentFence === null) {
    return marker;
  }
  return currentFence;
}

/**
 * Updates the heading stack when a new heading is encountered.
 *
 * Pops any entries whose level is >= the new heading's level (siblings or
 * deeper), then pushes the new heading. The resulting stack is the chain
 * of ancestor headings plus the current heading.
 *
 * @param stack - Current heading stack (mutated in place).
 * @param entry - The new heading to insert.
 */
function pushHeading(stack: StackEntry[], entry: StackEntry): void {
  // Drop any headings at the same level or deeper — they are siblings or
  // children of a previous sibling, not ancestors of this heading.
  while (stack.length > 0 && stack[stack.length - 1].level >= entry.level) {
    stack.pop();
  }
  stack.push(entry);
}

/**
 * Parses body text (frontmatter already removed) into sections.
 *
 * Each section's `content` runs from the heading line to (but not including)
 * the next heading. Sub-headings are included verbatim in the parent
 * section's content; the chunker can split them further if needed.
 *
 * A "preamble" section (level 0, empty headingPath) is emitted if the file
 * has content before its first heading.
 *
 * @param body - Markdown body text after frontmatter removal.
 * @returns Ordered list of sections.
 */
export function parseMarkdown(body: string): Section[] {
  const lines = body.split("\n");
  const sections: Section[] = [];
  const headingStack: StackEntry[] = [];

  let currentFence: string | null = null;
  // `null` means we are not currently accumulating a section.
  let currentHeadingPath: string[] | null = null;
  let currentLevel = 0;
  let currentStartLine = 0;
  let currentLines: string[] = [];

  /**
   * Flushes the accumulated section, if any, into the sections array.
   * `endLine` is the line index where we stopped accumulating (exclusive).
   */
  function flush(endLine: number): void {
    if (currentHeadingPath === null) {
      return;
    }
    const content = currentLines.join("\n").replace(/\n+$/, "");
    if (content === "") {
      currentHeadingPath = null;
      currentLines = [];
      return;
    }
    sections.push({
      headingPath: currentHeadingPath,
      level: currentLevel,
      startLine: currentStartLine,
      endLine,
      content,
    });
    currentHeadingPath = null;
    currentLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevFence = currentFence;
    currentFence = updateFence(line, currentFence);

    // Only treat a line as a heading if we were NOT in a fence before
    // processing this line (i.e. the line itself does not close a fence).
    const wasInFence = prevFence !== null;
    const heading = wasInFence ? null : matchHeading(line, currentFence !== null);

    if (heading !== null) {
      // Start a new section: flush the previous one first.
      flush(i);
      pushHeading(headingStack, heading);
      currentHeadingPath = headingStack.map((e) => e.text);
      currentLevel = heading.level;
      currentStartLine = i;
      currentLines = [line];
    } else if (currentHeadingPath !== null) {
      // Inside a section — keep accumulating lines.
      currentLines.push(line);
    } else {
      // No section yet. If this line has real content, start a preamble
      // section (level 0, empty heading path).
      if (line.trim() !== "") {
        currentHeadingPath = [];
        currentLevel = 0;
        currentStartLine = i;
        currentLines = [line];
      }
    }
  }

  // Flush the final section.
  flush(lines.length);

  return sections;
}