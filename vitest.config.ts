import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/core/**/*.ts',
        'src/docs/**/*.ts',
        'src/mock/**/*.ts',
        'src/runner/**/*.ts',
        'src/replica/**/*.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.test-util.ts', '**/*.gen.ts', '**/index.ts'],
      reporter: ['text-summary', 'text', 'html'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 90 },
    },
  },
});
