import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'playwright-report', 'test-results', 'reference', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx,js}'],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks, import: importPlugin },
    settings: {
      'import/resolver': { node: { extensions: ['.ts', '.tsx', '.js', '.json'] } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Architecture boundaries (TDD §2).
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/engine',
              from: './src',
              except: ['./engine', './data/garments.json'],
              message: 'src/engine is pure: it may only import from src/engine.',
            },
            {
              target: './src/scene',
              from: './src/services',
              message: 'scene reads from state/selectors; it never calls services.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: '^[^.]', message: 'src/engine has no runtime dependencies.' }] },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'fetch'],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'src/engine is time-independent.' },
        { object: 'Math', property: 'random', message: 'src/engine is deterministic.' },
      ],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'three', message: 'Only src/scene may import three (keeps it lazy-loaded).' },
          ],
        },
      ],
    },
  },
);
