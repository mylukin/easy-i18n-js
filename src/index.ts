/**
 * @easyi18n/cli - Framework-agnostic i18n extraction tool
 *
 * This package provides tools for extracting and managing i18n strings
 * from JavaScript, TypeScript, Svelte, and Vue projects.
 */

// Core extraction functions
export {
  extract,
  extractFromTypescript,
  extractFromFile,
  extractFromDirectory,
  extractFromTemplate,
  mergeResults,
  registerPlugin,
  unregisterPlugin,
  getRegisteredPlugins,
  getPluginForExtension
} from './core/extractor.js';

// Locale file management
export {
  updateLocale,
  mergeLocales,
  sortKeys,
  cleanUnused,
  readLocaleFile,
  writeLocaleFile,
  updateLocaleFiles,
  findMissing,
  findUnused,
  getCoverage
} from './core/updater.js';

// Parser utilities
export {
  parseJavaScript,
  parseTypeScript,
  parseSFC,
  parseTemplate,
  extractFromAST,
  ParseError,
  clearParseCache
} from './core/parser.js';

// Types
export type {
  ExtractionItem,
  MergedExtractionItem,
  ExtractOptions,
  ProgressInfo,
  UpdateLocaleOptions,
  UpdateStats,
  UpdateResult,
  FrameworkPlugin,
  ParserOptions,
  ParseResult,
  I18nCall,
  I18nCallArgument
} from './plugins/types.js';

// Framework plugins
export { sveltePlugin, createSveltePlugin, extractFromSvelteAsync } from './plugins/svelte.js';
export { vuePlugin, createVuePlugin, extractFromVueAsync } from './plugins/vue.js';

// CLI
export { main as runCli } from './cli.js';
