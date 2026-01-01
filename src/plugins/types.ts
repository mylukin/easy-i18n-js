/**
 * Type utility for sync or async values
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Extraction result item representing a single i18n string found in source code
 */
export interface ExtractionItem {
  /** The i18n key (translation string) */
  key: string;
  /** Source file path */
  file: string;
  /** Line number in source file */
  line: number;
  /** Column number in source file */
  column: number;
  /** Whether the key contains interpolation parameters */
  hasParams?: boolean;
  /** List of parameter names extracted from the key */
  params?: string[];
}

/**
 * Merged extraction result with occurrence tracking
 */
export interface MergedExtractionItem {
  /** The i18n key */
  key: string;
  /** All locations where this key appears */
  occurrences: Array<{
    file: string;
    line: number;
    column: number;
  }>;
  /** Whether the key contains interpolation parameters */
  hasParams: boolean;
  /** List of parameter names */
  params: string[];
}

/**
 * Options for extraction operations
 */
export interface ExtractOptions {
  /** Glob patterns to include */
  include?: string | string[];
  /** Glob patterns to exclude */
  exclude?: string[];
  /** Progress callback */
  onProgress?: (progress: ProgressInfo) => void;
  /** Whether to use regex fallback on parse errors */
  fallbackToRegex?: boolean;
  /** Custom function names to detect (default: ['$t', 't']) */
  functionNames?: string[];
}

/**
 * Progress information during extraction
 */
export interface ProgressInfo {
  /** Current file being processed */
  file: string;
  /** Number of files processed */
  current: number;
  /** Total number of files to process */
  total: number;
}

/**
 * Options for updating locale files
 */
export interface UpdateLocaleOptions {
  /** Remove keys not present in source */
  flush?: boolean;
  /** Remove untranslated entries (where value === key) */
  removeUntranslated?: boolean;
  /** Validate that parameters match between source and target */
  validateParams?: boolean;
  /** Return statistics along with result */
  returnStats?: boolean;
}

/**
 * Statistics returned from update operations
 */
export interface UpdateStats {
  /** Number of keys added */
  added: number;
  /** Number of keys removed */
  removed: number;
  /** Number of keys unchanged */
  unchanged: number;
  /** Total number of keys processed */
  total: number;
}

/**
 * Result from update operation with statistics
 */
export interface UpdateResult {
  result: Record<string, string>;
  stats: UpdateStats;
}

/**
 * Framework plugin interface
 *
 * Plugins provide framework-specific parsing capabilities for extracting
 * i18n strings from single-file components (SFC) like .svelte or .vue files.
 */
export interface FrameworkPlugin {
  /** Plugin name (e.g., 'svelte', 'vue') */
  name: string;

  /** File extensions this plugin handles (e.g., ['.svelte']) */
  extensions: string[];

  /**
   * Extract i18n strings from source code
   * Supports both sync and async implementations.
   * AST-based parsing (async) is preferred, with regex as fallback.
   * @param code - Source code content
   * @param file - File path for error reporting
   * @returns Array of extraction results (sync or async)
   */
  extract(code: string, file: string): MaybePromise<ExtractionItem[]>;

  /**
   * Check if the framework dependency is available
   * @returns true if the framework can be used
   */
  isAvailable(): boolean;
}

/**
 * Parser options for AST parsing
 */
export interface ParserOptions {
  /** Enable JSX parsing */
  jsx?: boolean;
  /** Include location information in AST */
  locations?: boolean;
  /** Enable error recovery mode */
  errorRecovery?: boolean;
  /** Enable AST caching */
  cache?: boolean;
  /** Source file path for error messages */
  file?: string;
  /** Custom plugins to apply to AST */
  plugins?: unknown[];
}

/**
 * Result from AST parsing with potential errors
 */
export interface ParseResult {
  ast: unknown;
  errors?: Array<{
    message: string;
    line?: number;
    column?: number;
  }>;
}

/**
 * Information about an i18n function call in the AST
 */
export interface I18nCall {
  /** Function name (e.g., '$t', 't') */
  name: string;
  /** Function arguments */
  arguments: I18nCallArgument[];
  /** Source location */
  loc?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

/**
 * Argument from an i18n function call
 */
export interface I18nCallArgument {
  /** Argument type */
  type: 'string' | 'template' | 'object' | 'unknown';
  /** Argument value (for string/template) or parsed object */
  value: string | Record<string, boolean>;
  /** Argument index */
  index: number;
}
