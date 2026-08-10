import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const PERSISTENCE_AND_TRANSPORT = [
  { name: 'bullmq', message: 'Infrastructure only. Depend on an application port instead.' },
  { name: 'ioredis', message: 'Infrastructure only. Depend on an application port instead.' },
  {
    name: '@prisma/client',
    message: 'Import the @atmp/database boundary from an infrastructure adapter instead.',
  },
];

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
      'no-console': ['warn', { allow: ['error'] }],
    },
  },
  {
    // CommonJS tooling files (jest configs). Without this, no-undef flags module.
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'writable',
        require: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
  {
    // Domain is pure: no persistence, no queues, no HTTP, no provider SDKs.
    files: ['apps/api/src/modules/**/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...PERSISTENCE_AND_TRANSPORT,
            { name: '@atmp/database', message: 'Domain must not know about persistence.' },
            { name: '@nestjs/platform-express', message: 'Domain must not know about transport.' },
          ],
        },
      ],
    },
  },
  {
    // Application orchestrates use cases. It may reach persistence only through
    // the @atmp/database boundary, never a raw provider SDK or queue client.
    files: ['apps/api/src/modules/**/application/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: PERSISTENCE_AND_TRANSPORT }],
    },
  },
  prettier,
);
