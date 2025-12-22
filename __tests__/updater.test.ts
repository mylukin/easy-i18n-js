import { describe, test, expect, beforeEach } from 'vitest';
import {
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
} from '../src/core/updater.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('Updater - Locale Management', () => {
  describe('updateLocale', () => {
    test('adds new keys from source', () => {
      const source = { hello: 'Hello', world: 'World' };
      const target = { hello: 'Hello' };
      const result = updateLocale(source, target) as Record<string, string>;

      expect(result).toEqual({
        hello: 'Hello',
        world: 'World'
      });
    });

    test('preserves existing translations', () => {
      const source = { hello: 'Hello', world: 'World' };
      const target = { hello: '你好' };
      const result = updateLocale(source, target) as Record<string, string>;

      expect(result).toEqual({
        hello: '你好',
        world: 'World'
      });
    });

    test('removes unused keys with flush option', () => {
      const source = { hello: 'Hello' };
      const target = { hello: '你好', removed: '已删除' };
      const result = updateLocale(source, target, { flush: true }) as Record<string, string>;

      expect(result).toEqual({
        hello: '你好'
      });
      expect(result.removed).toBeUndefined();
    });

    test('keeps unused keys without flush option', () => {
      const source = { hello: 'Hello' };
      const target = { hello: '你好', removed: '已删除' };
      const result = updateLocale(source, target) as Record<string, string>;

      expect(result.removed).toBe('已删除');
    });

    test('returns stats when returnStats is true', () => {
      const source = { hello: 'Hello', world: 'World', new: 'New' };
      const target = { hello: '你好', unused: '未使用' };
      const result = updateLocale(source, target, {
        flush: true,
        returnStats: true
      }) as { result: Record<string, string>; stats: { added: number; removed: number; unchanged: number; total: number } };

      expect(result.stats.added).toBe(2); // world and new
      expect(result.stats.removed).toBe(1); // unused
      expect(result.stats.unchanged).toBe(1); // hello
      expect(result.stats.total).toBe(3);
    });
  });

  describe('sortKeys', () => {
    test('sorts keys alphabetically', () => {
      const obj = { zebra: '1', apple: '2', mango: '3' };
      const sorted = sortKeys(obj);

      expect(Object.keys(sorted)).toEqual(['apple', 'mango', 'zebra']);
    });

    test('handles empty object', () => {
      const sorted = sortKeys({});
      expect(sorted).toEqual({});
    });
  });

  describe('cleanUnused', () => {
    test('removes empty values', () => {
      const data = { valid: 'Value', empty: '', whitespace: '   ' };
      const cleaned = cleanUnused(data);

      expect(cleaned).toEqual({ valid: 'Value' });
    });

    test('removes untranslated entries when option is set', () => {
      const data = { translated: '翻译', untranslated: 'untranslated' };
      const cleaned = cleanUnused(data, { removeUntranslated: true });

      expect(cleaned).toEqual({ translated: '翻译' });
    });

    test('keeps untranslated entries by default', () => {
      const data = { translated: '翻译', untranslated: 'untranslated' };
      const cleaned = cleanUnused(data);

      expect(cleaned).toEqual({
        translated: '翻译',
        untranslated: 'untranslated'
      });
    });
  });

  describe('findMissing', () => {
    test('finds keys missing in target', () => {
      const source = { a: 'A', b: 'B', c: 'C' };
      const target = { a: '甲' };
      const missing = findMissing(source, target);

      expect(missing).toEqual(['b', 'c']);
    });

    test('identifies untranslated keys (value equals key)', () => {
      const source = { a: 'A', b: 'B' };
      const target = { a: '甲', b: 'b' }; // 'b' is untranslated
      const missing = findMissing(source, target);

      expect(missing).toContain('b');
    });

    test('identifies empty translations as missing', () => {
      const source = { a: 'A', b: 'B' };
      const target = { a: '甲', b: '' };
      const missing = findMissing(source, target);

      expect(missing).toContain('b');
    });
  });

  describe('findUnused', () => {
    test('finds keys in target not in source', () => {
      const source = { a: 'A' };
      const target = { a: '甲', legacy: '旧的' };
      const unused = findUnused(source, target);

      expect(unused).toEqual(['legacy']);
    });

    test('returns empty array when no unused keys', () => {
      const source = { a: 'A', b: 'B' };
      const target = { a: '甲' };
      const unused = findUnused(source, target);

      expect(unused).toEqual([]);
    });
  });

  describe('getCoverage', () => {
    test('calculates translation coverage', () => {
      const source = { a: 'A', b: 'B', c: 'C', d: 'D' };
      const target = { a: '甲', b: '乙' }; // 2 out of 4 translated
      const coverage = getCoverage(source, target);

      expect(coverage.total).toBe(4);
      expect(coverage.translated).toBe(2);
      expect(coverage.missing).toBe(2);
      expect(coverage.percentage).toBe(50);
    });

    test('returns 100% for empty source', () => {
      const coverage = getCoverage({}, { a: '甲' });

      expect(coverage.percentage).toBe(100);
    });

    test('does not count untranslated as translated', () => {
      const source = { a: 'A', b: 'B' };
      const target = { a: '甲', b: 'b' }; // 'b' equals key, untranslated
      const coverage = getCoverage(source, target);

      expect(coverage.translated).toBe(1);
    });
  });
});

describe('Updater - Merge Locales', () => {
  test('merges multiple sources into target', () => {
    const source1 = { a: 'A', b: 'B' };
    const source2 = { c: 'C', d: 'D' };
    const target = { a: '甲' };

    const result = mergeLocales([source1, source2], target) as Record<string, string>;

    expect(result.a).toBe('甲'); // Preserved
    expect(result.b).toBe('B'); // Added from source1
    expect(result.c).toBe('C'); // Added from source2
    expect(result.d).toBe('D'); // Added from source2
  });

  test('later sources override earlier sources', () => {
    const source1 = { a: 'First' };
    const source2 = { a: 'Second' };
    const target = {};

    const result = mergeLocales([source1, source2], target) as Record<string, string>;

    expect(result.a).toBe('Second');
  });

  test('merges with flush option', () => {
    const source1 = { a: 'A' };
    const target = { a: '甲', old: '旧' };

    const result = mergeLocales([source1], target, { flush: true }) as Record<string, string>;

    expect(result.a).toBe('甲');
    expect(result.old).toBeUndefined();
  });
});

describe('Updater - Parameter Validation', () => {
  test('validates parameters in translations', () => {
    const source = { 'Hello {name}': 'Hello {name}' };
    const target = { 'Hello {name}': '你好 {name}' };

    const result = updateLocale(source, target, { validateParams: true }) as Record<string, string>;

    expect(result['Hello {name}']).toBe('你好 {name}');
  });

  test('marks parameter mismatch', () => {
    const source = { 'Hello {name}': 'Hello {name}' };
    const target = { 'Hello {name}': '你好 {username}' }; // Different param

    const result = updateLocale(source, target, { validateParams: true }) as Record<string, string>;

    expect(result['Hello {name}']).toContain('[PARAM_MISMATCH]');
  });

  test('handles multiple parameters', () => {
    const source = { '{count} items in {category}': '{count} items in {category}' };
    const target = { '{count} items in {category}': '{category}里有{count}个' };

    const result = updateLocale(source, target, { validateParams: true }) as Record<string, string>;

    // Params are the same, just reordered - should pass
    expect(result['{count} items in {category}']).not.toContain('[PARAM_MISMATCH]');
  });
});

describe('Updater - File Operations', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'easyi18n-updater-test-'));
  });

  describe('readLocaleFile', () => {
    test('reads JSON locale file', async () => {
      const filePath = path.join(tempDir, 'locale.json');
      await fs.writeFile(filePath, JSON.stringify({ hello: '你好', world: '世界' }));

      const result = await readLocaleFile(filePath);

      expect(result.hello).toBe('你好');
      expect(result.world).toBe('世界');
    });

    test('returns empty object for non-existent file', async () => {
      const result = await readLocaleFile(path.join(tempDir, 'non-existent.json'));

      expect(result).toEqual({});
    });

    test('throws on invalid JSON', async () => {
      const filePath = path.join(tempDir, 'invalid.json');
      await fs.writeFile(filePath, 'not valid json');

      await expect(readLocaleFile(filePath)).rejects.toThrow();
    });
  });

  describe('writeLocaleFile', () => {
    test('writes JSON locale file', async () => {
      const filePath = path.join(tempDir, 'output.json');
      await writeLocaleFile(filePath, { hello: '你好' });

      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      expect(data.hello).toBe('你好');
    });

    test('sorts keys by default', async () => {
      const filePath = path.join(tempDir, 'sorted.json');
      await writeLocaleFile(filePath, { z: '1', a: '2', m: '3' });

      const content = await fs.readFile(filePath, 'utf-8');
      const keys = Object.keys(JSON.parse(content));

      expect(keys).toEqual(['a', 'm', 'z']);
    });

    test('preserves order with sort: false', async () => {
      const filePath = path.join(tempDir, 'unsorted.json');
      await writeLocaleFile(filePath, { z: '1', a: '2' }, { sort: false });

      const content = await fs.readFile(filePath, 'utf-8');
      const keys = Object.keys(JSON.parse(content));

      expect(keys).toEqual(['z', 'a']);
    });

    test('uses compact format with pretty: false', async () => {
      const filePath = path.join(tempDir, 'compact.json');
      await writeLocaleFile(filePath, { a: '1', b: '2' }, { pretty: false });

      const content = await fs.readFile(filePath, 'utf-8');

      expect(content.includes('\n')).toBe(true); // Only trailing newline
      expect(content.trim()).toBe('{"a":"1","b":"2"}');
    });

    test('creates parent directories if needed', async () => {
      const filePath = path.join(tempDir, 'nested', 'deep', 'locale.json');
      await writeLocaleFile(filePath, { test: 'value' });

      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe('updateLocaleFiles', () => {
    test('updates multiple target files', async () => {
      const sourceFile = path.join(tempDir, 'en.json');
      const zhFile = path.join(tempDir, 'zh.json');
      const jaFile = path.join(tempDir, 'ja.json');

      await writeLocaleFile(sourceFile, { hello: 'Hello', world: 'World' });
      await writeLocaleFile(zhFile, { hello: '你好' });
      await writeLocaleFile(jaFile, {});

      const results = await updateLocaleFiles(sourceFile, [zhFile, jaFile]);

      expect(results).toHaveLength(2);
      expect(results[0].keys).toBe(2);
      expect(results[1].keys).toBe(2);

      // Verify zh.json preserved translation
      const zhContent = await readLocaleFile(zhFile);
      expect(zhContent.hello).toBe('你好');
      expect(zhContent.world).toBe('World');

      // Verify ja.json got source values
      const jaContent = await readLocaleFile(jaFile);
      expect(jaContent.hello).toBe('Hello');
    });

    test('applies options to all targets', async () => {
      const sourceFile = path.join(tempDir, 'source.json');
      const targetFile = path.join(tempDir, 'target.json');

      await writeLocaleFile(sourceFile, { a: 'A' });
      await writeLocaleFile(targetFile, { a: '甲', old: '旧' });

      await updateLocaleFiles(sourceFile, [targetFile], { flush: true });

      const content = await readLocaleFile(targetFile);
      expect(content.old).toBeUndefined();
    });
  });
});

describe('Updater - Edge Cases', () => {
  test('handles special characters in keys', () => {
    const source = { 'Key with "quotes"': 'Value' };
    const target = {};
    const result = updateLocale(source, target) as Record<string, string>;

    expect(result['Key with "quotes"']).toBe('Value');
  });

  test('handles unicode in values', () => {
    const source = { emoji: '🎉 Celebration! 🎊' };
    const target = {};
    const result = updateLocale(source, target) as Record<string, string>;

    expect(result.emoji).toBe('🎉 Celebration! 🎊');
  });

  test('handles empty string values', () => {
    const source = { empty: '' };
    const target = {};
    const result = updateLocale(source, target) as Record<string, string>;

    expect(result.empty).toBe('');
  });

  test('handles very long keys', () => {
    const longKey = 'a'.repeat(1000);
    const source = { [longKey]: 'Long key value' };
    const target = {};
    const result = updateLocale(source, target) as Record<string, string>;

    expect(result[longKey]).toBe('Long key value');
  });
});
