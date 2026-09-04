# Changelog

All notable changes to knowledge-engine are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/); versions are semantic-ish — breaking changes to stored data bump the minor, additive features patch.

## [Unreleased]

### Planned

- Incremental indexing — skip unchanged notes on re-run (bulk indexer is the skeleton; see `planning.md`, _Decision log_)
- File watcher — re-index notes as they change in the vault
- Indexing through MCP — expose an `index_vault` tool so agents can keep the index fresh
- Native Gemini embedding adapter fallback (`RETRIEVAL_DOCUMENT` vs `RETRIEVAL_QUERY` task types) if OpenRouter's OpenAI-shaped surface disappoints on retrieval quality

## [0.1.2] - 2026-08-30

Fixes the retrieval-freshness gap identified in a vault search postmortem.

### Fixed

- **LanceDB read consistency** — `createLanceDBVectorStore` now connects with `readConsistencyInterval: 0` (strong consistency), so a long-lived connection (e.g. the Opencode MCP server, cached for the process lifetime) observes rows written or deleted by a separate connection (e.g. `npm run index`) without being reopened or requiring an Opencode restart. Previously a connection stayed pinned to the table version it saw at open time, so a re-index was invisible to an already-running MCP server.

### Added

- Regression coverage: `tests/store/LanceDBVectorStore.integration.test.ts` — asserts a long-lived store handle observes a write, and a delete+add re-index, committed later by a separate handle against the same table.
- Published to npm as [`knowledge-engine`](https://www.npmjs.com/package/knowledge-engine) — installable globally for its CLIs (`knowledge-engine-index`, `knowledge-engine-query`, `knowledge-engine-mcp-server`) or as a library (`bootstrapRag` from the package root).

### Project

- Postmortem: vault search and indexing smoke test (`postmortem-vault-search-indexing.md`) — ad-hoc investigation into why `search_vault` results varied across a session (query-wording sensitivity vs. index/restart timing). Proposed the controlled follow-up tests and the freshness-contract fix that this release implements.

## [0.1.1] - 2026-08-27

Opencode integration, search-only: the retriever is now available to agents as a first-class MCP tool.

### Added

- Opencode MCP server (`src/mcp-server.ts`) exposing `search_vault(query, k)` — embeds with the asymmetric `query` task, runs cosine top-K (default 5, max 20), and returns ranked citations with the full chunk text so agents can ground answers in your notes
- Lazy cached RAG runtime — the embedding dimension probe and LanceDB table open happen once per server process, not per query
- Project-scoped MCP registration in `opencode.json`; setup documented for both project and global scope in the README
- Demo screencast (`assets/demo-screencast.mp4`) embedded in the README and the docs Opencode page
- Docs site deployment via GitHub Pages — a workflow assembles `docs/` and `assets/` into a static site and deploys it to Pages
- Dedicated Opencode integration guide (`docs/opencode.html`) covering clone-based setup and MCP registration

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
