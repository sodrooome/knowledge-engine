# Changelog

All notable changes to knowledge-engine are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/); versions are semantic-ish — breaking changes to stored data bump the minor, additive features patch.

## [Unreleased]

### Planned

- Incremental indexing — skip unchanged notes on re-run (bulk indexer is the skeleton; see `planning.md`, _Decision log_)
- File watcher — re-index notes as they change in the vault
- Opencode integration — expose retrieval to agents as a tool
- Native Gemini embedding adapter fallback (`RETRIEVAL_DOCUMENT` vs `RETRIEVAL_QUERY` task types) if OpenRouter's OpenAI-shaped surface disappoints on retrieval quality

## [0.1.0] - 2026-08-23

First coherent milestone: markdown vault in, cited semantic answers out, end to end via two CLIs.

### Added

- Heading-aware markdown parser — ATX headings (1–6 levels), fenced-code aware, frontmatter stripped, preamble sections supported
- Section chunker with configurable size and overlap; stable chunk ids from content hashes
- OpenAI-compatible embedding provider for OpenRouter — one API key covers chat and embeddings; default model `google/gemini-embedding-001` at 3072 dimensions
- LanceDB vector store — cosine-distance top-K search, batched appends, `deleteByDocument` for idempotent re-indexing, one table per embedding model + width so switching models is non-destructive
- Bulk indexer CLI — `npm run index -- <vaultPath>`; skips dotfolders (`.obsidian`, `.trash`); re-runs replace each note's chunks so edits propagate cleanly
- Query CLI — `npm run query -- "<question>" [k]`; prints citations with distance, source path, heading path and line range
- Shared RAG bootstrap wiring (config → provider → store) used by both CLIs and the smoke harness
- End-to-end smoke harness — embed sample texts, store in LanceDB, run a semantic query
- Environment-based configuration with fail-fast validation (`EMBEDDING_API_KEY`, `LANCEDB_PATH` required)

### Fixed

- Pinned `@lancedb/lancedb` to 0.22.3 — last release shipping a native binary for Intel macOS (`darwin-x64`); newer versions fail with `Cannot find native binding`

### Project

- 2026-07-14 — initial commit: project setup, parser, chunker, utils, manual tests
