import { defineConfig } from 'vitest/config';

// Testes de integração: runners Python e PowerShell contra o mock (M2). Lentos; fora do `npm test`.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    testTimeout: 300_000,
    hookTimeout: 30_000,
  },
});
