import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      'packages/database/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'off',
      'no-console': ['warn', { allow: ['error'] }],
    },
  },
  {
    // Boundary guard: domain/application code must not import infrastructure SDKs directly.
    files: ['apps/api/src/modules/**/domain/**/*.ts', 'apps/api/src/modules/**/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'bullmq', message: 'Infrastructure only. Depend on an application port instead.' },
            { name: 'ioredis', message: 'Infrastructure only. Depend on an application port instead.' },
            { name: '@prisma/client', message: 'Infrastructure only. Use a repository port.' },
            { name: '@atmp/database', message: 'Infrastructure only. Use a repository port.' },
          ],
        },
      ],
    },
  },
  prettier,
);
