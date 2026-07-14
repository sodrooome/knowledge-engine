/**
 * Parser module — barrel exports.
 *
 * Re-exports the public API of the parser package so callers can import from
 * a single entry point:
 *
 * ```ts
 * import { parseMarkdown, chunkSections } from "./parser/index.js";
 * ```
 */

export { parseMarkdown } from "./MarkdownParser.js";
export {
  chunkSections,
  type ChunkerOptions,
} from "./Chunker.js";