/**
 * Utils module — barrel exports.
 *
 * Centralizes utility re-exports so callers can import from a single path:
 *
 * ```ts
 * import { hashString } from "../utils/index.js";
 * ```
 */

export { hashString } from "./hash.js";
export {
  splitFrontmatter,
  extractFrontmatter,
  type SplitResult,
} from "./frontmatter.js";
