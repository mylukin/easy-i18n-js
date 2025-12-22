import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';

import {
  extractFromDirectory,
  mergeResults,
  registerPlugin,
  getRegisteredPlugins
} from './core/extractor.js';
import {
  readLocaleFile,
  writeLocaleFile,
  updateLocale,
  findMissing,
  findUnused,
  getCoverage
} from './core/updater.js';
import { sveltePlugin } from './plugins/svelte.js';
import { vuePlugin } from './plugins/vue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to read package.json for version
async function getVersion(): Promise<string> {
  try {
    const packagePath = path.join(__dirname, '../package.json');
    const content = await readFile(packagePath, 'utf-8');
    const pkg = JSON.parse(content);
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

/**
 * Auto-detect and register available framework plugins
 */
function registerAvailablePlugins(): void {
  if (sveltePlugin.isAvailable()) {
    registerPlugin(sveltePlugin);
  }
  if (vuePlugin.isAvailable()) {
    registerPlugin(vuePlugin);
  }
}

/**
 * Main CLI function
 */
export async function main(): Promise<void> {
  const version = await getVersion();
  const program = new Command();

  // Auto-register available plugins
  registerAvailablePlugins();

  program
    .name('easyi18n')
    .description('Framework-agnostic i18n extraction and management tool')
    .version(version);

  // Extract command
  program
    .command('extract')
    .description('Extract i18n strings from source files')
    .option('-s, --source <dir>', 'Source directory', './src')
    .option('-o, --output <file>', 'Output file', './src/locales/en.json')
    .option('-i, --include <patterns>', 'Include patterns', '**/*.{js,jsx,ts,tsx,svelte,vue,mjs}')
    .option('-e, --exclude <patterns>', 'Exclude patterns', 'node_modules/**,dist/**,build/**')
    .option('--dry-run', 'Preview changes without writing')
    .option('--function-names <names>', 'Custom function names to detect (comma-separated)', '$t,t')
    .action(async (options) => {
      const spinner = ora('Extracting i18n strings...').start();

      try {
        const startTime = Date.now();

        // Show registered plugins
        const plugins = getRegisteredPlugins();
        if (plugins.length > 0) {
          spinner.text = `Plugins: ${plugins.map(p => p.name).join(', ')}`;
        }

        // Extract strings
        const results = await extractFromDirectory(options.source, {
          include: options.include,
          exclude: options.exclude.split(','),
          functionNames: options.functionNames.split(','),
          onProgress: (progress) => {
            spinner.text = `Processing ${path.basename(progress.file)} (${progress.current}/${progress.total})`;
          }
        });

        // Merge results
        const merged = mergeResults(results);
        const strings: Record<string, string> = {};
        merged.forEach(item => {
          strings[item.key] = item.key;
        });

        spinner.text = 'Reading existing locale file...';
        const existing = await readLocaleFile(options.output);

        // Update locale file
        const updated = updateLocale(strings, existing) as Record<string, string>;

        if (options.dryRun) {
          spinner.succeed('Dry run complete');
          console.log(chalk.cyan('\nExtracted strings:'));
          Object.keys(strings).forEach(key => {
            if (!(key in existing)) {
              console.log(chalk.green(`  + ${key}`));
            }
          });

          // Show removed keys
          const unused = findUnused(strings, existing);
          if (unused.length > 0) {
            console.log(chalk.yellow('\nKeys in locale but not in source:'));
            unused.forEach(key => {
              console.log(chalk.yellow(`  ? ${key}`));
            });
          }
        } else {
          await writeLocaleFile(options.output, updated);
          spinner.succeed(`Extracted ${Object.keys(strings).length} strings`);
        }

        // Print summary
        const duration = Date.now() - startTime;
        console.log(chalk.cyan(`\n✓ Scanned ${results.length} occurrences`));
        console.log(chalk.cyan(`✓ Found ${Object.keys(strings).length} unique strings`));
        console.log(chalk.cyan(`✓ Time: ${(duration / 1000).toFixed(1)}s`));

      } catch (error) {
        spinner.fail('Extraction failed');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Update command
  program
    .command('update')
    .description('Update target locale files from source')
    .argument('<source>', 'Source locale file')
    .argument('<targets...>', 'Target locale files')
    .option('-f, --flush', 'Remove unused keys')
    .option('--dry-run', 'Preview changes without writing')
    .action(async (source, targets, options) => {
      const spinner = ora('Updating locale files...').start();

      try {
        const sourceData = await readLocaleFile(source);

        for (const target of targets) {
          spinner.text = `Updating ${target}...`;

          const targetData = await readLocaleFile(target);
          const updated = updateLocale(sourceData, targetData, {
            flush: options.flush
          }) as Record<string, string>;

          if (options.dryRun) {
            console.log(chalk.cyan(`\nChanges for ${target}:`));
            // Show additions
            for (const key in updated) {
              if (!(key in targetData)) {
                console.log(chalk.green(`  + ${key}: ${updated[key]}`));
              }
            }
            // Show removals
            if (options.flush) {
              for (const key in targetData) {
                if (!(key in updated)) {
                  console.log(chalk.red(`  - ${key}`));
                }
              }
            }
          } else {
            await writeLocaleFile(target, updated);
          }
        }

        spinner.succeed(`Updated ${targets.length} locale files`);

      } catch (error) {
        spinner.fail('Update failed');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Status command
  program
    .command('status')
    .description('Show translation coverage status')
    .argument('<source>', 'Source locale file (e.g., en.json)')
    .argument('<targets...>', 'Target locale files to check')
    .action(async (source, targets) => {
      try {
        const sourceData = await readLocaleFile(source);

        console.log(chalk.cyan(`\nTranslation Coverage Report`));
        console.log(chalk.cyan(`Source: ${source} (${Object.keys(sourceData).length} keys)\n`));

        for (const target of targets) {
          const targetData = await readLocaleFile(target);
          const coverage = getCoverage(sourceData, targetData);

          const bar = '█'.repeat(Math.floor(coverage.percentage / 5)) +
                      '░'.repeat(20 - Math.floor(coverage.percentage / 5));

          const color = coverage.percentage >= 90 ? chalk.green :
                       coverage.percentage >= 70 ? chalk.yellow :
                       chalk.red;

          console.log(`${path.basename(target)}:`);
          console.log(`  ${bar} ${color(coverage.percentage + '%')}`);
          console.log(`  ${coverage.translated}/${coverage.total} translated, ${coverage.missing} missing\n`);
        }

      } catch (error) {
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Missing command
  program
    .command('missing')
    .description('Find missing translations')
    .argument('<source>', 'Source locale file')
    .argument('<target>', 'Target locale file')
    .action(async (source, target) => {
      try {
        const sourceData = await readLocaleFile(source);
        const targetData = await readLocaleFile(target);
        const missing = findMissing(sourceData, targetData);

        if (missing.length === 0) {
          console.log(chalk.green('✓ All translations are complete!'));
        } else {
          console.log(chalk.yellow(`Missing ${missing.length} translations:\n`));
          missing.forEach(key => {
            console.log(chalk.yellow(`  - ${key}`));
          });
        }

      } catch (error) {
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Unused command
  program
    .command('unused')
    .description('Find unused keys in target locale')
    .argument('<source>', 'Source locale file')
    .argument('<target>', 'Target locale file')
    .action(async (source, target) => {
      try {
        const sourceData = await readLocaleFile(source);
        const targetData = await readLocaleFile(target);
        const unused = findUnused(sourceData, targetData);

        if (unused.length === 0) {
          console.log(chalk.green('✓ No unused keys found!'));
        } else {
          console.log(chalk.yellow(`Found ${unused.length} unused keys:\n`));
          unused.forEach(key => {
            console.log(chalk.yellow(`  - ${key}`));
          });
        }

      } catch (error) {
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Init command
  program
    .command('init')
    .description('Initialize i18n configuration')
    .action(async () => {
      console.log(chalk.cyan('Initializing i18n configuration...'));
      console.log('This feature is coming soon!');
    });

  program.parse();
}

// Run main if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
