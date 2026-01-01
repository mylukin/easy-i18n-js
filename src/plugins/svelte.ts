import type { FrameworkPlugin, ExtractionItem } from './types.js';

// Lazy-loaded Svelte compiler
let svelteCompiler: typeof import('svelte/compiler') | null = null;
let estreeWalker: typeof import('estree-walker') | null = null;

/**
 * Try to load Svelte compiler
 */
async function loadSvelteCompiler(): Promise<typeof import('svelte/compiler') | null> {
  if (svelteCompiler !== null) {
    return svelteCompiler;
  }

  try {
    svelteCompiler = await import('svelte/compiler');
    return svelteCompiler;
  } catch {
    return null;
  }
}

/**
 * Try to load estree-walker
 */
async function loadEstreeWalker(): Promise<typeof import('estree-walker') | null> {
  if (estreeWalker !== null) {
    return estreeWalker;
  }

  try {
    estreeWalker = await import('estree-walker');
    return estreeWalker;
  } catch {
    return null;
  }
}

/**
 * Check if Svelte is available
 */
function isSvelteAvailable(): boolean {
  try {
    require.resolve('svelte/compiler');
    return true;
  } catch {
    // Try ESM resolution
    try {
      // For ESM environments, we need to check differently
      return typeof svelteCompiler !== 'undefined' || process.env.SVELTE_AVAILABLE === 'true';
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
 * Extract i18n strings from Svelte file using AST
 */
async function extractFromSvelteAST(code: string, file: string): Promise<ExtractionItem[]> {
  const compiler = await loadSvelteCompiler();
  const walker = await loadEstreeWalker();

  if (!compiler || !walker) {
    return [];
  }

  const results: ExtractionItem[] = [];

  try {
    // Parse Svelte file using the compiler
    const ast = compiler.parse(code, {
      filename: file,
      modern: true // Use Svelte 5 modern mode
    });

    // Walk the AST to find all $t and t calls
    walker.walk(ast as unknown as import('estree-walker').Node, {
      enter(node: unknown) {
        const nodeAny = node as {
          type: string;
          callee?: { type: string; name?: string; property?: { type: string; name: string } };
          arguments?: Array<{
            type: string;
            value?: string;
            quasis?: Array<{ value: { cooked?: string; raw: string } }>;
            expressions?: unknown[];
          }>;
          expression?: unknown;
          start?: number;
        };

        // Handle CallExpression nodes
        if (nodeAny.type === 'CallExpression') {
          let functionName: string | null = null;

          if (nodeAny.callee?.type === 'Identifier') {
            functionName = (nodeAny.callee as { name: string }).name;
          } else if (
            nodeAny.callee?.type === 'MemberExpression' &&
            nodeAny.callee.property?.type === 'Identifier'
          ) {
            functionName = nodeAny.callee.property.name;
          }

          // Check if it's $t or t function call
          if (functionName === '$t' || functionName === 't') {
            const firstArg = nodeAny.arguments?.[0];

            if (firstArg) {
              let key: string | null = null;

              // Handle string literal
              if (firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
                key = firstArg.value;
              }
              // Handle template literal (no interpolation)
              else if (
                firstArg.type === 'TemplateLiteral' &&
                (!firstArg.expressions || firstArg.expressions.length === 0)
              ) {
                key = firstArg.quasis?.[0]?.value?.cooked || firstArg.quasis?.[0]?.value?.raw || null;
              }

              if (key) {
                const item: ExtractionItem = {
                  key: key.trim(),
                  file,
                  line: nodeAny.start ? getLineNumber(code, nodeAny.start) : 1,
                  column: nodeAny.start ? getColumnNumber(code, nodeAny.start) : 1
                };

                // Check for parameters
                if (key.includes('{') && key.includes('}')) {
                  item.hasParams = true;
                  item.params = extractParamsFromKey(key);
                }

                results.push(item);
              }
            }
          }
        }

        // Handle template expressions {$t(...)}
        if (nodeAny.type === 'ExpressionTag' && nodeAny.expression) {
          const expr = nodeAny.expression as typeof nodeAny;

          if (expr.type === 'CallExpression') {
            const exprCallee = expr.callee as { type: string; name?: string };

            if (
              exprCallee?.type === 'Identifier' &&
              (exprCallee.name === '$t' || exprCallee.name === 't')
            ) {
              const firstArg = expr.arguments?.[0];

              if (firstArg) {
                let key: string | null = null;

                if (firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
                  key = firstArg.value;
                } else if (
                  firstArg.type === 'TemplateLiteral' &&
                  (!firstArg.expressions || firstArg.expressions.length === 0)
                ) {
                  key = firstArg.quasis?.[0]?.value?.cooked || firstArg.quasis?.[0]?.value?.raw || null;
                }

                if (key) {
                  const item: ExtractionItem = {
                    key: key.trim(),
                    file,
                    line: nodeAny.start ? getLineNumber(code, nodeAny.start) : 1,
                    column: nodeAny.start ? getColumnNumber(code, nodeAny.start) : 1
                  };

                  if (key.includes('{') && key.includes('}')) {
                    item.hasParams = true;
                    item.params = extractParamsFromKey(key);
                  }

                  results.push(item);
                }
              }
            }
          }
        }
      }
    });
  } catch (error) {
    console.error(`Error parsing Svelte file ${file}:`, (error as Error).message);
    return [];
  }

  // Deduplicate results
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
 * Regex-based fallback extraction for Svelte files
 * Uses patterns that properly handle escaped quotes
 */
function extractWithRegex(code: string, file: string): ExtractionItem[] {
  const results: ExtractionItem[] = [];
  
  // Patterns that handle escaped quotes: (?:[^'\\]|\\.)* matches:
  // - [^'\\] = any char except ' or \
  // - \\. = backslash followed by any char (escaped char)
  const patterns: Array<{ regex: RegExp; group: number }> = [
    // {$t('...')} or {$t("...")} or {$t(`...`)}
    { regex: /\{\$t\(\s*'((?:[^'\\]|\\.)*)'\s*(?:,[\s\S]*?)?\)\}/g, group: 1 },
    { regex: /\{\$t\(\s*"((?:[^"\\]|\\.)*)"\s*(?:,[\s\S]*?)?\)\}/g, group: 1 },
    { regex: /\{\$t\(\s*`((?:[^`\\]|\\.)*)`\s*(?:,[\s\S]*?)?\)\}/g, group: 1 },
    // {t('...')} or {t("...")} or {t(`...`)}
    { regex: /\{t\(\s*'((?:[^'\\]|\\.)*)'\s*(?:,[\s\S]*?)?\)\}/g, group: 1 },
    { regex: /\{t\(\s*"((?:[^"\\]|\\.)*)"\s*(?:,[\s\S]*?)?\)\}/g, group: 1 },
    { regex: /\{t\(\s*`((?:[^`\\]|\\.)*)`\s*(?:,[\s\S]*?)?\)\}/g, group: 1 },
    // $t('...') or $t("...") or $t(`...`) - in script section
    { regex: /\$t\(\s*'((?:[^'\\]|\\.)*)'\s*(?:,[\s\S]*?)?\)/g, group: 1 },
    { regex: /\$t\(\s*"((?:[^"\\]|\\.)*)"\s*(?:,[\s\S]*?)?\)/g, group: 1 },
    { regex: /\$t\(\s*`((?:[^`\\]|\\.)*)`\s*(?:,[\s\S]*?)?\)/g, group: 1 },
    // t('...') or t("...") - standalone t() calls
    { regex: /\bt\(\s*'((?:[^'\\]|\\.)*)'\s*(?:,[\s\S]*?)?\)/g, group: 1 },
    { regex: /\bt\(\s*"((?:[^"\\]|\\.)*)"\s*(?:,[\s\S]*?)?\)/g, group: 1 },
    { regex: /\bt\(\s*`((?:[^`\\]|\\.)*)`\s*(?:,[\s\S]*?)?\)/g, group: 1 },
  ];

  for (const { regex, group } of patterns) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(code)) !== null) {
      // Unescape the captured string (convert \' to ', \" to ", etc.)
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
 * Svelte framework plugin
 */
export const sveltePlugin: FrameworkPlugin = {
  name: 'svelte',
  extensions: ['.svelte'],

  async extract(code: string, file: string): Promise<ExtractionItem[]> {
    try {
      const results = await extractFromSvelteAST(code, file);
      if (results.length > 0) {
        return results;
      }
    } catch {
      // AST parsing failed, continue to regex fallback
    }
    return extractWithRegex(code, file);
  },

  isAvailable(): boolean {
    return isSvelteAvailable();
  }
};

/**
 * Async extraction with full AST support (legacy export for backward compatibility)
 */
export async function extractFromSvelteAsync(code: string, file: string): Promise<ExtractionItem[]> {
  return sveltePlugin.extract(code, file);
}

/**
 * Create and register the Svelte plugin
 */
export function createSveltePlugin(): FrameworkPlugin {
  return sveltePlugin;
}

export default sveltePlugin;
