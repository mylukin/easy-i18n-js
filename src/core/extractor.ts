import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { parseJavaScript, parseTypeScript, extractFromAST, parseTemplate } from './parser.js';
import type {
  ExtractionItem,
  MergedExtractionItem,
  ExtractOptions,
  FrameworkPlugin,
  ParseResult
} from '../plugins/types.js';

// Registered framework plugins
const registeredPlugins: FrameworkPlugin[] = [];

/**
 * Register a framework plugin
 */
export function registerPlugin(plugin: FrameworkPlugin): void {
  // Avoid duplicate registration
  const existing = registeredPlugins.findIndex(p => p.name === plugin.name);
  if (existing >= 0) {
    registeredPlugins[existing] = plugin;
  } else {
    registeredPlugins.push(plugin);
  }
}

/**
 * Unregister a framework plugin
 */
export function unregisterPlugin(name: string): void {
  const index = registeredPlugins.findIndex(p => p.name === name);
  if (index >= 0) {
    registeredPlugins.splice(index, 1);
  }
}

/**
 * Get all registered plugins
 */
export function getRegisteredPlugins(): FrameworkPlugin[] {
  return [...registeredPlugins];
}

/**
 * Get plugin for a specific file extension
 */
export function getPluginForExtension(ext: string): FrameworkPlugin | undefined {
  return registeredPlugins.find(p => p.extensions.includes(ext) && p.isAvailable());
}

/**
 * Extract i18n strings from JavaScript code
 */
export function extract(code: string, file: string, options: ExtractOptions = {}): ExtractionItem[] {
  const { fallbackToRegex = false, functionNames } = options;
  const results: ExtractionItem[] = [];

  try {
    // Try AST parsing
    const parseResult = parseJavaScript(code, { errorRecovery: true, file });

    // Check if parse returned errors
    const resultWithErrors = parseResult as ParseResult;
    if (resultWithErrors.errors && resultWithErrors.errors.length > 0 && fallbackToRegex) {
      return extractWithRegex(code, file);
    }

    const ast = resultWithErrors.ast || parseResult;
    const calls = extractFromAST(ast, { functionNames });

    for (const call of calls) {
      const firstArg = call.arguments[0];
      if (firstArg && (firstArg.type === 'string' || firstArg.type === 'template')) {
        const item: ExtractionItem = {
          key: firstArg.value as string,
          file,
          line: call.loc?.start?.line || 1,
          column: call.loc?.start?.column || 1
        };

        // Check for parameters
        const paramsArg = call.arguments[1];
        if (paramsArg && paramsArg.type === 'object' && typeof paramsArg.value === 'object') {
          const params = Object.keys(paramsArg.value);
          if (params.length > 0) {
            item.hasParams = true;
            item.params = extractParamsFromKey(firstArg.value as string);
          }
        } else if ((firstArg.value as string).includes('{') && (firstArg.value as string).includes('}')) {
          item.hasParams = true;
          item.params = extractParamsFromKey(firstArg.value as string);
        }

        results.push(item);
      }
    }
  } catch (error) {
    if (fallbackToRegex) {
      return extractWithRegex(code, file);
    }
    throw error;
  }

  return results;
}

/**
 * Extract i18n strings from TypeScript code
 */
export function extractFromTypescript(code: string, file: string, options: ExtractOptions = {}): ExtractionItem[] {
  const { functionNames } = options;
  const results: ExtractionItem[] = [];

  try {
    const ast = parseTypeScript(code, { file });
    const calls = extractFromAST(ast, { functionNames });

    for (const call of calls) {
      const firstArg = call.arguments[0];
      if (firstArg && (firstArg.type === 'string' || firstArg.type === 'template')) {
        const item: ExtractionItem = {
          key: firstArg.value as string,
          file,
          line: call.loc?.start?.line || 1,
          column: call.loc?.start?.column || 1
        };

        // Check for parameters
        const paramsArg = call.arguments[1];
        if (paramsArg && paramsArg.type === 'object' && typeof paramsArg.value === 'object') {
          const params = Object.keys(paramsArg.value);
          if (params.length > 0) {
            item.hasParams = true;
            item.params = params;
          }
        } else if ((firstArg.value as string).includes('{') && (firstArg.value as string).includes('}')) {
          item.hasParams = true;
          item.params = extractParamsFromKey(firstArg.value as string);
        }

        results.push(item);
      }
    }
  } catch {
    // TypeScript parsing failed, fall back to JavaScript parsing
    return extract(code, file, { ...options, fallbackToRegex: true });
  }

  return results;
}

/**
 * Extract parameter names from a translation key
 */
function extractParamsFromKey(key: string): string[] {
  const params: string[] = [];
  const regex = /\{([^}]+)\}/g;
  let match;

  while ((match = regex.exec(key)) !== null) {
    params.push(match[1]);
  }

  return params;
}

/**
 * Regex-based extraction fallback
 */
function extractWithRegex(code: string, file: string): ExtractionItem[] {
  const results: ExtractionItem[] = [];
  const patterns = [
    { regex: /\$t\(\s*['"`]([\s\S]*?)['"`](?:,[\s\S]*?\{[\s\S]*?\})?\)/g },
    { regex: /\bt\(\s*['"`]([\s\S]*?)['"`](?:,[\s\S]*?\{[\s\S]*?\})?\)/g },
    { regex: /\{#t\s+['"`]([\s\S]*?)['"`]\}/g }
  ];

  for (const { regex } of patterns) {
    let match;
    while ((match = regex.exec(code)) !== null) {
      // Clean multiline strings
      const key = match[1]
        .replace(/\s*\n\s*/g, ' ')
        .trim();
      const position = getLineColumn(code, match.index);

      const item: ExtractionItem = {
        key,
        file,
        line: position.line,
        column: position.column
      };

      if (key.includes('{') && key.includes('}')) {
        item.hasParams = true;
        item.params = extractParamsFromKey(key);
      }

      results.push(item);
    }
  }

  return results;
}

/**
 * Get line and column from character index
 */
function getLineColumn(text: string, index: number): { line: number; column: number } {
  const lines = text.substring(0, index).split('\n');
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1
  };
}

/**
 * Extract i18n strings from SFC template content
 */
export function extractFromTemplate(template: string, file: string): ExtractionItem[] {
  const keys = parseTemplate(template);
  return keys.map((key, index) => ({
    key,
    file,
    line: 1 + index, // Approximate line number
    column: 1,
    ...(key.includes('{') && key.includes('}') ? {
      hasParams: true,
      params: extractParamsFromKey(key)
    } : {})
  }));
}

/**
 * Extract i18n strings from a file
 */
export async function extractFromFile(filePath: string, options: ExtractOptions = {}): Promise<ExtractionItem[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  const ext = path.extname(filePath);

  // Check for framework plugin first
  const plugin = getPluginForExtension(ext);
  if (plugin) {
    return plugin.extract(content, filePath);
  }

  // Use built-in extraction based on file extension
  switch (ext) {
    case '.ts':
    case '.tsx':
      return extractFromTypescript(content, filePath, options);
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return extract(content, filePath, options);
    default:
      return [];
  }
}

/**
 * Extract i18n strings from a directory
 */
export async function extractFromDirectory(
  dir: string,
  options: ExtractOptions = {}
): Promise<ExtractionItem[]> {
  const {
    include = '**/*.{js,jsx,ts,tsx,mjs,cjs,svelte,vue}',
    exclude = ['node_modules/**', 'dist/**', 'build/**', '.svelte-kit/**', '.nuxt/**'],
    onProgress
  } = options;

  const patterns = Array.isArray(include) ? include : [include];
  const files = await glob(patterns[0], {
    cwd: dir,
    ignore: exclude,
    absolute: true
  });

  const allResults: ExtractionItem[] = [];
  let processed = 0;

  for (const file of files) {
    try {
      const results = await extractFromFile(file, options);
      allResults.push(...results);
      processed++;

      if (onProgress) {
        onProgress({ current: processed, total: files.length, file });
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, (error as Error).message);
    }
  }

  return allResults;
}

/**
 * Merge extraction results, deduplicating and tracking occurrences
 */
export function mergeResults(results: ExtractionItem[]): MergedExtractionItem[] {
  const keyMap = new Map<string, MergedExtractionItem>();

  for (const item of results) {
    if (!keyMap.has(item.key)) {
      keyMap.set(item.key, {
        key: item.key,
        occurrences: [],
        hasParams: item.hasParams || false,
        params: item.params || []
      });
    }

    const entry = keyMap.get(item.key)!;
    entry.occurrences.push({
      file: item.file,
      line: item.line,
      column: item.column
    });
  }

  return Array.from(keyMap.values());
}
