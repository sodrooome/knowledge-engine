## Context and Background

Since you already have Obsidian and access to multiple LLMs through Opencode, I'd resist the urge to install a dozen plugins. Instead, I'd spend a few hours building a minimal end-to-end prototype:

- Choose an embedding and vector database. A lightweight local setup such as LanceDB or Qdrant works well and is easy to experiment with.
- Write a small indexer (Python or Node.js) that watches your Obsidian vault, chunks Markdown files, generates embeddings, and stores them.
- Connect that index to Opencode so one of your agents can retrieve relevant notes before answering.
- Test with real questions you couldn't answer with simple keyword search, such as:
  - "When have I written about eventual consistency?"
  - "What books have influenced my thinking on inequality?"
  - "Show me every note where I compared software engineering with economics."
- Only after retrieval feels useful, start adding curation features like automatic backlinks, duplicate detection, or weekly "knowledge review" reports.

The reason I'd recommend this order is that it gives you something valuable almost immediately—a semantic search layer over your own knowledge. Everything else, from curator agents to GraphRAG, builds naturally on top of that foundation. Given your experience building testing frameworks and AI-assisted development workflows, I think you'll enjoy treating this as another engineering project: a personal knowledge system whose users happen to be both you and your AI assistants.

One thing I've learned from people who build personal knowledge systems is that it's very tempting to chase the "perfect second brain." Before you know it, you've installed GraphRAG, Neo4j, knowledge graphs, five Obsidian plugins, autonomous agents... and you spend more time maintaining the system than learning.

The five steps you highlighted are enough to build a **Minimum Viable Second Brain (MVSB)**.

Here's what each step gives you:

Step Purpose Don't optimize yet

1. Embeddings + Vector DB Semantic memory Which embedding model is "best"
2. Indexer Keeps the knowledge base updated Fancy chunking strategies
3. Connect to Opencode Makes your notes usable by AI Multi-agent orchestration
4. Ask real questions Validates usefulness Benchmark scores or retrieval metrics
5. Curator features Gradually improves note quality Full automation

## Suggestion

I think this project deserves to be engineered properly. Rather than generating dozens of code snippets in chat, I'd treat it like a real software project.

We could design and implement it incrementally:

- Part 1: Project setup (TypeScript, Bun/Node, dependency injection, configuration).
- Part 2: Markdown parser and chunker.
- Part 3: Embedding providers (OpenAI, Gemini, Ollama, etc.).
- Part 4: LanceDB implementation.
- Part 5: Indexer pipeline.
- Part 6: File watcher.
- Part 7: Retriever.
- Part 8: Integrating it with Opencode.

Each part would be a complete, testable component rather than a large block of code that's difficult to understand or modify. This approach allows us to iterate quickly, test each component in isolation, and ensure that the system is robust and maintainable.

## Project Structure (Expectation)

```
knowledge-engine/
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
├── src/
│   ├── config/
│   │   └── config.ts
│   ├── types/
│   │   ├── Chunk.ts
│   │   ├── IndexedDocument.ts
│   │   └── SearchResult.ts
│   ├── parser/
│   │   ├── MarkdownParser.ts
│   │   ├── Chunker.ts
│   │   └── index.ts
│   ├── embedding/
│   │   ├── EmbeddingProvider.ts
│   │   ├── OpenAIEmbedding.ts
│   │   ├── OllamaEmbedding.ts
│   │   ├── GeminiEmbedding.ts
│   │   └── index.ts
│   ├── utils/
│   │   ├── hash.ts
│   │   └── frontmatter.ts
│   └── main.ts
```

with features such as:

- TypeScript strict mode
- Modern ESM Node.js
- Dependency Injection
- Config from .env
- Markdown parsing
- YAML frontmatter support
- Heading-aware chunking
- Overlapping chunks
- Swappable embedding providers

## Knowledge Graph Architecture

```
                Obsidian
                  │
                  │ Markdown
                  ▼
          Git Repository (optional)
                  │
                  ▼
        Background Indexer
                  │
     ┌────────────┴────────────┐
     │                         │
 Embedding DB              Knowledge Graph
(Qdrant/Chroma/LanceDB)      (Neo4j or similar)
     │                         │
     └────────────┬────────────┘
                  │
              Retrieval Layer
                  │
        ┌─────────┼─────────┐
        │         │         │
    Research   Writing   Engineering
      Agent      Agent       Agent
                  │
                  ▼
          Opencode / Claude / GPT
```

## Design Question

Eventually, I have been reading a blog post and an article about building RAG with Obsidian as part of a second brain and remembering process. Currently, daily, when working towards UI automation testing, I have set up opencode with several toolkits such as Serena alongside RTK for token compression and Oh My Agent, which is used to delegate to an agent when performing a task.

Whenever there’s a new information or insights during development and testing, usually i always put and onboard a new memories and provide them to the skills.md (has different files) and agents.md Is it possible to do the same thing with my Obsidian? Like, for an example: I learned about something new, like the “meaning of oxymoron” or a “food recipe” or some gotchas and tricks, and then I wrote that in my Obsidian, and perhaps RAG or Hermes or whatsoever will do that thing? By curating and analyzing, perhaps it would be useful later?

## Decision log

### Embeddings via OpenRouter (Part 3)

Embeddings go through OpenRouter's OpenAI-compatible `/api/v1/embeddings` endpoint with the default model `google/gemini-embedding-001` at its native 3072 dimensions.

**Known caveat:** OpenRouter's OpenAI-compatible surface cannot pass Gemini's `taskType` (`RETRIEVAL_DOCUMENT` vs `RETRIEVAL_QUERY`). Google guidance suggests this can reduce retrieval quality by an estimated 10–30%.

**Plan:** If real-world retrieval quality disappoints, revisit with a native `GeminiEmbedding` adapter that speaks the Gemini REST API directly and honors `taskType`. For now, the OpenRouter adapter keeps the implementation minimal and provider-agnostic.

### LanceDB pinned to 0.22.3 (Intel Mac)

This machine is Intel (`darwin-x64`). LanceDB stopped shipping Intel macOS binaries after 0.22.x — `@lancedb/lancedb@0.23.0` still _declares_ `@lancedb/lancedb-darwin-x64` in its optionalDependencies but the tarball was never published (404), and newer versions dropped it entirely. npm silently skips missing optional deps, which surfaces as "Cannot find native binding".

**Consequence:** `@lancedb/lancedb` is pinned at `0.22.3` (last version with a real darwin-x64 binary). `apache-arrow ^18.1.0` is within its peer range (`>=15 <=18.1`). Bump back to latest LanceDB when moving to Apple Silicon or Linux — no code changes expected, only core APIs are used.

### Table columns are snake_case

Lance's SQL predicate parser (DataFusion) normalizes unquoted identifiers to lowercase, so camelCase columns break `delete()`/`where()` expressions ("No field named documentid"). Storage schema uses `document_id`, `source_path`, etc.; TypeScript types stay camelCase and map in `toRecord`/`rowToChunk`.

### Per-model vector tables (free model switching)

Embedding models are not interoperable — different widths and distance scales make cross-model search meaningless, so a single shared table forces a destructive reset on every `EMBEDDING_MODEL` change. Instead, each model owns a separate table inside the same LanceDB directory, named `chunks_<sanitized-model>_<hash-of-model:dims>` via `chunkTableName()`.

Consequences:

- Switching `EMBEDDING_MODEL` in `.env` is non-destructive and instant: the old index survives, so A/B comparisons can flip back and forth freely.
- Each table only reflects what was indexed while its model was active — once Part 5 (indexer) lands, switching models means re-indexing the vault into that model's table.
- Stale tables accumulate harmlessly; delete their `.lance` directories under `LANCEDB_PATH` to reclaim space.
- The dimension-mismatch guard remains as a safety net for tables created before this change (e.g. a legacy fixed `chunks` table).

### Bulk indexer CLI (Part 5 skeleton)

`npm run index -- <vaultPath>` walks markdown notes (skipping dotfolders), parses, chunks, embeds (`document` task), and replaces each note's rows via delete-by-document + add — idempotent re-runs. `npm run query -- "<q>" [k]` embeds with the asymmetric `query` task and prints citations. Deliberately deferred from Part 5 proper: contentHash skip-unchanged, deleted-file pruning, resume/checkpointing. Note: smoke rows and vault rows share one per-model table; wipe `data/lancedb` before first real indexing if the sample rows are unwanted.

### Opencode integration via MCP (Part 8, search-only)

Part 8 is implemented **search-only** for the MVSB phase: a Model Context Protocol (MCP) server (`src/mcp-server.ts`) exposes the existing retriever to Opencode as a first-class tool, so any agent can pull relevant notes into its context on demand — no CLI, no manual step, no per-query recompilation.

**Why MCP over a slash command or skill:** a command/skill still shells out to the CLI, which today recompiles TypeScript (`tsc && node`) on every invocation and re-pays the runtime bootstrap (embedding dimension probe + opening the LanceDB table) each time. A long-lived MCP stdio server bootstraps lazily once and caches the runtime, so subsequent queries are just embed + top-K search. Registering it globally (`~/.config/opencode/opencode.json`) makes the tool available from every project, matching the "Retriever → Agents → Opencode/LLM" leg of the architecture.

**Tool surface:**

- `search_vault(query: string, k?: number)` — embeds the question with the asymmetric `query` task hint, runs cosine top-K (default 5, max 20) against the per-model table, and returns ranked citations with the full chunk text (not the CLI's 140-char snippet — agents need the actual content to ground answers).
- Errors are caught and returned as structured tool errors; the server never crashes.

**Deliberately deferred from search-only:**

- `index_vault` tool — indexing stays a manual CLI step for now (MVSB: validate retrieval value before adding surface area). A future `index_vault` tool would reuse the index-CLI logic, which needs extracting into a shared module first.
- `tsc`-less npm scripts — the `tsc &&` prefix is kept intentionally so edits are always recompiled before the CLI/MCP runs. The trade-off (rebuild on `git pull`/edits) is acceptable and documented in the README.

**Config note:** the MCP server is launched with `node --env-file=/home/maukerja/Dev/knowledge-engine/.env`, so the embedding API key lives only in the project's `.env` (not duplicated into the opencode config). Requires an opencode restart after editing `opencode.json` (config is loaded once at startup).

**Upcoming (beyond search-only):**

1. **Indexing through MCP** — extract the index-CLI pipeline into a shared module and expose `index_vault` so agents can keep the index fresh without a shell step.
2. **File watcher (Part 6)** — replace manual re-indexing with automatic incremental updates (content-hash skip-unchanged, deleted-file pruning).
3. **Multi-tool ergonomics** — richer citations (frontmatter, backlinks) and chunk-overlap-aware dedup for agent context packing.
