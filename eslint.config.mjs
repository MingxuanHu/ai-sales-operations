import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig([
  // Ignore generated JavaScript. The rules below check the handwritten app code.
  { ignores: ['**/dist/**'] },
  {
    files: ['apps/**/*.mjs'],
    extends: [js.configs.recommended],
  },
  {
    files: ['apps/**/*.{ts,tsx}'],
    // The spread (...) adds each TypeScript rule configuration to the array.
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
  },
])
