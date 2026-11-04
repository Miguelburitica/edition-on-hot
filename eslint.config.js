import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

const root = import.meta.dirname;

const core = '**/packages/core/src';
const ext = '**/packages/extension/src';

/** Each layer lists what it may import. Contexts meet only through another context's application API. */
const allow = {
  'shared-domain': ['shared-domain'],
  'editing-domain': ['shared-domain', 'editing-domain'],
  'editing-application': ['shared-domain', 'editing-domain', 'editing-application'],
  'editing-infrastructure': ['shared-domain', 'editing-domain', 'editing-application', 'editing-infrastructure', 'ai-application'],
  'ai-domain': ['shared-domain', 'ai-domain'],
  'ai-application': ['shared-domain', 'ai-domain', 'ai-application'],
  'ai-infrastructure': ['shared-domain', 'ai-domain', 'ai-infrastructure'],
  'ext-infrastructure': ['shared-domain', 'editing-domain', 'editing-application', 'editing-infrastructure', 'ai-domain', 'ai-application', 'ext-infrastructure'],
  'ext-presentation': ['editing-application', 'ai-application', 'ext-infrastructure', 'ext-presentation'],
  'ext-composition': [
    'shared-domain',
    'editing-domain',
    'editing-application',
    'editing-infrastructure',
    'ai-domain',
    'ai-application',
    'ai-infrastructure',
    'ext-infrastructure',
    'ext-presentation',
    'ext-composition',
  ],
  'ext-entrypoint': ['ext-composition', 'ext-presentation'],
  // The eval harness is a composition root running in Node: it may wire every core layer.
  eval: [
    'shared-domain',
    'editing-domain',
    'editing-application',
    'editing-infrastructure',
    'ai-domain',
    'ai-application',
    'ai-infrastructure',
    'eval',
  ],
};

const elements = [
  { type: 'shared-domain', pattern: `${core}/shared/domain/**`, partialMatch: false },
  ...['editing', 'ai'].flatMap((ctx) =>
    ['domain', 'application', 'infrastructure'].map((layer) => ({
      type: `${ctx}-${layer}`,
      pattern: `${core}/${ctx}/${layer}/**`,
      partialMatch: false,
    })),
  ),
  { type: 'ext-infrastructure', pattern: `${ext}/infrastructure/**`, partialMatch: false },
  { type: 'ext-presentation', pattern: `${ext}/presentation/**`, partialMatch: false },
  { type: 'ext-composition', pattern: `${ext}/composition/**`, partialMatch: false },
  { type: 'ext-entrypoint', pattern: `${ext}/entrypoints/**`, partialMatch: false },
  { type: 'eval', pattern: '**/packages/eval/src/**', partialMatch: false },
];

const pureLayers = ['packages/core/src/**/domain/**/*.ts', 'packages/core/src/**/application/**/*.ts'];

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/.output/**', '**/.wxt/**', '**/dist/**', '**/test-results/**', '**/playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Playwright fixtures must destructure an empty object to declare no dependencies.
    files: ['packages/*/e2e/**/*.ts'],
    rules: { 'no-empty-pattern': 'off' },
  },
  {
    files: ['packages/*/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': elements,
      'boundaries/root-path': root,
      'boundaries/include': ['packages/*/src/**/*'],
      'import/resolver': {
        typescript: { project: [`${root}/packages/*/tsconfig.json`], noWarnOnMultipleProjects: true },
      },
    },
    rules: {
      'boundaries/no-unknown-files': 'error',
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: Object.entries(allow).map(([from, to]) => ({
            from: { element: { type: from } },
            allow: { to: { element: { types: to } } },
          })),
        },
      ],
    },
  },
  {
    files: pureLayers,
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['zod', 'dompurify', 'react', 'react-dom', '@anthropic-ai/*', 'wxt', 'wxt/*', '@wxt-dev/*'],
              message: 'Domain and application layers stay framework-free; use a port and implement it in infrastructure.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...['document', 'window', 'chrome', 'browser', 'fetch', 'localStorage', 'sessionStorage', 'navigator', 'crypto'].map(
          (name) => ({ name, message: `"${name}" is infrastructure; reach it through a port.` }),
        ),
      ],
    },
  },
);
