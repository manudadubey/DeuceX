// @ts-check
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'Documents/**',
      'docs/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Only packages/actions may reach vendor SDKs with real side effects (Stripe, Resend, ICS, entry clients).
      // Every other package is blocked from importing them directly, per TECH-ARCHITECTURE section 3.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'stripe',
              message:
                'Only packages/actions may import Stripe. Route side effects through the actions module.',
            },
            {
              name: 'resend',
              message:
                'Only packages/actions may import Resend. Route side effects through the actions module.',
            },
            {
              name: 'ics',
              message:
                'Only packages/actions may import ics. Route side effects through the actions module.',
            },
            {
              name: 'web-push',
              message:
                'Only packages/actions may import web-push. Route side effects through the actions module.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/actions/**'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
);
