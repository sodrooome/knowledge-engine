/**
 * Content hashing utilities.
 *
 * We use SHA-256 for stable, collision-resistant identifiers.
 * Hashes serve two roles:
 * 1. Document identity — detect whether a file changed between indexer runs.
 * 2. Chunk identity — deduplicate chunks within and across documents.
 *
 * All functions here are pure: same input always produces the same hash,
 * making them trivial to test and reason about.
 */

import { createHash } from "node:crypto";

/**
 * Hashes a UTF-8 string with SHA-256 and returns the hex digest.
 *
 * @param content - The string to hash.
 * @returns 64-character lowercase hex string.
 *
 * @example
 * ```ts
 * hashString("hello") // "2cf24dba..."
 * ```
 */
export function hashString(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
