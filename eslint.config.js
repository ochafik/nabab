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
  // Legacy first-generation port (not referenced by any build entry).
  // Kept for reference; relaxed rules until it is removed.
  {
    files: [
      'src/main.ts',
      'src/d3_network.ts',
      'src/network.ts',
      'src/variable.ts',
      'src/request.ts',
      'src/xmlbif_parser.ts',
      'src/asserts.ts',
      'src/graph/**/*.ts',
      'src/collections/**/*.ts',
      'src/inference/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);
