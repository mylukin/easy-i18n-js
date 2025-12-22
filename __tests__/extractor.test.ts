import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  extract,
  extractFromTypescript,
  extractFromTemplate,
  extractFromFile,
  extractFromDirectory,
  mergeResults,
  registerPlugin,
  unregisterPlugin,
  getRegisteredPlugins,
  getPluginForExtension
} from '../src/core/extractor.js';
import type { FrameworkPlugin, ExtractionItem } from '../src/plugins/types.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('Extractor - Core Functions', () => {
  describe('Basic Extraction', () => {
    test('extracts simple $t() call', () => {
      const code = `$t('Hello World')`;
      const result = extract(code, 'test.js');
      expect(result).toEqual([{
        key: 'Hello World',
        file: 'test.js',
        line: 1,
        column: 1
      }]);
    });

    test('extracts simple t() call', () => {
      const code = `t('Hello World')`;
      const result = extract(code, 'test.js');
      expect(result).toEqual([{
        key: 'Hello World',
        file: 'test.js',
        line: 1,
        column: 1
      }]);
    });

    test('extracts multiple i18n strings', () => {
      const code = `
        const a = $t('First');
        const b = $t('Second');
        const c = t('Third');
      `;
      const result = extract(code, 'test.js');
      expect(result).toHaveLength(3);
      expect(result.map(r => r.key)).toEqual(['First', 'Second', 'Third']);
    });
  });

  describe('Parameterized i18n', () => {
    test('extracts i18n string with parameters', () => {
      const code = `$t('Hello, {name}', { values: { name } })`;
      const result = extract(code, 'test.js');
      expect(result).toEqual([{
        key: 'Hello, {name}',
        file: 'test.js',
        line: 1,
        column: 1,
        hasParams: true,
        params: ['name']
      }]);
    });

    test('extracts multiple parameters', () => {
      const code = `$t('{count} items in {category}', { values: { count, category } })`;
      const result = extract(code, 'test.js');
      expect(result[0].params).toEqual(['count', 'category']);
    });
  });

  describe('Template Strings', () => {
    test('handles template strings', () => {
      const code = "$t(`Hello World`)";
      const result = extract(code, 'test.js');
      expect(result[0].key).toBe('Hello World');
    });

    test('ignores template strings with variables', () => {
      const code = "$t(`Hello ${name}`)";
      const result = extract(code, 'test.js');
      expect(result).toHaveLength(0);
    });
  });

  describe('TypeScript Support', () => {
    test('parses TypeScript file', () => {
      const tsCode = `
        import { t } from 'i18n';

        const message: string = $t('TypeScript message');

        function greet(name: string): string {
          return $t('Hello, {name}', { values: { name } });
        }
      `;
      const result = extractFromTypescript(tsCode, 'test.ts');
      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('TypeScript message');
      expect(result[1].key).toBe('Hello, {name}');
      expect(result[1].hasParams).toBe(true);
    });

    test('handles TypeScript type annotations', () => {
      const tsCode = `
        interface Translation {
          key: string;
          value: string;
        }

        const trans: Translation = {
          key: 'welcome',
          value: $t('Welcome message')
        };
      `;
      const result = extractFromTypescript(tsCode, 'test.ts');
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('Welcome message');
    });
  });

  describe('Edge Cases', () => {
    test('ignores comments containing i18n calls', () => {
      const code = `
        // $t('This is a comment')
        /* $t('This is also a comment') */
        const real = $t('Real message');
      `;
      const result = extract(code, 'test.js');
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('Real message');
    });

    test('handles nested function calls', () => {
      const code = `
        format($t('Nested message'));
        console.log($t('Console message'));
      `;
      const result = extract(code, 'test.js');
      expect(result).toHaveLength(2);
      expect(result.map(r => r.key)).toEqual(['Nested message', 'Console message']);
    });

    test('handles duplicate keys', () => {
      const code = `
        $t('Duplicate');
        $t('Duplicate');
        $t('Unique');
      `;
      const result = extract(code, 'test.js');
      expect(result).toHaveLength(3);
      expect(result.filter(r => r.key === 'Duplicate')).toHaveLength(2);
    });
  });

  describe('Merge Results', () => {
    test('merges and deduplicates results', () => {
      const results = [
        { key: 'Hello', file: 'a.js', line: 1, column: 1 },
        { key: 'Hello', file: 'b.js', line: 5, column: 3 },
        { key: 'World', file: 'a.js', line: 10, column: 1 }
      ];
      const merged = mergeResults(results);

      expect(merged).toHaveLength(2);

      const hello = merged.find(m => m.key === 'Hello');
      expect(hello?.occurrences).toHaveLength(2);

      const world = merged.find(m => m.key === 'World');
      expect(world?.occurrences).toHaveLength(1);
    });
  });

  describe('Regex Fallback', () => {
    test('uses regex fallback on invalid JS', () => {
      const invalidCode = `
        <template>
          $t('Svelte template syntax')
        </template>
      `;
      const result = extract(invalidCode, 'test.js', { fallbackToRegex: true });
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(r => r.key === 'Svelte template syntax')).toBe(true);
    });

    test('throws error without fallback on invalid JS', () => {
      const invalidCode = `const x = {`; // Syntax error
      expect(() => extract(invalidCode, 'test.js', { fallbackToRegex: false })).toThrow();
    });
  });

  describe('Custom Function Names', () => {
    test('extracts with custom function names', () => {
      const code = `translate('Custom') + localize('Another')`;
      const result = extract(code, 'test.js', {
        functionNames: ['translate', 'localize']
      });
      expect(result).toHaveLength(2);
      expect(result.map(r => r.key)).toContain('Custom');
      expect(result.map(r => r.key)).toContain('Another');
    });
  });
});

describe('Extractor - Template Extraction', () => {
  test('extracts from template content', () => {
    const template = `
      <h1>{$t('Title')}</h1>
      <p>{t('Description')}</p>
    `;
    const result = extractFromTemplate(template, 'test.svelte');
    expect(result.map(r => r.key)).toContain('Title');
    expect(result.map(r => r.key)).toContain('Description');
  });

  test('extracts parameters from template', () => {
    const template = `{$t('Hello {name}')}`;
    const result = extractFromTemplate(template, 'test.svelte');
    expect(result[0].hasParams).toBe(true);
    expect(result[0].params).toContain('name');
  });

  test('handles empty template', () => {
    const result = extractFromTemplate('', 'test.svelte');
    expect(result).toEqual([]);
  });
});

describe('Extractor - Plugin System', () => {
  const mockPlugin: FrameworkPlugin = {
    name: 'mock',
    extensions: ['.mock'],
    extract: (code: string, file: string): ExtractionItem[] => {
      return [{ key: 'mock-key', file, line: 1, column: 1 }];
    },
    isAvailable: () => true
  };

  beforeEach(() => {
    // Clean up plugins before each test
    const plugins = getRegisteredPlugins();
    plugins.forEach(p => unregisterPlugin(p.name));
  });

  test('registers a plugin', () => {
    registerPlugin(mockPlugin);
    const plugins = getRegisteredPlugins();
    expect(plugins.some(p => p.name === 'mock')).toBe(true);
  });

  test('unregisters a plugin', () => {
    registerPlugin(mockPlugin);
    unregisterPlugin('mock');
    const plugins = getRegisteredPlugins();
    expect(plugins.some(p => p.name === 'mock')).toBe(false);
  });

  test('updates existing plugin on re-registration', () => {
    registerPlugin(mockPlugin);
    const updatedPlugin = { ...mockPlugin, extensions: ['.mock2'] };
    registerPlugin(updatedPlugin);
    const plugins = getRegisteredPlugins();
    expect(plugins.filter(p => p.name === 'mock')).toHaveLength(1);
    expect(plugins.find(p => p.name === 'mock')?.extensions).toContain('.mock2');
  });

  test('gets plugin for extension', () => {
    registerPlugin(mockPlugin);
    const plugin = getPluginForExtension('.mock');
    expect(plugin?.name).toBe('mock');
  });

  test('returns undefined for unknown extension', () => {
    const plugin = getPluginForExtension('.unknown');
    expect(plugin).toBeUndefined();
  });

  test('unregister non-existent plugin does nothing', () => {
    unregisterPlugin('non-existent');
    // Should not throw
    expect(true).toBe(true);
  });
});

describe('Extractor - File Operations', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'easyi18n-test-'));
  });

  test('extracts from JavaScript file', async () => {
    const filePath = path.join(tempDir, 'test.js');
    await fs.writeFile(filePath, `const msg = $t('Hello from file');`);

    const result = await extractFromFile(filePath);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('Hello from file');
  });

  test('extracts from TypeScript file', async () => {
    const filePath = path.join(tempDir, 'test.ts');
    await fs.writeFile(filePath, `const msg: string = $t('TypeScript file');`);

    const result = await extractFromFile(filePath);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('TypeScript file');
  });

  test('extracts from TSX file', async () => {
    const filePath = path.join(tempDir, 'test.tsx');
    await fs.writeFile(filePath, `const msg: string = $t('TSX content');`);

    const result = await extractFromFile(filePath);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some(r => r.key === 'TSX content')).toBe(true);
  });

  test('extracts from JSX file', async () => {
    const filePath = path.join(tempDir, 'test.jsx');
    await fs.writeFile(filePath, `const msg = $t('JSX content');`);

    const result = await extractFromFile(filePath);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some(r => r.key === 'JSX content')).toBe(true);
  });

  test('extracts from MJS file', async () => {
    const filePath = path.join(tempDir, 'test.mjs');
    await fs.writeFile(filePath, `export const msg = $t('ESM module');`);

    const result = await extractFromFile(filePath);
    expect(result).toHaveLength(1);
  });

  test('extracts from CJS file', async () => {
    const filePath = path.join(tempDir, 'test.cjs');
    await fs.writeFile(filePath, `module.exports = $t('CommonJS module');`);

    const result = await extractFromFile(filePath);
    expect(result).toHaveLength(1);
  });

  test('returns empty for unknown file type', async () => {
    const filePath = path.join(tempDir, 'test.txt');
    await fs.writeFile(filePath, `$t('In text file')`);

    const result = await extractFromFile(filePath);
    expect(result).toEqual([]);
  });

  test('extracts from directory', async () => {
    await fs.writeFile(path.join(tempDir, 'a.js'), `$t('File A')`);
    await fs.writeFile(path.join(tempDir, 'b.ts'), `$t('File B')`);

    const result = await extractFromDirectory(tempDir, {
      include: '**/*.{js,ts}'
    });
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  test('extracts from directory with progress callback', async () => {
    await fs.writeFile(path.join(tempDir, 'test.js'), `$t('Progress test')`);

    const progressCalls: number[] = [];
    await extractFromDirectory(tempDir, {
      include: '**/*.js',
      onProgress: (progress) => {
        progressCalls.push(progress.current);
      }
    });
    expect(progressCalls.length).toBeGreaterThan(0);
  });

  test('excludes patterns from directory extraction', async () => {
    await fs.mkdir(path.join(tempDir, 'excluded'));
    await fs.writeFile(path.join(tempDir, 'included.js'), `$t('Included')`);
    await fs.writeFile(path.join(tempDir, 'excluded', 'file.js'), `$t('Excluded')`);

    const result = await extractFromDirectory(tempDir, {
      include: '**/*.js',
      exclude: ['excluded/**']
    });
    expect(result.some(r => r.key === 'Included')).toBe(true);
    expect(result.some(r => r.key === 'Excluded')).toBe(false);
  });
});

describe('Extractor - Merge Results Advanced', () => {
  test('preserves params in merged results', () => {
    const results: ExtractionItem[] = [
      { key: 'Hello {name}', file: 'a.js', line: 1, column: 1, hasParams: true, params: ['name'] },
      { key: 'Hello {name}', file: 'b.js', line: 2, column: 1, hasParams: true, params: ['name'] }
    ];
    const merged = mergeResults(results);

    expect(merged).toHaveLength(1);
    expect(merged[0].hasParams).toBe(true);
    expect(merged[0].params).toContain('name');
    expect(merged[0].occurrences).toHaveLength(2);
  });

  test('handles items without params', () => {
    const results: ExtractionItem[] = [
      { key: 'Simple', file: 'a.js', line: 1, column: 1 }
    ];
    const merged = mergeResults(results);

    expect(merged[0].hasParams).toBe(false);
    expect(merged[0].params).toEqual([]);
  });

  test('handles empty results', () => {
    const merged = mergeResults([]);
    expect(merged).toEqual([]);
  });
});
