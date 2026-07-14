/**
 * IndexedDocument type — represents a markdown file after parsing but before chunking.
 *
 * The parser converts raw markdown into a ParsedDocument: the YAML frontmatter
 * (if present), a flat list of sections (one per heading), and the raw body text.
 * The chunker then walks the sections to produce Chunks.
 */

/** Metadata extracted from YAML frontmatter. Opaque to the parser itself. */
export type Frontmatter = Record<string, unknown>;

/** A section of the document under a single heading. */
export interface Section {
  /**
   * Full path of headings from root to this section, e.g. ["Architecture", " tradeoffs"].
   * An empty array means the section appears before any heading (preamble).
   */
  readonly headingPath: readonly string[];
  /** Nesting level of this section's heading (1 = top-level `#`). 0 for preamble. */
  readonly level: number;
  /** Zero-based line number where this section's heading (or content) starts. */
  readonly startLine: number;
  /** Zero-based line number where this section ends (exclusive). */
  readonly endLine: number;
  /** Raw text content of this section, including any sub-headings. */
  readonly content: string;
}

/** A fully parsed markdown document, ready for chunking. */
export interface ParsedDocument {
  /** Absolute or relative path of the source file. */
  readonly sourcePath: string;
  /** Parsed YAML frontmatter, or null if the file has none. */
  readonly frontmatter: Frontmatter | null;
  /** Ordered list of sections discovered by heading-aware parsing. */
  readonly sections: readonly Section[];
  /** The full body text (after frontmatter, including all sections). */
  readonly body: string;
}

/** The hash of the raw file content — stable identity for the document. */
export interface IndexedDocument {
  /** SHA-256 hash of the raw file bytes. */
  readonly id: string;
  /** The source path of the file. */
  readonly sourcePath: string;
  /** SHA-256 hash of the parsed body text — changes when content meaningfully changes. */
  readonly contentHash: string;
  /** The parsed document. */
  readonly parsed: ParsedDocument;
}
