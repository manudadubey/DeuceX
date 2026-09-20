// Step 0.6 acceptance check: "a test shows the lint rule fails a build that
// imports Stripe elsewhere." Runs the real root eslint.config.mjs
// programmatically rather than just asserting the config file's shape, so a
// future edit that accidentally loosens the rule (or the files: [] scoping
// that exempts packages/actions) actually fails this test.
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const ROOT_CONFIG = fileURLToPath(new URL('../../../eslint.config.mjs', import.meta.url));

async function lint(filePath: string, code: string) {
  const eslint = new ESLint({ overrideConfigFile: ROOT_CONFIG });
  const results = await eslint.lintText(code, { filePath });
  return results[0]?.messages ?? [];
}

describe.each(['stripe', 'resend', 'ics'])('no-restricted-imports for %s', (moduleName) => {
  const code = `import x from '${moduleName}';\n`;

  it('fails outside packages/actions', async () => {
    const messages = await lint('apps/web/lib/example.ts', code);
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
    expect(messages.some((m) => m.message.includes('packages/actions'))).toBe(true);
  });

  it('is allowed inside packages/actions', async () => {
    const messages = await lint('packages/actions/src/example.ts', code);
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(false);
  });
});
