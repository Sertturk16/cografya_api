// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Global ignores. Root config files are ESM/JS tooling, not part of the
    // typed program — keep them out of the type-aware lint pass.
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      'eslint.config.mjs',
      'commitlint.config.mjs',
      'lint-staged.config.mjs',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // Boundary: never ship an `any`, never let a promise float.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
    },
  },
  {
    // `tools/` is ESM run directly by Node's type stripping (it uses `import.meta`), so
    // it needs `sourceType: 'module'` unlike the CommonJS application code.
    files: ['tools/**/*.ts'],
    languageOptions: {
      sourceType: 'module',
    },
  },
  {
    // Test files only. Test tooling surfaces `any` at its boundaries
    // (supertest's `res.body`, `app.getHttpServer()`, jest matchers), so relax
    // the unsafe-any family for specs. Production code keeps the full strict
    // boundary. `no-explicit-any` stays ON — we still never WRITE an explicit
    // any, we only tolerate any flowing in from typed-as-any library surfaces.
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
);
