# @easyi18n/cli

A framework-agnostic i18n extraction and management tool with plugin support for Svelte, Vue, and more.

> 一个与框架无关的 i18n 提取和管理工具，支持 Svelte、Vue 等框架的插件系统。

## Features

- **Framework-agnostic**: Works with any JavaScript/TypeScript project
- **Plugin architecture**: Built-in plugins for Svelte and Vue
- **AST-based extraction**: Accurate extraction using Babel parser
- **Locale management**: Update, merge, and sync locale files
- **CLI and API**: Use as a command-line tool or programmatic API

## Installation

```bash
npm install -D @easyi18n/cli

# For Svelte support
npm install -D svelte

# For Vue support
npm install -D @vue/compiler-sfc
```

## CLI Usage

### Extract i18n strings

```bash
# Basic extraction
npx easyi18n extract -s ./src -o ./locales/en.json

# With custom patterns
npx easyi18n extract --include "**/*.{ts,tsx,vue}" --exclude "tests/**"

# Dry run (preview without writing)
npx easyi18n extract --dry-run
```

### Update locale files

```bash
# Sync target locales with source
npx easyi18n update ./locales/en.json ./locales/zh.json ./locales/ja.json

# Remove unused keys
npx easyi18n update -f ./locales/en.json ./locales/zh.json
```

### Check translation status

```bash
# Show coverage report
npx easyi18n status ./locales/en.json ./locales/zh.json ./locales/ja.json

# Find missing translations
npx easyi18n missing ./locales/en.json ./locales/zh.json

# Find unused keys
npx easyi18n unused ./locales/en.json ./locales/zh.json
```

## Programmatic API

```typescript
import {
  extract,
  extractFromDirectory,
  mergeResults,
  updateLocale,
  readLocaleFile,
  writeLocaleFile
} from '@easyi18n/cli';

// Extract from code string
const items = extract(`$t('Hello, {name}')`, 'app.js');
console.log(items);
// [{ key: 'Hello, {name}', file: 'app.js', line: 1, column: 1, hasParams: true, params: ['name'] }]

// Extract from directory
const allItems = await extractFromDirectory('./src', {
  include: '**/*.{js,ts,vue,svelte}',
  exclude: ['node_modules/**']
});

// Merge and deduplicate
const merged = mergeResults(allItems);

// Update locale files
const source = await readLocaleFile('./locales/en.json');
const target = await readLocaleFile('./locales/zh.json');
const updated = updateLocale(source, target, { flush: true });
await writeLocaleFile('./locales/zh.json', updated);
```

## Plugin System

### Using built-in plugins

```typescript
import { registerPlugin, sveltePlugin, vuePlugin } from '@easyi18n/cli';

// Register plugins
registerPlugin(sveltePlugin);
registerPlugin(vuePlugin);
```

### Creating custom plugins

```typescript
import type { FrameworkPlugin, ExtractionItem } from '@easyi18n/cli';

const myPlugin: FrameworkPlugin = {
  name: 'my-framework',
  extensions: ['.myext'],

  extract(code: string, file: string): ExtractionItem[] {
    // Your extraction logic
    return [];
  },

  isAvailable(): boolean {
    // Check if dependencies are installed
    return true;
  }
};

registerPlugin(myPlugin);
```

## Supported i18n Patterns

The tool detects these common i18n function patterns:

```javascript
// Function calls
$t('Hello')
t('Hello')
i18n.t('Hello')
this.$t('Hello')

// With parameters
$t('Hello, {name}', { values: { name } })
t('{count} items', { count: 5 })

// Vue templates
{{ $t('Hello') }}
{{ t('Hello') }}
v-t="'Hello'"

// Svelte templates
{$t('Hello')}
{t('Hello')}
```

## API Reference

### Extraction

- `extract(code, file, options?)` - Extract from code string
- `extractFromTypescript(code, file, options?)` - Extract from TypeScript
- `extractFromFile(filePath, options?)` - Extract from file
- `extractFromDirectory(dir, options?)` - Extract from directory
- `mergeResults(results)` - Merge and deduplicate results

### Locale Management

- `readLocaleFile(path)` - Read JSON locale file
- `writeLocaleFile(path, data, options?)` - Write locale file
- `updateLocale(source, target, options?)` - Update locale data
- `sortKeys(obj)` - Sort keys alphabetically
- `findMissing(source, target)` - Find missing translations
- `findUnused(source, target)` - Find unused keys
- `getCoverage(source, target)` - Get translation coverage stats

### Plugin Management

- `registerPlugin(plugin)` - Register a framework plugin
- `unregisterPlugin(name)` - Remove a plugin
- `getRegisteredPlugins()` - List registered plugins

## License

MIT
