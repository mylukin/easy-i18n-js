import * as parser from '@babel/parser';
import type { ParserPlugin } from '@babel/parser';
import traverseModule from '@babel/traverse';
import type { ParserOptions, ParseResult, I18nCall } from '../plugins/types.js';

// Handle both ESM and CJS imports of @babel/traverse
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const traverse = (traverseModule as any).default || traverseModule;

/**
 * Custom error class for parse errors with location information
 */
export class ParseError extends Error {
  file?: string;
  line?: number;
  column?: number;

  constructor(message: string, file?: string, line?: number, column?: number) {
    super(message);
    this.name = 'ParseError';
    this.file = file;
    this.line = line;
    this.column = column;
  }
}

// Cache for parsed ASTs
const parseCache = new Map<string, unknown>();

/**
 * Parse JavaScript code into an AST
 */
export function parseJavaScript(code: string, options: ParserOptions = {}): ParseResult | unknown {
  const {
    jsx = false,
    locations = true,
    errorRecovery = false,
    cache = false,
    plugins: userPlugins = []
  } = options;

  // Check cache
  const cacheKey = cache ? `js:${code}` : null;
  if (cache && cacheKey && parseCache.has(cacheKey)) {
    return parseCache.get(cacheKey);
  }

  const plugins: ParserPlugin[] = [
    'optionalChaining',
    'nullishCoalescingOperator',
    'dynamicImport'
  ];

  if (jsx) {
    plugins.push('jsx');
  }

  const parseOptions: parser.ParserOptions = {
    sourceType: 'module',
    plugins,
    errorRecovery,
    ...(locations && { locations: true, ranges: true })
  };

  try {
    const ast = parser.parse(code, parseOptions);

    if (cache && cacheKey) {
      parseCache.set(cacheKey, ast);
    }

    if (errorRecovery && (ast as { errors?: unknown[] }).errors?.length) {
      return { ast, errors: (ast as { errors: unknown[] }).errors };
    }

    // Apply user plugins if provided
    if (userPlugins.length > 0) {
      applyPlugins(ast, userPlugins);
    }

    return ast;
  } catch (error) {
    const err = error as { message: string; loc?: { line: number; column: number } };
    if (errorRecovery) {
      return {
        ast: null,
        errors: [{
          message: err.message,
          line: err.loc?.line,
          column: err.loc?.column
        }]
      };
    }
    throw new ParseError(err.message, options.file, err.loc?.line, err.loc?.column);
  }
}

/**
 * Parse TypeScript code into an AST
 */
export function parseTypeScript(code: string, options: ParserOptions = {}): unknown {
  const { jsx = false, ...restOptions } = options;

  const plugins: ParserPlugin[] = [
    'typescript',
    'optionalChaining',
    'nullishCoalescingOperator',
    'dynamicImport',
    'decorators-legacy'
  ];

  if (jsx) {
    plugins.push('jsx');
  }

  const parseOptions: parser.ParserOptions = {
    sourceType: 'module',
    plugins
  };

  try {
    return parser.parse(code, parseOptions);
  } catch (error) {
    const err = error as { message: string; loc?: { line: number; column: number } };
    throw new ParseError(err.message, options.file, err.loc?.line, err.loc?.column);
  }
}

/**
 * Parse SFC (Single File Component) style file - extracts script sections
 * This is a simplified parser that works for both Svelte and Vue-like templates
 */
export function parseSFC(code: string, _options: ParserOptions = {}): {
  template: { content: string; start: number; end: number } | null;
  script: { content: string; start: number; end: number; lang?: string } | null;
  moduleScript: { content: string; start: number; end: number } | null;
  style: { content: string; start: number; end: number } | null;
} {
  const output = {
    template: null as { content: string; start: number; end: number } | null,
    script: null as { content: string; start: number; end: number; lang?: string } | null,
    moduleScript: null as { content: string; start: number; end: number } | null,
    style: null as { content: string; start: number; end: number } | null
  };

  // Extract module script (Svelte-specific)
  const moduleScriptMatch = code.match(/<script[^>]*context=["']module["'][^>]*>([\s\S]*?)<\/script>/);
  if (moduleScriptMatch) {
    output.moduleScript = {
      content: moduleScriptMatch[1],
      start: code.indexOf(moduleScriptMatch[0]),
      end: code.indexOf(moduleScriptMatch[0]) + moduleScriptMatch[0].length
    };
  }

  // Extract regular script (handles both <script> and <script setup>)
  const scriptMatch = code.match(/<script(?![^>]*context=["']module["'])[^>]*>([\s\S]*?)<\/script>/);
  if (scriptMatch) {
    const scriptTag = scriptMatch[0];
    output.script = {
      content: scriptMatch[1],
      start: code.indexOf(scriptTag),
      end: code.indexOf(scriptTag) + scriptTag.length
    };

    // Detect TypeScript
    if (scriptTag.includes('lang="ts"') || scriptTag.includes("lang='ts'")) {
      output.script.lang = 'ts';
    }
  }

  // Extract template (everything except script and style tags)
  const templateCode = code
    .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');

  if (templateCode.trim()) {
    output.template = {
      content: templateCode,
      start: 0,
      end: code.length
    };
  }

  // Extract style
  const styleMatch = code.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (styleMatch) {
    output.style = {
      content: styleMatch[1],
      start: code.indexOf(styleMatch[0]),
      end: code.indexOf(styleMatch[0]) + styleMatch[0].length
    };
  }

  return output;
}

/**
 * Unescape a string that may contain escape sequences
 */
function unescapeString(str: string): string {
  return str
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\`/g, '`')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\\\/g, '\\');
}

/**
 * Parse template syntax and extract i18n strings using regex
 * Works for both Svelte and Vue template syntax
 */
export function parseTemplate(template: string): string[] {
  const results: string[] = [];

  // Patterns for various i18n function calls
  // Each quote type handled separately to properly support escaped quotes
  // Pattern explanation: (?:[^'\\]|\\.)* means "match any char except ' and \, OR match \ followed by any char"
  const patterns = [
    // {$t('...')} - Svelte template with single quotes
    { regex: /\{\$t\(\s*'((?:[^'\\]|\\.)*)'\s*(?:,[\s\S]*?)?\)\}/g, group: 1 },
    // {$t("...")} - Svelte template with double quotes
    { regex: /\{\$t\(\s*"((?:[^"\\]|\\.)*)"\s*(?:,[\s\S]*?)?\)\}/g, group: 1 },
    // {$t(`...`)} - Svelte template with backticks
    { regex: /\{\$t\(\s*`((?:[^`\\]|\\.)*)`\s*(?:,[\s\S]*?)?\)\}/g, group: 1 },
    // {t('...')} - Svelte with single quotes
    { regex: /\{t\(\s*'((?:[^'\\]|\\.)*)'\s*(?:,[\s\S]*?)?\)\}/g, group: 1 },
    // {t("...")} - Svelte with double quotes
    { regex: /\{t\(\s*"((?:[^"\\]|\\.)*)"\s*(?:,[\s\S]*?)?\)\}/g, group: 1 },
    // {t(`...`)} - Svelte with backticks
    { regex: /\{t\(\s*`((?:[^`\\]|\\.)*)`\s*(?:,[\s\S]*?)?\)\}/g, group: 1 },
    // {#t '...'} - Svelte special syntax
    { regex: /\{#t\s+'((?:[^'\\]|\\.)*)'\}/g, group: 1 },
    { regex: /\{#t\s+"((?:[^"\\]|\\.)*)"\}/g, group: 1 },
    // $t('...') - standalone function call with single quotes
    { regex: /\$t\(\s*'((?:[^'\\]|\\.)*)'\s*(?:,[\s\S]*?)?\)/g, group: 1 },
    // $t("...") - standalone function call with double quotes
    { regex: /\$t\(\s*"((?:[^"\\]|\\.)*)"\s*(?:,[\s\S]*?)?\)/g, group: 1 },
    // $t(`...`) - standalone function call with backticks
    { regex: /\$t\(\s*`((?:[^`\\]|\\.)*)`\s*(?:,[\s\S]*?)?\)/g, group: 1 },
    // t('...') - standalone t() with single quotes
    { regex: /\bt\(\s*'((?:[^'\\]|\\.)*)'\s*(?:,[\s\S]*?)?\)/g, group: 1 },
    // t("...") - standalone t() with double quotes
    { regex: /\bt\(\s*"((?:[^"\\]|\\.)*)"\s*(?:,[\s\S]*?)?\)/g, group: 1 },
    // t(`...`) - standalone t() with backticks
    { regex: /\bt\(\s*`((?:[^`\\]|\\.)*)`\s*(?:,[\s\S]*?)?\)/g, group: 1 },
    // {{ $t('...') }} - Vue template with single quotes
    { regex: /\{\{\s*\$t\(\s*'((?:[^'\\]|\\.)*)'\s*(?:,[\s\S]*?)?\)\s*\}\}/g, group: 1 },
    // {{ $t("...") }} - Vue template with double quotes
    { regex: /\{\{\s*\$t\(\s*"((?:[^"\\]|\\.)*)"\s*(?:,[\s\S]*?)?\)\s*\}\}/g, group: 1 },
    // {{ $t(`...`) }} - Vue template with backticks
    { regex: /\{\{\s*\$t\(\s*`((?:[^`\\]|\\.)*)`\s*(?:,[\s\S]*?)?\)\s*\}\}/g, group: 1 },
    // v-t="'...'" - Vue directive with single quotes
    { regex: new RegExp('v-t="\'((?:[^\'\\\\]|\\\\.)*)\'\"', 'g'), group: 1 },
    // v-t='"..."' - Vue directive with double quotes (inside single)
    { regex: new RegExp('v-t=\'"((?:[^"\\\\]|\\\\.)*)"\'', 'g'), group: 1 },
  ];

  for (const { regex, group } of patterns) {
    let match;
    while ((match = regex.exec(template)) !== null) {
      // Unescape and clean multiline strings
      const rawString = match[group];
      const unescaped = unescapeString(rawString);
      const cleanedString = unescaped
        .replace(/\s*\n\s*/g, ' ')
        .trim();
      results.push(cleanedString);
    }
  }

  return [...new Set(results)]; // Deduplicate
}

/**
 * Extract i18n function calls from an AST
 */
export function extractFromAST(ast: unknown, options: { functionNames?: string[] } = {}): I18nCall[] {
  const { functionNames = ['$t', 't'] } = options;
  const calls: I18nCall[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  traverse(ast as any, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    CallExpression(path: any) {
      const { node } = path;
      const nodeAny = node as {
        callee: {
          type: string;
          name?: string;
          property?: { type: string; name: string };
        };
        arguments: Array<{
          type: string;
          value?: string;
          quasis?: Array<{ value: { raw: string } }>;
          expressions?: unknown[];
          properties?: Array<{
            key: { type: string; name?: string };
            value: {
              type: string;
              properties?: Array<{ key: { type: string; name?: string } }>;
            };
          }>;
          consequent?: { type: string; value?: string };
          alternate?: { type: string; value?: string };
        }>;
        loc?: {
          start: { line: number; column: number };
          end: { line: number; column: number };
        };
      };

      // Check function name
      let functionName: string | null = null;
      if (nodeAny.callee.type === 'Identifier') {
        functionName = nodeAny.callee.name || null;
      } else if (nodeAny.callee.type === 'MemberExpression' && nodeAny.callee.property?.type === 'Identifier') {
        functionName = nodeAny.callee.property.name;
      }

      if (!functionName || !functionNames.includes(functionName)) {
        return;
      }

      // Extract arguments
      const callInfo: I18nCall = {
        name: functionName,
        arguments: [],
        loc: nodeAny.loc
      };

      // Process arguments
      for (let index = 0; index < nodeAny.arguments.length; index++) {
        const arg = nodeAny.arguments[index];

        if (arg.type === 'StringLiteral' || arg.type === 'Literal') {
          callInfo.arguments.push({
            type: 'string',
            value: arg.value as string,
            index
          });
        } else if (arg.type === 'TemplateLiteral' && (!arg.expressions || arg.expressions.length === 0)) {
          // Static template string
          callInfo.arguments.push({
            type: 'template',
            value: arg.quasis?.[0]?.value?.raw || '',
            index
          });
        } else if (arg.type === 'ObjectExpression') {
          // Parameter object
          const params: Record<string, boolean> = {};
          arg.properties?.forEach(prop => {
            if (prop.key.type === 'Identifier' && prop.key.name === 'values') {
              if (prop.value.type === 'ObjectExpression') {
                prop.value.properties?.forEach(p => {
                  if (p.key.type === 'Identifier' && p.key.name) {
                    params[p.key.name] = true;
                  }
                });
              }
            }
          });
          callInfo.arguments.push({
            type: 'object',
            value: params,
            index
          });
        } else if (arg.type === 'ConditionalExpression') {
          // Handle conditional expressions - extract both branches
          if (arg.consequent?.type === 'StringLiteral' || arg.consequent?.type === 'Literal') {
            calls.push({
              ...callInfo,
              arguments: [{
                type: 'string',
                value: arg.consequent.value as string,
                index
              }]
            });
          }
          if (arg.alternate?.type === 'StringLiteral' || arg.alternate?.type === 'Literal') {
            calls.push({
              ...callInfo,
              arguments: [{
                type: 'string',
                value: arg.alternate.value as string,
                index
              }]
            });
          }
          return;
        }
      }

      if (callInfo.arguments.length > 0 && callInfo.arguments[0].type !== 'object') {
        calls.push(callInfo);
      }
    }
  });

  return calls;
}

/**
 * Apply custom plugins to an AST
 */
export function applyPlugins(ast: unknown, plugins: unknown[] = []): unknown {
  for (const plugin of plugins) {
    const pluginObj = plugin as { visitor?: unknown };
    if (pluginObj.visitor) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      traverse(ast as any, pluginObj.visitor as any);
    }
  }
  return ast;
}

/**
 * Clear the parse cache
 */
export function clearParseCache(): void {
  parseCache.clear();
}
