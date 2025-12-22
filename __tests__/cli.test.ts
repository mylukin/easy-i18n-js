import { describe, test, expect, beforeEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// We need to test the CLI module indirectly since it's designed for CLI execution
// Test the main function and its command logic

describe('CLI Module', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'easyi18n-cli-test-'));
  });

  describe('CLI Import', () => {
    test('main function is exported', async () => {
      const cli = await import('../src/cli.js');
      expect(typeof cli.main).toBe('function');
    });
  });

  describe('Integration with core modules', () => {
    test('extract command uses extractor module', async () => {
      // Create test files
      const srcDir = path.join(tempDir, 'src');
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(path.join(srcDir, 'app.js'), `const msg = $t('Hello World');`);

      // Import extractor directly to verify functionality
      const { extractFromDirectory, mergeResults } = await import('../src/core/extractor.js');
      const results = await extractFromDirectory(srcDir);
      const merged = mergeResults(results);

      expect(merged.some(m => m.key === 'Hello World')).toBe(true);
    });

    test('update command uses updater module', async () => {
      // Create locale files
      const sourceFile = path.join(tempDir, 'en.json');
      const targetFile = path.join(tempDir, 'zh.json');

      await fs.writeFile(sourceFile, JSON.stringify({ hello: 'Hello', world: 'World' }));
      await fs.writeFile(targetFile, JSON.stringify({ hello: '你好' }));

      // Import updater directly to verify functionality
      const { readLocaleFile, updateLocale, writeLocaleFile } = await import('../src/core/updater.js');

      const source = await readLocaleFile(sourceFile);
      const target = await readLocaleFile(targetFile);
      const updated = updateLocale(source, target) as Record<string, string>;
      await writeLocaleFile(targetFile, updated);

      const result = await readLocaleFile(targetFile);
      expect(result.hello).toBe('你好');
      expect(result.world).toBe('World');
    });

    test('status command uses getCoverage', async () => {
      const { getCoverage } = await import('../src/core/updater.js');

      const source = { a: 'A', b: 'B', c: 'C' };
      const target = { a: '甲' };

      const coverage = getCoverage(source, target);
      expect(coverage.percentage).toBe(33); // 1/3 = 33%
    });

    test('missing command uses findMissing', async () => {
      const { findMissing } = await import('../src/core/updater.js');

      const source = { a: 'A', b: 'B', c: 'C' };
      const target = { a: '甲' };

      const missing = findMissing(source, target);
      expect(missing).toContain('b');
      expect(missing).toContain('c');
    });

    test('unused command uses findUnused', async () => {
      const { findUnused } = await import('../src/core/updater.js');

      const source = { a: 'A' };
      const target = { a: '甲', legacy: '旧的' };

      const unused = findUnused(source, target);
      expect(unused).toContain('legacy');
    });
  });

  describe('Plugin registration', () => {
    test('svelte plugin can be registered', async () => {
      const { registerPlugin, getRegisteredPlugins, unregisterPlugin } = await import('../src/core/extractor.js');
      const { sveltePlugin } = await import('../src/plugins/svelte.js');

      // Clean up first
      const existing = getRegisteredPlugins();
      existing.forEach(p => unregisterPlugin(p.name));

      registerPlugin(sveltePlugin);
      const plugins = getRegisteredPlugins();
      expect(plugins.some(p => p.name === 'svelte')).toBe(true);

      // Clean up
      unregisterPlugin('svelte');
    });

    test('vue plugin can be registered', async () => {
      const { registerPlugin, getRegisteredPlugins, unregisterPlugin } = await import('../src/core/extractor.js');
      const { vuePlugin } = await import('../src/plugins/vue.js');

      // Clean up first
      const existing = getRegisteredPlugins();
      existing.forEach(p => unregisterPlugin(p.name));

      registerPlugin(vuePlugin);
      const plugins = getRegisteredPlugins();
      expect(plugins.some(p => p.name === 'vue')).toBe(true);

      // Clean up
      unregisterPlugin('vue');
    });
  });
});

describe('CLI Commands Simulation', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'easyi18n-cmd-test-'));
  });

  describe('extract command workflow', () => {
    test('complete extract workflow', async () => {
      const srcDir = path.join(tempDir, 'src');
      const outputFile = path.join(tempDir, 'locales', 'en.json');

      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(path.join(srcDir, 'app.js'), `
        const title = $t('Welcome');
        const desc = $t('Description');
        const greeting = $t('Hello {name}', { values: { name } });
      `);

      const { extractFromDirectory, mergeResults } = await import('../src/core/extractor.js');
      const { readLocaleFile, writeLocaleFile, updateLocale } = await import('../src/core/updater.js');

      // Extract
      const results = await extractFromDirectory(srcDir, {
        include: '**/*.js'
      });
      const merged = mergeResults(results);

      // Convert to locale format
      const strings: Record<string, string> = {};
      merged.forEach(item => {
        strings[item.key] = item.key;
      });

      // Update locale
      const existing = await readLocaleFile(outputFile);
      const updated = updateLocale(strings, existing) as Record<string, string>;
      await writeLocaleFile(outputFile, updated);

      // Verify
      const result = await readLocaleFile(outputFile);
      expect(result['Welcome']).toBe('Welcome');
      expect(result['Description']).toBe('Description');
      expect(result['Hello {name}']).toBe('Hello {name}');
    });
  });

  describe('update command workflow', () => {
    test('complete update workflow', async () => {
      const sourceFile = path.join(tempDir, 'en.json');
      const zhFile = path.join(tempDir, 'zh.json');
      const jaFile = path.join(tempDir, 'ja.json');

      const { writeLocaleFile, readLocaleFile, updateLocale } = await import('../src/core/updater.js');

      // Setup source
      await writeLocaleFile(sourceFile, {
        hello: 'Hello',
        world: 'World',
        new: 'New'
      });

      // Setup targets
      await writeLocaleFile(zhFile, { hello: '你好' });
      await writeLocaleFile(jaFile, { hello: 'こんにちは' });

      // Simulate update command
      const sourceData = await readLocaleFile(sourceFile);
      const targets = [zhFile, jaFile];

      for (const target of targets) {
        const targetData = await readLocaleFile(target);
        const updated = updateLocale(sourceData, targetData) as Record<string, string>;
        await writeLocaleFile(target, updated);
      }

      // Verify
      const zhResult = await readLocaleFile(zhFile);
      expect(zhResult.hello).toBe('你好'); // Preserved
      expect(zhResult.world).toBe('World'); // Added
      expect(zhResult.new).toBe('New'); // Added

      const jaResult = await readLocaleFile(jaFile);
      expect(jaResult.hello).toBe('こんにちは'); // Preserved
    });

    test('update with flush removes unused keys', async () => {
      const sourceFile = path.join(tempDir, 'source.json');
      const targetFile = path.join(tempDir, 'target.json');

      const { writeLocaleFile, readLocaleFile, updateLocale } = await import('../src/core/updater.js');

      await writeLocaleFile(sourceFile, { a: 'A' });
      await writeLocaleFile(targetFile, { a: '甲', unused: '未使用' });

      const source = await readLocaleFile(sourceFile);
      const target = await readLocaleFile(targetFile);
      const updated = updateLocale(source, target, { flush: true }) as Record<string, string>;
      await writeLocaleFile(targetFile, updated);

      const result = await readLocaleFile(targetFile);
      expect(result.a).toBe('甲');
      expect(result.unused).toBeUndefined();
    });
  });

  describe('status command workflow', () => {
    test('complete status workflow', async () => {
      const enFile = path.join(tempDir, 'en.json');
      const zhFile = path.join(tempDir, 'zh.json');
      const jaFile = path.join(tempDir, 'ja.json');

      const { writeLocaleFile, readLocaleFile, getCoverage } = await import('../src/core/updater.js');

      // Setup
      await writeLocaleFile(enFile, {
        a: 'A', b: 'B', c: 'C', d: 'D'
      });
      await writeLocaleFile(zhFile, { a: '甲', b: '乙' }); // 50%
      await writeLocaleFile(jaFile, { a: 'あ' }); // 25%

      // Get coverage
      const source = await readLocaleFile(enFile);

      const zhTarget = await readLocaleFile(zhFile);
      const zhCoverage = getCoverage(source, zhTarget);

      const jaTarget = await readLocaleFile(jaFile);
      const jaCoverage = getCoverage(source, jaTarget);

      expect(zhCoverage.percentage).toBe(50);
      expect(zhCoverage.translated).toBe(2);
      expect(zhCoverage.missing).toBe(2);

      expect(jaCoverage.percentage).toBe(25);
      expect(jaCoverage.translated).toBe(1);
      expect(jaCoverage.missing).toBe(3);
    });
  });

  describe('missing/unused command workflows', () => {
    test('missing keys workflow', async () => {
      const sourceFile = path.join(tempDir, 'source.json');
      const targetFile = path.join(tempDir, 'target.json');

      const { writeLocaleFile, readLocaleFile, findMissing } = await import('../src/core/updater.js');

      await writeLocaleFile(sourceFile, { a: 'A', b: 'B', c: 'C' });
      await writeLocaleFile(targetFile, { a: '甲' });

      const source = await readLocaleFile(sourceFile);
      const target = await readLocaleFile(targetFile);
      const missing = findMissing(source, target);

      expect(missing).toEqual(['b', 'c']);
    });

    test('unused keys workflow', async () => {
      const sourceFile = path.join(tempDir, 'source.json');
      const targetFile = path.join(tempDir, 'target.json');

      const { writeLocaleFile, readLocaleFile, findUnused } = await import('../src/core/updater.js');

      await writeLocaleFile(sourceFile, { a: 'A' });
      await writeLocaleFile(targetFile, { a: '甲', legacy: '旧', old: '老' });

      const source = await readLocaleFile(sourceFile);
      const target = await readLocaleFile(targetFile);
      const unused = findUnused(source, target);

      expect(unused).toContain('legacy');
      expect(unused).toContain('old');
    });
  });
});

describe('Index exports', () => {
  test('all core functions are exported', async () => {
    const index = await import('../src/index.js');

    // Extractor exports
    expect(typeof index.extract).toBe('function');
    expect(typeof index.extractFromTypescript).toBe('function');
    expect(typeof index.extractFromFile).toBe('function');
    expect(typeof index.extractFromDirectory).toBe('function');
    expect(typeof index.mergeResults).toBe('function');
    expect(typeof index.registerPlugin).toBe('function');
    expect(typeof index.unregisterPlugin).toBe('function');
    expect(typeof index.getRegisteredPlugins).toBe('function');

    // Updater exports
    expect(typeof index.updateLocale).toBe('function');
    expect(typeof index.readLocaleFile).toBe('function');
    expect(typeof index.writeLocaleFile).toBe('function');
    expect(typeof index.findMissing).toBe('function');
    expect(typeof index.findUnused).toBe('function');
    expect(typeof index.getCoverage).toBe('function');
    expect(typeof index.sortKeys).toBe('function');

    // Parser exports
    expect(typeof index.parseJavaScript).toBe('function');
    expect(typeof index.parseTypeScript).toBe('function');
    expect(typeof index.extractFromAST).toBe('function');
    expect(index.ParseError).toBeDefined();

    // Plugin exports
    expect(index.sveltePlugin).toBeDefined();
    expect(index.vuePlugin).toBeDefined();
    expect(typeof index.createSveltePlugin).toBe('function');
    expect(typeof index.createVuePlugin).toBe('function');

    // CLI export
    expect(typeof index.runCli).toBe('function');
  });
});
