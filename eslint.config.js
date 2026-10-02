import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'build',
      'coverage',
      'node_modules',
      'legacy',
      'intermediate-findings',
    ],
  },
  ...tseslint.configs.recommended.map(cfg => ({
    ...cfg,
    files: ['src/**/*.ts', 'test/**/*.ts'],
  })),
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
