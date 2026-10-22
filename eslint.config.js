import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'supabase/.temp', 'supabase/.branches']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Tests, scripts and the edge-function modules run in Node and/or Deno (Web APIs), not the browser.
    files: ['tests/**/*.js', 'scripts/**/*.js', 'supabase/**/*.js', 'src/**/*.test.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
])
