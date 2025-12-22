# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

@mylukin/easy-i18n-js is a framework-agnostic i18n extraction tool that extracts translation strings from JavaScript, TypeScript, Svelte, and Vue projects. It uses AST parsing (via Babel) with regex fallback for robustness.

## Commands

```bash
# Build
npm run build          # TypeScript compilation (tsc)

# Development
npm run dev            # Watch mode (tsc --watch)

# Test
npm test               # Run vitest in watch mode
npm run test:run       # Single test run
npx vitest run __tests__/extractor.test.ts  # Run single test file

# Lint
npm run lint           # Run ESLint on src/

# CLI usage (after build)
./bin/easyi18n.mjs extract -s ./src -o ./locales/en.json
./bin/easyi18n.mjs status en.json zh.json ja.json
./bin/easyi18n.mjs update en.json zh.json ja.json --flush
./bin/easyi18n.mjs missing en.json zh.json
./bin/easyi18n.mjs unused en.json zh.json
```

## Architecture

### Plugin System

The tool uses a plugin architecture for framework support:

- **FrameworkPlugin interface** (`src/plugins/types.ts`): Defines `extract()`, `isAvailable()`, and `extensions`
- Plugins are lazy-loaded and auto-registered when their peer dependencies are available
- Svelte plugin requires `svelte` peer dependency
- Vue plugin requires `@vue/compiler-sfc` peer dependency

### Core Modules

- **extractor.ts**: Main extraction logic, plugin registry, directory scanning with glob patterns. Default excludes: `node_modules/**`, `dist/**`, `build/**`, `.svelte-kit/**`, `.nuxt/**`
- **parser.ts**: Babel-based AST parsing for JS/TS, SFC template parsing, and AST traversal for i18n call extraction. Includes parse caching and error recovery modes.
- **updater.ts**: Locale file management (read/write JSON, merge, find missing/unused, coverage stats)
- **cli.ts**: Commander-based CLI with extract, update, status, missing, unused commands

### Extraction Flow

1. `extractFromDirectory()` scans files matching glob patterns
2. For each file, `extractFromFile()` checks for registered plugins by extension
3. Plugins (or built-in extractors) parse code and return `ExtractionItem[]`
4. `mergeResults()` deduplicates and tracks occurrences
5. Results are merged with existing locale files via `updateLocale()`

### Key Types

- `ExtractionItem`: Single i18n string with file location and optional params
- `MergedExtractionItem`: Deduplicated key with all occurrence locations
- `FrameworkPlugin`: Interface for adding framework support

### i18n Function Detection

Default function names: `$t`, `t`. Configurable via `--function-names` CLI option or `functionNames` in ExtractOptions.

Detected patterns:
- `$t('key')` / `t('key')` in JS/TS
- `{$t('key')}` / `{t('key')}` in Svelte templates
- `{{ $t('key') }}` / `v-t="'key'"` in Vue templates
