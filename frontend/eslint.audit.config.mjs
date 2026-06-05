/**
 * Standalone "audit" ESLint config — NOT used by the production build.
 *
 * Run manually:  yarn lint:audit
 *
 * It only surfaces the two recurring patterns flagged in code reviews so they
 * can be tracked over time without ever failing the CRA build (which turns
 * ESLint warnings into errors when CI=true). Keep this separate on purpose.
 */
import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    files: ['src/**/*.{js,jsx}'],
    ignores: ['src/**/*.test.{js,jsx}', '**/node_modules/**', 'build/**'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        localStorage: 'readonly', fetch: 'readonly', console: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly',
        clearInterval: 'readonly', crypto: 'readonly', process: 'readonly',
        FormData: 'readonly', Blob: 'readonly', URL: 'readonly', alert: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
      },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    // Only the two review rules matter here — everything else is silenced so the
    // report is signal, not noise.
    rules: {
      'react/no-array-index-key': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
];
