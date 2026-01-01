import type { FrameworkPlugin, ExtractionItem } from './types.js';

// Lazy-loaded Vue compiler
let vueCompiler: typeof import('@vue/compiler-sfc') | null = null;

/**
 * Try to load Vue compiler
 */
async function loadVueCompiler(): Promise<typeof import('@vue/compiler-sfc') | null> {
  if (vueCompiler !== null) {
    return vueCompiler;
  }

  try {
    vueCompiler = await import('@vue/compiler-sfc');
    return vueCompiler;
  } catch {
    return null;
  }
}

/**
 * Check if Vue compiler is available
 */
function isVueAvailable(): boolean {
  try {
    require.resolve('@vue/compiler-sfc');
    return true;
  } catch {
    try {
      return typeof vueCompiler !== 'undefined' || process.env.VUE_AVAILABLE === 'true';
    } catch {
      return false;
    }
  }
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
 * Get line number from character position
 */
function getLineNumber(text: string, index: number): number {
  const lines = text.substring(0, index).split('\n');
  return lines.length;
}

/**
 * Get column number from character position
 */
function getColumnNumber(text: string, index: number): number {
  const lines = text.substring(0, index).split('\n');
  return lines[lines.length - 1].length + 1;
}

/**
 * Extract i18n strings from Vue template using regex
 * Supports various Vue i18n patterns
 */
function extractFromTemplate(template: string, file: string, lineOffset: number = 0): ExtractionItem[] {
  const results: ExtractionItem[] = [];

  const patterns = [
    // {{ $t('...') }} - Mustache interpolation
    /\{\{\s*\$t\(\s*['"`]([\s\S]*?)['"`][\s\S]*?\)\s*\}\}/g,
    // {{ t('...') }}
    /\{\{\s*t\(\s*['"`]([\s\S]*?)['"`][\s\S]*?\)\s*\}\}/g,
    // $t('...') in attributes
    /\$t\(\s*['"`]([\s\S]*?)['"`][\s\S]*?\)/g,
    // t('...') in attributes
    /\bt\(\s*['"`]([\s\S]*?)['"`][\s\S]*?\)/g,
    // v-t="'...'" directive
    /v-t=["']([^"']+)["']/g,
    // :title="$t('...')" etc
    /:\w+=["']\$t\(\s*['"`]([\s\S]*?)['"`][\s\S]*?\)["']/g,
    // i18n.t('...')
    /i18n\.t\(\s*['"`]([\s\S]*?)['"`][\s\S]*?\)/g,
    // useI18n().t('...')
    /useI18n\(\)\.t\(\s*['"`]([\s\S]*?)['"`][\s\S]*?\)/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(template)) !== null) {
      const key = match[1].replace(/\s*\n\s*/g, ' ').trim();

      if (!key) continue;

      const item: ExtractionItem = {
        key,
        file,
        line: getLineNumber(template, match.index) + lineOffset,
        column: getColumnNumber(template, match.index)
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
 * Extract i18n strings from Vue script section
 */
function extractFromScript(script: string, file: string, lineOffset: number = 0): ExtractionItem[] {
  const results: ExtractionItem[] = [];

  const patterns = [
    // t('...') - Composition API
    /\bt\(\s*['"`]([\s\S]*?)['"`][\s\S]*?\)/g,
    // $t('...') - Options API
    /this\.\$t\(\s*['"`]([\s\S]*?)['"`][\s\S]*?\)/g,
    // i18n.t('...')
    /i18n\.t\(\s*['"`]([\s\S]*?)['"`][\s\S]*?\)/g,
    // useI18n - Composition API setup
    /const\s*\{\s*t\s*\}\s*=\s*useI18n\(\)/g,
  ];

  // Track t() calls
  const tCallPattern = /\bt\(\s*['"`]([\s\S]*?)['"`][\s\S]*?\)/g;
  let match;

  while ((match = tCallPattern.exec(script)) !== null) {
    const key = match[1].replace(/\s*\n\s*/g, ' ').trim();

    if (!key) continue;

    const item: ExtractionItem = {
      key,
      file,
      line: getLineNumber(script, match.index) + lineOffset,
      column: getColumnNumber(script, match.index)
    };

    if (key.includes('{') && key.includes('}')) {
      item.hasParams = true;
      item.params = extractParamsFromKey(key);
    }

    results.push(item);
  }

  // Also check for this.$t in Options API
  const thisTPattern = /this\.\$t\(\s*['"`]([\s\S]*?)['"`][\s\S]*?\)/g;
  while ((match = thisTPattern.exec(script)) !== null) {
    const key = match[1].replace(/\s*\n\s*/g, ' ').trim();

    if (!key) continue;

    const item: ExtractionItem = {
      key,
      file,
      line: getLineNumber(script, match.index) + lineOffset,
      column: getColumnNumber(script, match.index)
    };

    if (key.includes('{') && key.includes('}')) {
      item.hasParams = true;
      item.params = extractParamsFromKey(key);
    }

    results.push(item);
  }

  return results;
}

/**
 * Extract i18n strings from Vue SFC using compiler
 */
async function extractFromVueSFC(code: string, file: string): Promise<ExtractionItem[]> {
  const compiler = await loadVueCompiler();

  if (!compiler) {
    // Fall back to regex-only extraction
    return extractWithRegex(code, file);
  }

  const results: ExtractionItem[] = [];

  try {
    const { descriptor } = compiler.parse(code, {
      filename: file
    });

    // Extract from template
    if (descriptor.template) {
      const templateContent = descriptor.template.content;
      const templateLine = descriptor.template.loc.start.line - 1;
      const templateResults = extractFromTemplate(templateContent, file, templateLine);
      results.push(...templateResults);
    }

    // Extract from script
    if (descriptor.script) {
      const scriptContent = descriptor.script.content;
      const scriptLine = descriptor.script.loc.start.line - 1;
      const scriptResults = extractFromScript(scriptContent, file, scriptLine);
      results.push(...scriptResults);
    }

    // Extract from script setup
    if (descriptor.scriptSetup) {
      const scriptContent = descriptor.scriptSetup.content;
      const scriptLine = descriptor.scriptSetup.loc.start.line - 1;
      const scriptResults = extractFromScript(scriptContent, file, scriptLine);
      results.push(...scriptResults);
    }

  } catch (error) {
    console.error(`Error parsing Vue file ${file}:`, (error as Error).message);
    return extractWithRegex(code, file);
  }

  if (results.length === 0) {
    return extractWithRegex(code, file);
  }

  const uniqueResults: ExtractionItem[] = [];
  const seen = new Set<string>();

  for (const item of results) {
    if (!seen.has(item.key)) {
      seen.add(item.key);
      uniqueResults.push(item);
    }
  }

  return uniqueResults;
}

/**
 * Regex-based extraction fallback for Vue files
 * Uses patterns that properly handle escaped quotes
 */
function extractWithRegex(code: string, file: string): ExtractionItem[] {
  const results: ExtractionItem[] = [];

  // Patterns that handle escaped quotes: (?:[^'\\]|\\.)* 
  const patterns: Array<{ regex: RegExp; group: number }> = [
    // {{ $t('...') }} or {{ $t("...") }}
    { regex: /\{\{\s*\$t\(\s*'((?:[^'\\]|\\.)*)'\s*(?:,[\s\S]*?)?\)\s*\}\}/g, group: 1 },
    { regex: /\{\{\s*\$t\(\s*"((?:[^"\\]|\\.)*)"\s*(?:,[\s\S]*?)?\)\s*\}\}/g, group: 1 },
    { regex: /\{\{\s*\$t\(\s*`((?:[^`\\]|\\.)*)`\s*(?:,[\s\S]*?)?\)\s*\}\}/g, group: 1 },
    // {{ t('...') }}
    { regex: /\{\{\s*t\(\s*'((?:[^'\\]|\\.)*)'\s*(?:,[\s\S]*?)?\)\s*\}\}/g, group: 1 },
    { regex: /\{\{\s*t\(\s*"((?:[^"\\]|\\.)*)"\s*(?:,[\s\S]*?)?\)\s*\}\}/g, group: 1 },
    { regex: /\{\{\s*t\(\s*`((?:[^`\\]|\\.)*)`\s*(?:,[\s\S]*?)?\)\s*\}\}/g, group: 1 },
    // $t('...') in attributes or script
    { regex: /\$t\(\s*'((?:[^'\\]|\\.)*)'\s*(?:,[\s\S]*?)?\)/g, group: 1 },
    { regex: /\$t\(\s*"((?:[^"\\]|\\.)*)"\s*(?:,[\s\S]*?)?\)/g, group: 1 },
    { regex: /\$t\(\s*`((?:[^`\\]|\\.)*)`\s*(?:,[\s\S]*?)?\)/g, group: 1 },
    // t('...') standalone
    { regex: /\bt\(\s*'((?:[^'\\]|\\.)*)'\s*(?:,[\s\S]*?)?\)/g, group: 1 },
    { regex: /\bt\(\s*"((?:[^"\\]|\\.)*)"\s*(?:,[\s\S]*?)?\)/g, group: 1 },
    { regex: /\bt\(\s*`((?:[^`\\]|\\.)*)`\s*(?:,[\s\S]*?)?\)/g, group: 1 },
    // v-t="'...'" directive
    { regex: /v-t=["']([^"']+)["']/g, group: 1 },
    // i18n.t('...')
    { regex: /i18n\.t\(\s*'((?:[^'\\]|\\.)*)'\s*(?:,[\s\S]*?)?\)/g, group: 1 },
    { regex: /i18n\.t\(\s*"((?:[^"\\]|\\.)*)"\s*(?:,[\s\S]*?)?\)/g, group: 1 },
    // this.$t('...')
    { regex: /this\.\$t\(\s*'((?:[^'\\]|\\.)*)'\s*(?:,[\s\S]*?)?\)/g, group: 1 },
    { regex: /this\.\$t\(\s*"((?:[^"\\]|\\.)*)"\s*(?:,[\s\S]*?)?\)/g, group: 1 },
  ];

  for (const { regex, group } of patterns) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(code)) !== null) {
      const rawKey = match[group];
      const key = rawKey
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\')
        .replace(/\s*\n\s*/g, ' ')
        .trim();

      if (!key) continue;

      const item: ExtractionItem = {
        key,
        file,
        line: getLineNumber(code, match.index),
        column: getColumnNumber(code, match.index)
      };

      if (key.includes('{') && key.includes('}')) {
        item.hasParams = true;
        item.params = extractParamsFromKey(key);
      }

      results.push(item);
    }
  }

  // Deduplicate
  const uniqueResults: ExtractionItem[] = [];
  const seen = new Set<string>();

  for (const item of results) {
    if (!seen.has(item.key)) {
      seen.add(item.key);
      uniqueResults.push(item);
    }
  }

  return uniqueResults;
}

/**
 * Vue framework plugin
 */
export const vuePlugin: FrameworkPlugin = {
  name: 'vue',
  extensions: ['.vue'],

  async extract(code: string, file: string): Promise<ExtractionItem[]> {
    try {
      return await extractFromVueSFC(code, file);
    } catch {
      // SFC parsing failed, use regex fallback
    }
    return extractWithRegex(code, file);
  },

  isAvailable(): boolean {
    return isVueAvailable();
  }
};

/**
 * Async extraction with full SFC support (legacy export for backward compatibility)
 */
export async function extractFromVueAsync(code: string, file: string): Promise<ExtractionItem[]> {
  return vuePlugin.extract(code, file);
}

/**
 * Create and register the Vue plugin
 */
export function createVuePlugin(): FrameworkPlugin {
  return vuePlugin;
}

export default vuePlugin;
