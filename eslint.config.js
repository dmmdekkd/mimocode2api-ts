import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/', 'dist/', '*.cjs', 'eslint.config.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        Bun: 'readonly',
        crypto: 'readonly',
      },
    },
    rules: {
      // Loose typing: relax TS-specific strictness to match the project's loose-style policy.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-unused-vars': 'off',
      'prefer-const': 'warn',
      'no-undef': 'off',
    },
  },
);
