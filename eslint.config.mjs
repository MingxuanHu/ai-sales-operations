import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig([
  { ignores: ['**/dist/**'] },
  {
    files: ['apps/**/*.mjs'],
    extends: [js.configs.recommended],
  },
  {
    files: ['apps/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
  },
])
