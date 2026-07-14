/**
 * Chunk type — the atomic unit that gets embedded and stored in the vector DB.
 *
 * A Chunk is a contiguous slice of text sourced from a single document.
 * Chunks carry enough metadata to trace back to the origin document and
 * the specific section/position they came from, so retrieval results can
 * point the user to the right note.
 */

/** Source location of a chunk inside its parent document. */
export interface ChunkLocation {
  /** Zero-based line number in the original markdown file where this chunk starts. */
  readonly startLine: number;
  /** Zero-based line number where this chunk ends (exclusive). */
  readonly endLine: number;
}

/**
 * A chunk of text extracted from a document, ready for embedding.
 *
 * `documentId` and `location` together form a stable pointer back to the
 * source text, so retrieved chunks can be cited or opened in the editor.
 */
export interface Chunk {
  /** SHA-256 hash of the chunk text — used for deduplication and identity. */
  readonly id: string;
  /** The document this chunk came from (hash of the original file content). */
  readonly documentId: string;
  /** Path or identifier of the source file, e.g. "notes/systems.md". */
  readonly sourcePath: string;
  /** Heading path of the section this chunk belongs to, e.g. ["Design", " tradeoffs"]. */
  readonly headingPath: readonly string[];
  /** Position of this chunk inside the original document. */
  readonly location: ChunkLocation;
  /** Index of this chunk among all chunks produced from the same document (0-based). */
  readonly index: number;
  /** The actual text content that will be embedded. */
  readonly text: string;
}
