/**
 * LanceDB vector store adapter.
 *
 * Manages a single LanceDB table of embedded chunks with an explicit Arrow
 * schema.  All operations are functional — the factory returns a plain object
 * satisfying {@link LanceDBVectorStore}.
 */

import * as lancedb from "@lancedb/lancedb";
import {
  Schema,
  Field,
  Utf8,
  Int32,
  Float32,
  FixedSizeList,
  DataType,
} from "apache-arrow";
import type { Chunk } from "../types/Chunk.js";
import { hashString } from "../utils/hash.js";

/** A chunk paired with its embedding vector. */
export interface EmbeddedChunk {
  readonly chunk: Chunk;
  readonly vector: readonly number[];
}

/** A retrieval hit: the original chunk plus its distance from the query vector. */
export interface VectorSearchHit {
  readonly chunk: Chunk;
  readonly distance: number;
}

export interface LanceDBVectorStore {
  /** Append chunks+vectors. Batches internally (~128 rows per add). Sequential writes. */
  addChunks(chunks: ReadonlyArray<EmbeddedChunk>): Promise<void>;
  /** Cosine-distance top-K search over stored chunk vectors. */
  search(
    vector: readonly number[],
    limit: number,
  ): Promise<readonly VectorSearchHit[]>;
  /** Remove all chunks belonging to one document (used by future re-indexing). */
  deleteByDocument(documentId: string): Promise<void>;
  countRows(): Promise<number>;
}

export interface LanceDBVectorStoreOptions {
  /** Local directory, auto-created by LanceDB. */
  readonly dbPath: string;
  /** Table name. Default "chunks". */
  readonly tableName?: string;
  /** Embedding width; must match table if it already exists. */
  readonly dimensions: number;
}

/**
 * Build the Arrow schema for the chunks table.
 *
 * Column names are snake_case on purpose: Lance's SQL predicate parser
 * (DataFusion) normalizes unquoted identifiers to lowercase, so camelCase
 * columns break `delete()`/`where()` expressions unless quoted. TS-side
 * types stay camelCase; mapping happens in {@link toRecord}/{@link rowToChunk}.
 *
 * `headingPath` is stored as a flat string joined with " / " to keep the
 * MVP simple — LanceDB scalar columns are easier to query and filter than
 * nested list structures.
 */
function buildSchema(dimensions: number): Schema {
  return new Schema([
    new Field("id", new Utf8(), false),
    new Field("document_id", new Utf8(), false),
    new Field("source_path", new Utf8(), false),
    new Field("heading_path", new Utf8(), false),
    new Field("start_line", new Int32(), false),
    new Field("end_line", new Int32(), false),
    new Field("chunk_index", new Int32(), false),
    new Field("text", new Utf8(), false),
    new Field(
      "vector",
      new FixedSizeList(
        dimensions,
        new Field("item", new Float32(), true),
      ),
      false,
    ),
  ]);
}

/** Narrow an unknown row value to string; throw on wrong shape. */
function asString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`Expected string for column "${key}", got ${typeof value}`);
  }
  return value;
}

/** Narrow an unknown row value to number; throw on wrong shape. */
function asNumber(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== "number") {
    throw new Error(`Expected number for column "${key}", got ${typeof value}`);
  }
  return value;
}

/** Convert a stored row back into a {@link Chunk}. */
function rowToChunk(row: Record<string, unknown>): Chunk {
  const headingPathRaw = asString(row, "heading_path");
  const headingPath = headingPathRaw === "" ? [] : headingPathRaw.split(" / ");

  return {
    id: asString(row, "id"),
    documentId: asString(row, "document_id"),
    sourcePath: asString(row, "source_path"),
    headingPath,
    location: {
      startLine: asNumber(row, "start_line"),
      endLine: asNumber(row, "end_line"),
    },
    index: asNumber(row, "chunk_index"),
    text: asString(row, "text"),
  };
}

/** Convert an {@link EmbeddedChunk} into a plain record for LanceDB insertion. */
function toRecord(ec: EmbeddedChunk): Record<string, unknown> {
  return {
    id: ec.chunk.id,
    document_id: ec.chunk.documentId,
    source_path: ec.chunk.sourcePath,
    // headingPath joined with " / " keeps the schema flat and simple
    heading_path: ec.chunk.headingPath.join(" / "),
    start_line: ec.chunk.location.startLine,
    end_line: ec.chunk.location.endLine,
    chunk_index: ec.chunk.index,
    text: ec.chunk.text,
    vector: [...ec.vector],
  };
}

/**
 * Derive a stable, human-readable table name for one embedding model.
 *
 * Different models produce incompatible vectors (different widths and
 * distance scales), so each model owns a separate table inside the same
 * LanceDB directory. Switching EMBEDDING_MODEL then becomes non-destructive:
 * the old index survives and can be switched back to at any time.
 *
 * The slug keeps the model recognizable; the short hash disambiguates the
 * rare case where two configs sanitize to the same slug (or the same model
 * is used with different truncation widths).
 */
export function chunkTableName(model: string, dimensions: number): string {
  const slug = model.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
  const digest = hashString(`${model}:${dimensions}`).slice(0, 8);
  return `chunks_${slug}_${digest}`;
}

/**
 * Create or open a LanceDB vector store for embedded chunks.
 *
 * If the table already exists, validates that its "vector" field has the
 * expected {@link FixedSizeList} width.  Mismatches throw a clear error so
 * the caller knows the embedding model or dimensionality changed versus the
 * existing index.
 *
 * @param options - Path, table name, and embedding dimensions.
 * @returns A {@link LanceDBVectorStore} instance backed by LanceDB.
 */
export async function createLanceDBVectorStore(
  options: LanceDBVectorStoreOptions,
): Promise<LanceDBVectorStore> {
  const { dbPath, tableName = "chunks", dimensions } = options;

  const db = await lancedb.connect(dbPath);
  const names = await db.tableNames();
  const exists = names.includes(tableName);

  let table: lancedb.Table;

  if (exists) {
    table = await db.openTable(tableName);
    const schema = await table.schema();
    const vectorField = schema.fields.find((f) => f.name === "vector");

    if (vectorField === undefined) {
      throw new Error(
        `Existing table "${tableName}" is missing the required "vector" column`,
      );
    }

    if (!DataType.isFixedSizeList(vectorField.type)) {
      throw new Error(
        `Existing table "${tableName}" column "vector" is not a FixedSizeList`,
      );
    }

    const existingDim = vectorField.type.listSize;
    if (existingDim !== dimensions) {
      throw new Error(
        `Embedding dimension mismatch: existing table has ${existingDim} dims, ` +
          `but config specifies ${dimensions}. ` +
          `This usually means EMBEDDING_MODEL or DIMENSIONS changed vs the existing index. ` +
          `Delete the LanceDB directory or update your env to match the existing index.`,
      );
    }
  } else {
    const schema = buildSchema(dimensions);
    table = await db.createEmptyTable(tableName, schema, {
      mode: "create",
      existOk: false,
    });
  }

  return {
    async addChunks(chunks: ReadonlyArray<EmbeddedChunk>): Promise<void> {
      const batchSize = 128;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const records = batch.map(toRecord);
        await table.add(records);
      }
    },

    async search(
      vector: readonly number[],
      limit: number,
    ): Promise<readonly VectorSearchHit[]> {
      const query = table.search([...vector]);
      if (!(query instanceof lancedb.VectorQuery)) {
        throw new Error(
          "Expected VectorQuery from table.search with vector input",
        );
      }

      const rows = await query
        .distanceType("cosine")
        .select([
          "id",
          "document_id",
          "source_path",
          "heading_path",
          "start_line",
          "end_line",
          "chunk_index",
          "text",
          "_distance",
        ])
        .limit(limit)
        .toArray();

      const hits: VectorSearchHit[] = [];
      for (const row of rows) {
        if (row === null || typeof row !== "object") {
          throw new Error("LanceDB search returned a non-object row");
        }
        const record = row as Record<string, unknown>;
        hits.push({
          chunk: rowToChunk(record),
          distance: asNumber(record, "_distance"),
        });
      }

      return hits;
    },

    async deleteByDocument(documentId: string): Promise<void> {
      // document_id is a hex SHA-256 string, so single-quote quoting is safe.
      await table.delete(`document_id = '${documentId}'`);
    },

    async countRows(): Promise<number> {
      return table.countRows();
    },
  };
}
