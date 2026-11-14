import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig([
  // Check handwritten code and skip compiler output and the generated Prisma client.
  { ignores: ['**/dist/**', '**/cdk.out/**', 'apps/api/src/generated/prisma/**'] },
  {
    files: ['apps/**/*.mjs'],
    extends: [js.configs.recommended],
  },
  {
    files: ['apps/api/integration/**/*.mjs'],
    // Node provides fetch for HTTP requests from integration tests.
    languageOptions: { globals: { fetch: 'readonly' } },
  },
  {
    files: ['apps/**/*.{ts,tsx}', 'infra/**/*.ts'],
    // The spread (...) adds each TypeScript rule configuration to the array.
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
  },
])
