import { describe, test, expect, beforeEach } from 'vitest';
import {
  parseJavaScript,
  parseTypeScript,
  parseSFC,
  parseTemplate,
  extractFromAST,
  applyPlugins,
  ParseError,
  clearParseCache
} from '../src/core/parser.js';

describe('Parser - JavaScript Parsing', () => {
  beforeEach(() => {
    clearParseCache();
  });

  describe('parseJavaScript', () => {
    test('parses simple JavaScript code', () => {
      const code = `const x = 1; const y = 2;`;
      const result = parseJavaScript(code);
      expect(result).toBeDefined();
    });

    test('parses with JSX enabled', () => {
      const code = `const element = <div>Hello</div>;`;
      const result = parseJavaScript(code, { jsx: true });
      expect(result).toBeDefined();
    });

    test('parses with error recovery mode', () => {
      const invalidCode = `const x = {`;
      const result = parseJavaScript(invalidCode, { errorRecovery: true }) as { ast: unknown; errors: unknown[] };
      expect(result.errors).toBeDefined();
    });

    test('uses cache when enabled', () => {
      const code = `const x = 1;`;
      const result1 = parseJavaScript(code, { cache: true });
      const result2 = parseJavaScript(code, { cache: true });
      expect(result1).toBe(result2); // Same cached reference
    });

    test('parses optional chaining', () => {
      const code = `const x = obj?.prop?.value;`;
      const result = parseJavaScript(code);
      expect(result).toBeDefined();
    });

    test('parses nullish coalescing', () => {
      const code = `const x = value ?? defaultValue;`;
      const result = parseJavaScript(code);
      expect(result).toBeDefined();
    });

    test('parses dynamic imports', () => {
      const code = `const module = await import('./module.js');`;
      const result = parseJavaScript(code);
      expect(result).toBeDefined();
    });

    test('throws ParseError on syntax error without recovery', () => {
      const invalidCode = `const x = {`;
      expect(() => parseJavaScript(invalidCode)).toThrow(ParseError);
    });

    test('ParseError includes file info', () => {
      const invalidCode = `const x = {`;
      try {
        parseJavaScript(invalidCode, { file: 'test.js' });
      } catch (e) {
        const error = e as ParseError;
        expect(error.file).toBe('test.js');
        expect(error.name).toBe('ParseError');
      }
    });
  });

  describe('parseTypeScript', () => {
    test('parses TypeScript code', () => {
      const code = `const x: number = 1;`;
      const result = parseTypeScript(code);
      expect(result).toBeDefined();
    });

    test('parses TypeScript with interfaces', () => {
      const code = `
        interface User {
          name: string;
          age: number;
        }
        const user: User = { name: 'John', age: 30 };
      `;
      const result = parseTypeScript(code);
      expect(result).toBeDefined();
    });

    test('parses TypeScript with generics', () => {
      const code = `
        function identity<T>(arg: T): T {
          return arg;
        }
      `;
      const result = parseTypeScript(code);
      expect(result).toBeDefined();
    });

    test('parses TSX with jsx option', () => {
      const code = `const element: JSX.Element = <div>Hello</div>;`;
      const result = parseTypeScript(code, { jsx: true });
      expect(result).toBeDefined();
    });

    test('parses decorators', () => {
      const code = `
        @Component
        class MyClass {
          @Input() value: string;
        }
      `;
      const result = parseTypeScript(code);
      expect(result).toBeDefined();
    });

    test('throws ParseError on TypeScript syntax error', () => {
      const invalidCode = `const x: = 1;`; // Invalid TS
      expect(() => parseTypeScript(invalidCode, { file: 'test.ts' })).toThrow(ParseError);
    });
  });
});

describe('Parser - SFC Parsing', () => {
  describe('parseSFC', () => {
    test('extracts script section', () => {
      const code = `
        <script>
          export default { name: 'Test' };
        </script>
      `;
      const result = parseSFC(code);
      expect(result.script).not.toBeNull();
      expect(result.script?.content).toContain('export default');
    });

    test('extracts module script (Svelte)', () => {
      const code = `
        <script context="module">
          export const preload = () => {};
        </script>
        <script>
          let count = 0;
        </script>
      `;
      const result = parseSFC(code);
      expect(result.moduleScript).not.toBeNull();
      expect(result.moduleScript?.content).toContain('preload');
      expect(result.script).not.toBeNull();
    });

    test('extracts template content', () => {
      const code = `
        <script>let x = 1;</script>
        <div>Hello World</div>
        <style>div { color: red; }</style>
      `;
      const result = parseSFC(code);
      expect(result.template).not.toBeNull();
      expect(result.template?.content).toContain('Hello World');
    });

    test('extracts style section', () => {
      const code = `
        <style>
          .container { padding: 10px; }
        </style>
      `;
      const result = parseSFC(code);
      expect(result.style).not.toBeNull();
      expect(result.style?.content).toContain('.container');
    });

    test('detects TypeScript lang', () => {
      const code = `
        <script lang="ts">
          const x: number = 1;
        </script>
      `;
      const result = parseSFC(code);
      expect(result.script?.lang).toBe('ts');
    });

    test('handles empty file', () => {
      const result = parseSFC('');
      expect(result.script).toBeNull();
      expect(result.template).toBeNull();
    });

    test('handles file with only template', () => {
      const code = `<div>Only template</div>`;
      const result = parseSFC(code);
      expect(result.template).not.toBeNull();
      expect(result.script).toBeNull();
    });
  });
});

describe('Parser - Template Parsing', () => {
  describe('parseTemplate', () => {
    test('extracts {$t(...)} patterns', () => {
      const template = `{$t('Hello')} {$t('World')}`;
      const result = parseTemplate(template);
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });

    test('extracts {t(...)} patterns', () => {
      const template = `{t('Message')}`;
      const result = parseTemplate(template);
      expect(result).toContain('Message');
    });

    test('extracts $t(...) without braces', () => {
      const template = `$t('Standalone')`;
      const result = parseTemplate(template);
      expect(result).toContain('Standalone');
    });

    test('extracts {{ $t(...) }} Vue mustache', () => {
      const template = `{{ $t('Vue style') }}`;
      const result = parseTemplate(template);
      expect(result).toContain('Vue style');
    });

    test('extracts v-t directive', () => {
      const template = `<span v-t="'Directive'"></span>`;
      const result = parseTemplate(template);
      expect(result).toContain('Directive');
    });

    test('handles multiline strings', () => {
      const template = `{$t('Multi
        line
        string')}`;
      const result = parseTemplate(template);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toContain('Multi');
    });

    test('deduplicates results', () => {
      const template = `{$t('Same')} {$t('Same')} {$t('Same')}`;
      const result = parseTemplate(template);
      expect(result.filter(r => r === 'Same')).toHaveLength(1);
    });

    test('extracts with parameters', () => {
      const template = `{$t('Hello {name}', { values: { name } })}`;
      const result = parseTemplate(template);
      expect(result).toContain('Hello {name}');
    });

    test('returns empty array for no matches', () => {
      const template = `<div>No i18n here</div>`;
      const result = parseTemplate(template);
      expect(result).toEqual([]);
    });
  });
});

describe('Parser - AST Extraction', () => {
  describe('extractFromAST', () => {
    test('extracts $t() calls', () => {
      const code = `$t('Hello')`;
      const ast = parseJavaScript(code);
      const calls = extractFromAST(ast);
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('$t');
      expect(calls[0].arguments[0].value).toBe('Hello');
    });

    test('extracts t() calls', () => {
      const code = `t('Message')`;
      const ast = parseJavaScript(code);
      const calls = extractFromAST(ast);
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('t');
    });

    test('extracts member expression calls', () => {
      const code = `i18n.t('Member call')`;
      const ast = parseJavaScript(code);
      const calls = extractFromAST(ast);
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('t');
    });

    test('extracts template literals', () => {
      const code = "$t(`Template literal`)";
      const ast = parseJavaScript(code);
      const calls = extractFromAST(ast);
      expect(calls).toHaveLength(1);
      expect(calls[0].arguments[0].type).toBe('template');
    });

    test('extracts object parameters', () => {
      const code = `$t('Key', { values: { name: 'John' } })`;
      const ast = parseJavaScript(code);
      const calls = extractFromAST(ast);
      expect(calls).toHaveLength(1);
      expect(calls[0].arguments).toHaveLength(2);
    });

    test('handles conditional expressions', () => {
      const code = `$t(condition ? 'Yes' : 'No')`;
      const ast = parseJavaScript(code);
      const calls = extractFromAST(ast);
      expect(calls).toHaveLength(2);
      expect(calls.map(c => c.arguments[0].value)).toContain('Yes');
      expect(calls.map(c => c.arguments[0].value)).toContain('No');
    });

    test('uses custom function names', () => {
      const code = `translate('Custom function')`;
      const ast = parseJavaScript(code);
      const calls = extractFromAST(ast, { functionNames: ['translate'] });
      expect(calls).toHaveLength(1);
    });

    test('ignores non-matching function names', () => {
      const code = `other('Not matched')`;
      const ast = parseJavaScript(code);
      const calls = extractFromAST(ast);
      expect(calls).toHaveLength(0);
    });

    test('includes location information', () => {
      const code = `$t('Located')`;
      const ast = parseJavaScript(code, { locations: true });
      const calls = extractFromAST(ast);
      expect(calls[0].loc).toBeDefined();
      expect(calls[0].loc?.start.line).toBe(1);
    });

    test('skips calls with object as first argument', () => {
      const code = `$t({ key: 'value' })`;
      const ast = parseJavaScript(code);
      const calls = extractFromAST(ast);
      expect(calls).toHaveLength(0);
    });

    test('skips template literals with expressions', () => {
      const code = "$t(`Hello ${name}`)";
      const ast = parseJavaScript(code);
      const calls = extractFromAST(ast);
      expect(calls).toHaveLength(0);
    });
  });
});

describe('Parser - Cache', () => {
  test('clearParseCache clears the cache', () => {
    const code = `const x = 1;`;
    const result1 = parseJavaScript(code, { cache: true });
    clearParseCache();
    const result2 = parseJavaScript(code, { cache: true });
    expect(result1).not.toBe(result2);
  });
});

describe('Parser - Plugins', () => {
  test('applyPlugins applies visitor to AST', () => {
    const code = `const x = 1;`;
    const ast = parseJavaScript(code);
    const visited: string[] = [];
    const plugin = {
      visitor: {
        VariableDeclaration(path: { node: { kind: string } }) {
          visited.push(path.node.kind);
        }
      }
    };
    applyPlugins(ast, [plugin]);
    expect(visited).toContain('const');
  });

  test('applyPlugins handles plugin without visitor', () => {
    const code = `const x = 1;`;
    const ast = parseJavaScript(code);
    const plugin = { name: 'empty-plugin' };
    const result = applyPlugins(ast, [plugin]);
    expect(result).toBeDefined();
  });

  test('applyPlugins handles empty plugins array', () => {
    const code = `const x = 1;`;
    const ast = parseJavaScript(code);
    const result = applyPlugins(ast, []);
    expect(result).toBe(ast);
  });
});

describe('Parser - Template Escaped Quotes', () => {
  test('parseTemplate handles escaped single quotes', () => {
    const template = "{$t('It\\'s working')}";
    const result = parseTemplate(template);
    expect(result).toContain("It's working");
  });

  test('parseTemplate handles escaped double quotes', () => {
    const template = '{$t("Say \\"Hello\\"")}';
    const result = parseTemplate(template);
    expect(result).toContain('Say "Hello"');
  });

  test('parseTemplate handles escaped backslash', () => {
    const template = "{$t('Path: C:\\\\Users')}";
    const result = parseTemplate(template);
    expect(result).toContain('Path: C:\\Users');
  });

  test('parseTemplate handles escaped newlines (collapsed to space)', () => {
    const template = "{$t('Line1\\nLine2')}";
    const result = parseTemplate(template);
    expect(result[0]).toBe('Line1 Line2');
  });

  test('parseTemplate handles escaped tabs', () => {
    const template = "{$t('Col1\\tCol2')}";
    const result = parseTemplate(template);
    expect(result[0]).toBe('Col1\tCol2');
  });

  test('parseTemplate handles backtick strings', () => {
    const template = "{$t(`Backtick string`)}";
    const result = parseTemplate(template);
    expect(result).toContain('Backtick string');
  });

  test('parseTemplate handles {#t} syntax with single quotes', () => {
    const template = "{#t 'Special syntax'}";
    const result = parseTemplate(template);
    expect(result).toContain('Special syntax');
  });

  test('parseTemplate handles {#t} syntax with double quotes', () => {
    const template = '{#t "Special double"}';
    const result = parseTemplate(template);
    expect(result).toContain('Special double');
  });
});

describe('Parser - AST Edge Cases', () => {
  test('extractFromAST handles this.$t calls', () => {
    const code = `this.$t('Method call')`;
    const ast = parseJavaScript(code);
    const calls = extractFromAST(ast);
    expect(calls).toHaveLength(1);
    expect(calls[0].arguments[0].value).toBe('Method call');
  });

  test('extractFromAST handles nested object parameters', () => {
    const code = `$t('Key', { values: { user: { name: 'John' } } })`;
    const ast = parseJavaScript(code);
    const calls = extractFromAST(ast);
    expect(calls).toHaveLength(1);
  });

  test('extractFromAST handles empty arguments', () => {
    const code = `$t()`;
    const ast = parseJavaScript(code);
    const calls = extractFromAST(ast);
    expect(calls).toHaveLength(0);
  });

  test('extractFromAST handles number literals', () => {
    const code = `$t(123)`;
    const ast = parseJavaScript(code);
    const calls = extractFromAST(ast);
    expect(calls).toHaveLength(0);
  });

  test('extractFromAST handles variable references', () => {
    const code = `$t(someVariable)`;
    const ast = parseJavaScript(code);
    const calls = extractFromAST(ast);
    expect(calls).toHaveLength(0);
  });

  test('extractFromAST handles conditional with non-string branches', () => {
    const code = `$t(condition ? variable : 'Fallback')`;
    const ast = parseJavaScript(code);
    const calls = extractFromAST(ast);
    expect(calls.some(c => c.arguments[0].value === 'Fallback')).toBe(true);
  });
});

describe('Parser - SFC Edge Cases', () => {
  test('parseSFC handles script with single quote lang', () => {
    const code = `<script lang='ts'>const x: number = 1;</script>`;
    const result = parseSFC(code);
    expect(result.script?.lang).toBe('ts');
  });

  test('parseSFC handles multiple style tags', () => {
    const code = `
      <style>body { margin: 0; }</style>
      <style scoped>.local { color: red; }</style>
    `;
    const result = parseSFC(code);
    expect(result.style).not.toBeNull();
  });

  test('parseSFC handles script setup', () => {
    const code = `<script setup>const x = ref(0);</script>`;
    const result = parseSFC(code);
    expect(result.script?.content).toContain('ref');
  });
});
