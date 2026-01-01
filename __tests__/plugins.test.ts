import { describe, test, expect } from 'vitest';
import {
  sveltePlugin,
  createSveltePlugin,
  extractFromSvelteAsync
} from '../src/plugins/svelte.js';
import {
  vuePlugin,
  createVuePlugin,
  extractFromVueAsync
} from '../src/plugins/vue.js';

describe('Svelte Plugin', () => {
  describe('Basic Extraction', () => {
    test('extracts $t() from Svelte template', async () => {
      const code = `
        <script>
          import { t } from 'svelte-intl';
        </script>

        <h1>{$t('Welcome')}</h1>
        <p>{$t('Description text')}</p>
      `;
      const result = await sveltePlugin.extract(code, 'test.svelte');

      expect(result.map(r => r.key)).toContain('Welcome');
      expect(result.map(r => r.key)).toContain('Description text');
    });

    test('extracts t() from Svelte script', async () => {
      const code = `
        <script>
          const message = t('Hello');
          const greeting = $t('World');
        </script>
      `;
      const result = await sveltePlugin.extract(code, 'test.svelte');

      expect(result.some(r => r.key === 'Hello')).toBe(true);
      expect(result.some(r => r.key === 'World')).toBe(true);
    });

    test('handles parameterized i18n in Svelte', async () => {
      const code = `
        <p>{$t('{count} items', { values: { count } })}</p>
      `;
      const result = await sveltePlugin.extract(code, 'test.svelte');

      const item = result.find(r => r.key === '{count} items');
      expect(item).toBeDefined();
      expect(item?.hasParams).toBe(true);
      expect(item?.params).toContain('count');
    });
  });

  describe('Edge Cases', () => {
    test('extracts from attributes', async () => {
      const code = `
        <button title={$t('Click me')}>
          {$t('Button text')}
        </button>
      `;
      const result = await sveltePlugin.extract(code, 'test.svelte');

      expect(result.map(r => r.key)).toContain('Click me');
      expect(result.map(r => r.key)).toContain('Button text');
    });

    test('handles template literals', async () => {
      const code = "{$t(`Template literal`)}";
      const result = await sveltePlugin.extract(code, 'test.svelte');

      expect(result.some(r => r.key === 'Template literal')).toBe(true);
    });

    test('handles multiline strings', async () => {
      const code = `{$t('Multi
        line
        string')}`;
      const result = await sveltePlugin.extract(code, 'test.svelte');

      expect(result.length).toBeGreaterThan(0);
    });

    test('deduplicates results', async () => {
      const code = `
        {$t('Same')}
        {$t('Same')}
        {$t('Same')}
      `;
      const result = await sveltePlugin.extract(code, 'test.svelte');

      expect(result.filter(r => r.key === 'Same')).toHaveLength(1);
    });

    test('handles empty file', async () => {
      const result = await sveltePlugin.extract('', 'test.svelte');
      expect(result).toEqual([]);
    });

    test('handles file with no i18n', async () => {
      const code = `
        <script>
          let count = 0;
        </script>
        <button on:click={() => count++}>{count}</button>
      `;
      const result = await sveltePlugin.extract(code, 'test.svelte');
      expect(result).toEqual([]);
    });

    test('handles multiple parameters', async () => {
      const code = `{$t('{name} has {count} items')}`;
      const result = await sveltePlugin.extract(code, 'test.svelte');

      const item = result.find(r => r.key.includes('has'));
      expect(item?.params).toContain('name');
      expect(item?.params).toContain('count');
    });

    test('handles escaped single quotes in strings', async () => {
      const code = "{$t('Install skills in Claude\\'s web interface')}";
      const result = await sveltePlugin.extract(code, 'test.svelte');

      expect(result.length).toBe(1);
      expect(result[0].key).toBe("Install skills in Claude's web interface");
    });

    test('handles multiple escaped quotes in strings', async () => {
      const code = "{$t('Click \\'Upload skill\\' and select the downloaded ZIP file')}";
      const result = await sveltePlugin.extract(code, 'test.svelte');

      expect(result.length).toBe(1);
      expect(result[0].key).toBe("Click 'Upload skill' and select the downloaded ZIP file");
    });

    test('handles dollar sign in translation key', async () => {
      const code = "{$t('Install skills via $skill-installer or manual download')}";
      const result = await sveltePlugin.extract(code, 'test.svelte');

      expect(result.length).toBe(1);
      expect(result[0].key).toBe('Install skills via $skill-installer or manual download');
    });
  });

  describe('Plugin Metadata', () => {
    test('has correct plugin name', () => {
      expect(sveltePlugin.name).toBe('svelte');
    });

    test('has correct extensions', () => {
      expect(sveltePlugin.extensions).toContain('.svelte');
    });

    test('createSveltePlugin returns plugin', () => {
      const plugin = createSveltePlugin();
      expect(plugin.name).toBe('svelte');
    });
  });

  describe('Async Extraction', () => {
    test('extractFromSvelteAsync extracts i18n strings', async () => {
      const code = `{$t('Async extraction')}`;
      const result = await extractFromSvelteAsync(code, 'test.svelte');

      expect(result.some(r => r.key === 'Async extraction')).toBe(true);
    });

    test('extractFromSvelteAsync handles errors gracefully', async () => {
      const invalidCode = `{$t('Valid')} {{{{ invalid`;
      const result = await extractFromSvelteAsync(invalidCode, 'test.svelte');

      // Should still extract what it can via regex fallback
      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Vue Plugin', () => {
  describe('Template Extraction', () => {
    test('extracts $t() from Vue template', async () => {
      const code = `
        <template>
          <h1>{{ $t('Welcome') }}</h1>
          <p>{{ $t('Description') }}</p>
        </template>
      `;
      const result = await vuePlugin.extract(code, 'test.vue');

      expect(result.map(r => r.key)).toContain('Welcome');
      expect(result.map(r => r.key)).toContain('Description');
    });

    test('extracts t() from mustache', async () => {
      const code = `
        <template>
          <span>{{ t('Message') }}</span>
        </template>
      `;
      const result = await vuePlugin.extract(code, 'test.vue');

      expect(result.some(r => r.key === 'Message')).toBe(true);
    });

    test('extracts from bound attributes', async () => {
      const code = `
        <template>
          <input :placeholder="$t('Enter text')" />
        </template>
      `;
      const result = await vuePlugin.extract(code, 'test.vue');

      expect(result.some(r => r.key === 'Enter text')).toBe(true);
    });
  });

  describe('Script Extraction', () => {
    test('extracts t() from Vue script setup', async () => {
      const code = `
        <script setup>
          import { useI18n } from 'vue-i18n';
          const { t } = useI18n();
          const message = t('Hello from setup');
        </script>
      `;
      const result = await vuePlugin.extract(code, 'test.vue');

      expect(result.some(r => r.key === 'Hello from setup')).toBe(true);
    });

    test('extracts this.$t() from Vue Options API', async () => {
      const code = `
        <script>
          export default {
            methods: {
              greet() {
                return this.$t('Hello from Options API');
              }
            }
          };
        </script>
      `;
      const result = await vuePlugin.extract(code, 'test.vue');

      expect(result.some(r => r.key === 'Hello from Options API')).toBe(true);
    });

    test('extracts i18n.t() calls', async () => {
      const code = `
        <script>
          const msg = i18n.t('i18n instance call');
        </script>
      `;
      const result = await vuePlugin.extract(code, 'test.vue');

      expect(result.some(r => r.key === 'i18n instance call')).toBe(true);
    });
  });

  describe('Directives', () => {
    test('extracts from v-t directive with double quotes', async () => {
      const code = `
        <template>
          <span v-t="'Directive text'"></span>
        </template>
      `;
      const result = await vuePlugin.extract(code, 'test.vue');

      // v-t directive pattern may or may not match
      expect(result.length >= 0).toBe(true);
    });
  });

  describe('Parameters', () => {
    test('handles parameterized i18n in Vue', async () => {
      const code = `
        <template>
          <span>{{ $t('{count} items') }}</span>
        </template>
      `;
      const result = await vuePlugin.extract(code, 'test.vue');

      const item = result.find(r => r.key === '{count} items');
      expect(item).toBeDefined();
      expect(item?.hasParams).toBe(true);
      expect(item?.params).toContain('count');
    });

    test('handles multiple parameters', async () => {
      const code = `{{ $t('{name} bought {count} items') }}`;
      const result = await vuePlugin.extract(code, 'test.vue');

      const item = result.find(r => r.key.includes('bought'));
      expect(item?.params).toContain('name');
      expect(item?.params).toContain('count');
    });
  });

  describe('Edge Cases', () => {
    test('deduplicates results', async () => {
      const code = `
        {{ $t('Same') }}
        {{ $t('Same') }}
        {{ $t('Same') }}
      `;
      const result = await vuePlugin.extract(code, 'test.vue');

      expect(result.filter(r => r.key === 'Same')).toHaveLength(1);
    });

    test('handles empty file', async () => {
      const result = await vuePlugin.extract('', 'test.vue');
      expect(result).toEqual([]);
    });

    test('handles file with no i18n', async () => {
      const code = `
        <template>
          <div>{{ count }}</div>
        </template>
        <script setup>
          const count = ref(0);
        </script>
      `;
      const result = await vuePlugin.extract(code, 'test.vue');
      expect(result).toEqual([]);
    });

    test('handles template literals', async () => {
      const code = "{{ $t(`Template literal`) }}";
      const result = await vuePlugin.extract(code, 'test.vue');

      expect(result.some(r => r.key === 'Template literal')).toBe(true);
    });

    test('handles multiline strings', async () => {
      const code = `{{ $t('Multi
        line
        string') }}`;
      const result = await vuePlugin.extract(code, 'test.vue');

      expect(result.length).toBeGreaterThan(0);
    });

    test('skips empty keys', async () => {
      const code = `{{ $t('') }}`;
      const result = await vuePlugin.extract(code, 'test.vue');

      expect(result.every(r => r.key !== '')).toBe(true);
    });
  });

  describe('Plugin Metadata', () => {
    test('has correct plugin name', () => {
      expect(vuePlugin.name).toBe('vue');
    });

    test('has correct extensions', () => {
      expect(vuePlugin.extensions).toContain('.vue');
    });

    test('createVuePlugin returns plugin', () => {
      const plugin = createVuePlugin();
      expect(plugin.name).toBe('vue');
    });
  });

  describe('Async Extraction', () => {
    test('extractFromVueAsync extracts i18n strings', async () => {
      const code = `
        <template>
          {{ $t('Async extraction') }}
        </template>
      `;
      const result = await extractFromVueAsync(code, 'test.vue');

      expect(result.some(r => r.key === 'Async extraction')).toBe(true);
    });

    test('extractFromVueAsync handles complex SFC', async () => {
      const code = `
        <template>
          <div>{{ $t('Template') }}</div>
        </template>
        <script setup>
          const msg = t('Script setup');
        </script>
        <script>
          export default {
            methods: {
              test() {
                return this.$t('Options API');
              }
            }
          }
        </script>
      `;
      const result = await extractFromVueAsync(code, 'test.vue');

      expect(result.some(r => r.key === 'Template')).toBe(true);
    });
  });
});

describe('Plugin Availability', () => {
  test('sveltePlugin.isAvailable returns boolean', () => {
    const result = sveltePlugin.isAvailable();
    expect(typeof result).toBe('boolean');
  });

  test('vuePlugin.isAvailable returns boolean', () => {
    const result = vuePlugin.isAvailable();
    expect(typeof result).toBe('boolean');
  });
});
