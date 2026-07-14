# knowledge-engine project guidelines

- **Don't overcomplicate things, keep minimal.** If implementation starts to overcomplicate things, or there's confusion/caveats, ASK the user before proceeding.
- Prefer clean functional interfaces (no DI framework, no classes when not needed).
- **Tests**: Unit/integration tests are written manually by the user. AI-assisted test writing only when the user explicitly asks for it. Do not auto-generate test files as part of implementation.
- Keep config strictly minimal — add fields only when the part that needs them is being implemented.
- Node.js runtime, TypeScript strict mode, ESM, `verbatimModuleSyntax`.
- Write inline comments/docstrings for each function explaining purpose and intent.
- Implementation is incremental by parts (Part 1: setup, Part 2: parser+chunker, Part 3: embeddings, Part 4: LanceDB, Part 5: indexer, Part 6: watcher, Part 7: retriever, Part 8: opencode integration).
- User reviews and runs manually — do not execute, just ensure `npm run typecheck` is clean.