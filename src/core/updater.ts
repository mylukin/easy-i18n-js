import fs from 'fs/promises';
import path from 'path';
import type { UpdateLocaleOptions, UpdateStats, UpdateResult } from '../plugins/types.js';

/**
 * Update locale data from source to target
 */
export function updateLocale(
  source: Record<string, string>,
  target: Record<string, string>,
  options: UpdateLocaleOptions = {}
): Record<string, string> | UpdateResult {
  const {
    flush = false,
    removeUntranslated = false,
    validateParams = false,
    returnStats = false
  } = options;

  let result = { ...target };
  const stats: UpdateStats = {
    added: 0,
    removed: 0,
    unchanged: 0,
    total: 0
  };

  // Remove unused keys (flush mode)
  if (flush) {
    for (const key in result) {
      if (!(key in source)) {
        delete result[key];
        stats.removed++;
      }
    }
  }

  // Process source keys
  for (const key in source) {
    stats.total++;

    if (key in result) {
      // Existing key
      if (removeUntranslated && result[key] === key) {
        // Untranslated entry, use source value
        result[key] = source[key];
      } else if (validateParams && hasParams(key)) {
        // Validate parameters
        const sourceParams = extractParams(source[key]);
        const targetParams = extractParams(result[key]);
        if (!arraysEqual(sourceParams, targetParams)) {
          result[key] = `[PARAM_MISMATCH] ${result[key]}`;
        }
      } else {
        stats.unchanged++;
      }
    } else {
      // New key - use source value directly
      result[key] = source[key];
      stats.added++;
    }
  }

  if (returnStats) {
    return { result, stats };
  }

  return result;
}

/**
 * Merge multiple locale sources into target
 */
export function mergeLocales(
  sources: Record<string, string>[],
  target: Record<string, string>,
  options: UpdateLocaleOptions = {}
): Record<string, string> | UpdateResult {
  let merged: Record<string, string> = {};

  // Merge all sources
  for (const source of sources) {
    Object.assign(merged, source);
  }

  return updateLocale(merged, target, options);
}

/**
 * Sort keys alphabetically
 */
export function sortKeys(obj: Record<string, string>): Record<string, string> {
  const sorted: Record<string, string> = {};
  const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b));

  for (const key of keys) {
    sorted[key] = obj[key];
  }

  return sorted;
}

/**
 * Clean unused entries
 */
export function cleanUnused(
  data: Record<string, string>,
  options: { removeUntranslated?: boolean } = {}
): Record<string, string> {
  const { removeUntranslated = false } = options;
  const cleaned: Record<string, string> = {};

  for (const key in data) {
    const value = data[key];

    // Skip empty values
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      continue;
    }

    // Skip untranslated entries if specified (value equals key)
    if (removeUntranslated && value === key) {
      continue;
    }

    cleaned[key] = value;
  }

  return cleaned;
}

/**
 * Check if string contains parameters
 */
function hasParams(str: string): boolean {
  return /\{[^}]+\}/.test(str);
}

/**
 * Extract parameters from string
 */
function extractParams(str: string): string[] {
  const params: string[] = [];
  const regex = /\{([^}]+)\}/g;
  let match;

  while ((match = regex.exec(str)) !== null) {
    params.push(match[1]);
  }

  return params.sort();
}

/**
 * Compare two arrays for equality
 */
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Read locale file
 */
export async function readLocaleFile(filePath: string): Promise<Record<string, string>> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}; // File doesn't exist, return empty object
    }
    throw error;
  }
}

/**
 * Write locale file
 */
export async function writeLocaleFile(
  filePath: string,
  data: Record<string, string>,
  options: { sort?: boolean; pretty?: boolean } = {}
): Promise<void> {
  const { sort = true, pretty = true } = options;

  const finalData = sort ? sortKeys(data) : data;
  const content = pretty
    ? JSON.stringify(finalData, null, 2)
    : JSON.stringify(finalData);

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content + '\n', 'utf-8');
}

/**
 * Batch update locale files
 */
export async function updateLocaleFiles(
  sourceFile: string,
  targetFiles: string[],
  options: UpdateLocaleOptions = {}
): Promise<Array<{ file: string; keys: number }>> {
  const source = await readLocaleFile(sourceFile);
  const results: Array<{ file: string; keys: number }> = [];

  for (const targetFile of targetFiles) {
    const target = await readLocaleFile(targetFile);
    const updated = updateLocale(source, target, options) as Record<string, string>;
    await writeLocaleFile(targetFile, updated);

    results.push({
      file: targetFile,
      keys: Object.keys(updated).length
    });
  }

  return results;
}

/**
 * Find missing translations between source and target
 */
export function findMissing(
  source: Record<string, string>,
  target: Record<string, string>
): string[] {
  const missing: string[] = [];

  for (const key in source) {
    if (!(key in target) || target[key] === key || target[key] === '') {
      missing.push(key);
    }
  }

  return missing;
}

/**
 * Find unused keys in target that don't exist in source
 */
export function findUnused(
  source: Record<string, string>,
  target: Record<string, string>
): string[] {
  const unused: string[] = [];

  for (const key in target) {
    if (!(key in source)) {
      unused.push(key);
    }
  }

  return unused;
}

/**
 * Get translation coverage statistics
 */
export function getCoverage(
  source: Record<string, string>,
  target: Record<string, string>
): {
  total: number;
  translated: number;
  missing: number;
  percentage: number;
} {
  const total = Object.keys(source).length;
  let translated = 0;

  for (const key in source) {
    if (key in target && target[key] !== key && target[key] !== '') {
      translated++;
    }
  }

  return {
    total,
    translated,
    missing: total - translated,
    percentage: total > 0 ? Math.round((translated / total) * 100) : 100
  };
}
