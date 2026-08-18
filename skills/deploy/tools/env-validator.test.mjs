import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const validatorPath = join(dirname(fileURLToPath(import.meta.url)), 'env-validator.mjs');
const projectManifestPath = [
  join(process.cwd(), '.env-validator.json'),
  join(dirname(validatorPath), '..', '..', '..', '.env-validator.json'),
].find((path) => existsSync(path));

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'env-validator-'));
  writeFileSync(join(dir, '.gitignore'), '.env\n');
  return dir;
}

function write(dir, path, content) {
  const fullPath = join(dir, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function run(dir) {
  return JSON.parse(execFileSync(process.execPath, [validatorPath, dir], { encoding: 'utf8' }));
}

test('keeps legacy heuristic behavior when no manifest exists', () => {
  const dir = fixture();
  try {
    write(dir, '.env.example', 'REQUIRED=\nOPTIONAL=\n');
    write(dir, '.env', 'REQUIRED=set\nOPTIONAL=\n');
    const result = run(dir);
    assert.equal(result.validation_mode, 'heuristic');
    assert.equal(result.deploy_ready, false);
    assert.deepEqual(result.findings.map((finding) => finding.variable), ['OPTIONAL']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validates independent service targets and ignores classified non-env settings', () => {
  const dir = fixture();
  try {
    write(dir, '.env-validator.json', JSON.stringify({
      version: 1,
      targets: [
        {
          name: 'web',
          env_files: ['apps/web/.env'],
          required: [{ variable: 'JWT_SECRET', min_length: 8 }],
        },
        {
          name: 'backend',
          env_files: ['python-backend/.env'],
          required: [
            { variable: 'ENVIRONMENT', equals: 'production' },
            { variable: 'LOG_LEVEL', forbidden_values: ['DEBUG'] },
          ],
          checks: [{ variable: 'STRIPE_SECRET_KEY', forbidden_prefixes: ['sk_test_'] }],
        },
      ],
      classifications: {
        ui_managed: ['OPENAI_API_KEY'],
        defaulted: ['RENDER_TIMEOUT_MS'],
        machine_local: ['FFMPEG_BINARY'],
      },
    }));
    write(dir, 'apps/web/.env', 'JWT_SECRET=long-enough-secret\n');
    write(dir, 'python-backend/.env', 'ENVIRONMENT=production\nLOG_LEVEL=INFO\n');
    const result = run(dir);
    assert.equal(result.validation_mode, 'manifest');
    assert.equal(result.deploy_ready, true);
    assert.equal(result.total_required, 3);
    assert.equal(result.total_optional_checks, 1);
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.classifications.ui_managed, ['OPENAI_API_KEY']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reports target-scoped production policy failures without exposing values', () => {
  const dir = fixture();
  try {
    write(dir, '.env-validator.json', JSON.stringify({
      version: 1,
      targets: [{
        name: 'backend',
        env_files: ['backend/.env'],
        required: [
          { variable: 'JWT_SECRET', min_length: 32 },
          { variable: 'ENVIRONMENT', equals: 'production' },
          { variable: 'LOG_LEVEL', forbidden_values: ['DEBUG'] },
        ],
        checks: [{ variable: 'STRIPE_SECRET_KEY', forbidden_prefixes: ['sk_test_'] }],
      }],
    }));
    write(dir, 'backend/.env', 'JWT_SECRET=short\nENVIRONMENT=development\nLOG_LEVEL=DEBUG\nSTRIPE_SECRET_KEY=sk_test_redacted\n');
    const result = run(dir);
    assert.equal(result.deploy_ready, false);
    assert.deepEqual(result.findings.map((finding) => finding.status), [
      'too_short',
      'unexpected_value',
      'forbidden_value',
      'forbidden_prefix',
    ]);
    assert.equal(JSON.stringify(result).includes('development'), false);
    assert.equal(JSON.stringify(result).includes('JWT_SECRET=short'), false);
    assert.equal(JSON.stringify(result).includes('sk_test_redacted'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects manifest env paths that escape the project directory', () => {
  const dir = fixture();
  try {
    write(dir, '.env-validator.json', JSON.stringify({
      version: 1,
      targets: [{ name: 'bad', env_files: ['../outside.env'], required: ['JWT_SECRET'] }],
    }));
    const result = run(dir);
    assert.equal(result.success, false);
    assert.equal(result.deploy_ready, false);
    assert.match(result.error, /escapes project directory/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('SmartSpecPro policy removes the former 18 false blockers', {
  skip: projectManifestPath ? false : 'SmartSpecPro manifest is not available from this runtime',
}, () => {
  const dir = fixture();
  try {
    write(dir, '.env-validator.json', readFileSync(projectManifestPath, 'utf8'));
    write(dir, 'apps/web/.env', [
      'DATABASE_URL=postgresql://db/web',
      `JWT_SECRET=${'w'.repeat(32)}`,
      `LLM_ENCRYPTION_KEY=${'e'.repeat(32)}`,
      '',
    ].join('\n'));
    write(dir, 'python-backend/.env', [
      'DATABASE_URL=postgresql://db/backend',
      `SECRET_KEY=${'s'.repeat(32)}`,
      `JWT_SECRET=${'j'.repeat(32)}`,
      `ENCRYPTION_MASTER_KEY=${'m'.repeat(32)}`,
      'ENVIRONMENT=production',
      'DEBUG=false',
      'LOG_LEVEL=INFO',
      '',
    ].join('\n'));
    const result = run(dir);
    assert.equal(result.deploy_ready, true);
    assert.equal(result.findings.length, 0);
    assert.equal(Object.values(result.classifications).flat().length, 18);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
