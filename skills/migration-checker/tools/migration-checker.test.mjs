import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const checkers = [
  resolve('skills/migration-checker/tools/migration-checker.mjs'),
  resolve('skills/deploy/tools/migration-checker.mjs'),
];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'migration-checker-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { 'drizzle-orm': '1.0.0' } }));
  writeFileSync(join(root, 'drizzle.config.ts'), "export default { schema: './drizzle/schema.ts', out: './drizzle' };");
  mkdirSync(join(root, 'drizzle/meta'), { recursive: true });
  writeFileSync(join(root, 'drizzle/schema.ts'), 'export const schema = {};');
  writeFileSync(join(root, 'drizzle/0001_initial.sql'), 'SELECT 1;');
  writeFileSync(join(root, 'drizzle/0002_manual.sql'), 'SELECT 2;');
  writeFileSync(join(root, 'drizzle/helper.ts'), 'export const helper = true;');
  writeFileSync(join(root, 'drizzle/meta/_journal.json'), JSON.stringify({ entries: [{ tag: '0001_initial' }] }));
  return root;
}

for (const checker of checkers) {
  test(`${checker} reports Drizzle source layout without claiming database state`, () => {
    const root = fixture();
    try {
      const result = JSON.parse(execFileSync(process.execPath, [checker, root], { encoding: 'utf8' }));
      const drizzle = result.results.find(item => item.orm === 'drizzle');
      assert.equal(result.deploy_safe, null);
      assert.equal(result.database_state, 'not_checked');
      assert.equal(result.static_config_valid, true);
      assert.equal(drizzle.sql_file_count, 2);
      assert.equal(drizzle.journaled_migration_count, 1);
      assert.deepEqual(drizzle.schema_files, ['drizzle/schema.ts']);
      assert.deepEqual(drizzle.unjournaled_sql_files, ['0002_manual.sql']);
      assert.equal(drizzle.migrations.some(item => item.name === 'helper.ts'), false);
      assert.equal(result.findings.some(item => /pending migrations not yet applied/.test(item.message)), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
