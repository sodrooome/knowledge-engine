# knowledge-engine Makefile
# Common developer commands wrapped as simple targets.

.PHONY: install build check start dev test test-watch clean

## install: Install dependencies
install:
	npm install

## build: Compile TypeScript to dist/
build:
	npm run build

## typecheck: Run tsc --noEmit without producing output
check:
	npm run typecheck

## start: Run the compiled entry point (requires build first)
start:
	npm start

## dev: Watch-mode TypeScript compilation
dev:
	npm run dev

## test: Run the test suite once
test:
	npx vitest run

## test-watch: Run tests in watch mode
test-watch:
	npx vitest

## clean: Remove build output and node_modules
clean:
	rm -rf dist

## help: Show this help
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## //; s/: / - /'

.DEFAULT_GOAL := help