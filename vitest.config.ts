import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    testTimeout: 30000,
    fileParallelism: false,
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/cli.ts', // CLI is tested via integration tests
        'src/plugins/types.ts' // Type definitions only
      ],
      thresholds: {
        statements: 85,
        branches: 70,
        functions: 90,
        lines: 85
      }
    }
  }
});
