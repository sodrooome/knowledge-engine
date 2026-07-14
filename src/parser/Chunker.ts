/**
 * Chunker — splits parsed sections into embeddable chunks.
 *
 * Strategy:
 * - Walk each section in order.
 * - If a section's content fits within `maxChunkSize`, emit it as a single chunk.
 * - Otherwise, split it into overlapping windows of `maxChunkSize` characters
 *   with `overlap` characters of overlap between consecutive windows.
 *
 * Overlap ensures that semantic context near chunk boundaries isn't lost —
 * a sentence spanning the boundary will appear (at least partially) in both
 * chunks, so retrieval can still find it.
 *
 * The chunker is a pure function of its inputs: same sections + options
 * always produce the same chunks.
 */

import type { Chunk } from "../types/Chunk.js";
import type { Section } from "../types/IndexedDocument.js";
import { hashString } from "../utils/hash.js";

/** Configuration controlling how sections are split into chunks. */
export interface ChunkerOptions {
  /**
   * Maximum number of characters per chunk. Sections smaller than this are
   * emitted whole. Default: 1000.
   */
  readonly maxChunkSize?: number;
  /**
   * Number of overlapping characters between consecutive chunks when a section
   * must be split. Must be strictly less than `maxChunkSize`. Default: 200.
   */
  readonly overlap?: number;
}

/** Default chunk size in characters. */
const DEFAULT_MAX_CHUNK_SIZE = 1000;
/** Default overlap in characters. */
const DEFAULT_OVERLAP = 200;

/**
 * Normalizes and validates ChunkerOptions, applying defaults.
 *
 * @param options - User-provided options (may be partially specified).
 * @returns Validated options with defaults filled in.
 * @throws Error if overlap >= maxChunkSize, or any value is non-positive.
 */
function normalizeOptions(options: ChunkerOptions | undefined): {
  maxChunkSize: number;
  overlap: number;
} {
  const maxChunkSize = options?.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE;
  const overlap = options?.overlap ?? DEFAULT_OVERLAP;

  if (maxChunkSize <= 0) {
    throw new Error(`maxChunkSize must be positive, got ${maxChunkSize}`);
  }
  if (overlap < 0) {
    throw new Error(`overlap must be non-negative, got ${overlap}`);
  }
  if (overlap >= maxChunkSize) {
    throw new Error(
      `overlap (${overlap}) must be less than maxChunkSize (${maxChunkSize})`
    );
  }
  return { maxChunkSize, overlap };
}

/**
 * Splits a single section's content into overlapping character windows.
 *
 * When `content.length <= maxChunkSize`, returns the content as a single
 * window. Otherwise, slides a window of `maxChunkSize` characters by
 * `maxChunkSize - overlap` characters at a time, so consecutive windows
 * share `overlap` characters at the boundary.
 *
 * @param content - Text content to split.
 * @param maxChunkSize - Maximum characters per window.
 * @param overlap - Overlap characters between consecutive windows.
 * @returns Array of text windows.
 */
function splitWithOverlap(
  content: string,
  maxChunkSize: number,
  overlap: number
): string[] {
  if (content.length <= maxChunkSize) {
    return [content];
  }

  const windows: string[] = [];
  const step = maxChunkSize - overlap;
  // Step is guaranteed > 0 because overlap < maxChunkSize (validated upstream).

  for (let start = 0; start < content.length; start += step) {
    const end = Math.min(start + maxChunkSize, content.length);
    windows.push(content.slice(start, end));
    // If we've already reached the end of the content, stop — otherwise the
    // next `start += step` might still be < content.length and emit a tiny
    // trailing fragment.
    if (end === content.length) {
      break;
    }
  }
  return windows;
}

/**
 * Chunks a list of parsed sections into embeddable units.
 *
 * Each chunk carries:
 * - `id`: stable hash of the chunk text (for deduplication / identity).
 * - `documentId`: hash of the document this chunk came from.
 * - `sourcePath`: path of the origin file.
 * - `headingPath`: heading hierarchy of the section (preserved from parsing).
 * - `location`: approximate line range in the original document.
 * - `index`: position of this chunk among chunks from the same document.
 * - `text`: the slice of content to be embedded.
 *
 * Line numbers in `location` are approximate — since overlap splitting works
 * on characters rather than lines, the start line is the section's start line
 * plus an estimate based on character offset. For most retrieval use cases this
 * is sufficient; pinpoint line accuracy can be added later if needed.
 *
 * @param documentId - Hash of the parent document.
 * @param sourcePath - Path of the file being chunked.
 * @param sections - Parsed sections from parseMarkdown().
 * @param options - Optional chunking configuration.
 * @returns Ordered list of chunks.
 */
export function chunkSections(
  documentId: string,
  sourcePath: string,
  sections: readonly Section[],
  options?: ChunkerOptions
): Chunk[] {
  const { maxChunkSize, overlap } = normalizeOptions(options);
  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const windows = splitWithOverlap(
      section.content,
      maxChunkSize,
      overlap
    );

    for (const text of windows) {
      // Estimate line range. The section's startLine is exact; the end line
      // is approximated by counting newlines in the window.
      const newlinesInWindow = countOccurrences(text, "\n");
      const startLine = section.startLine;
      const endLine = startLine + newlinesInWindow + 1;

      chunks.push({
        id: hashString(text),
        documentId,
        sourcePath,
        headingPath: section.headingPath,
        location: { startLine, endLine },
        index: chunkIndex,
        text,
      });
      chunkIndex += 1;
    }
  }

  return chunks;
}

/**
 * Counts non-overlapping occurrences of a substring in a string.
 *
 * Used internally to estimate how many lines a character window spans.
 *
 * @param haystack - The string to search within.
 * @param needle - The substring to count.
 * @returns Number of occurrences.
 */
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  let count = 0;
  let from = 0;
  while (true) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) {
      break;
    }
    count += 1;
    from = idx + needle.length;
  }
  return count;
}