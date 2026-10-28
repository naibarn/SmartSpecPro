#!/usr/bin/env node
// Copies tenant presentation configuration only; source connections are read-only.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { parse } from 'dotenv';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { decrypt } from '../server/services/crypto.ts';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceEnv = parse(readFileSync(resolve(appRoot, '.env')));
const devEnv = parse(readFileSync(process.env.SMARTSPEC_DEV_ENV_FILE || `${homedir()}/.config/smartspec-dev/web.env`));
const targetUrl = new URL(devEnv.DATABASE_URL);
const sourceUrl = new URL(sourceEnv.DATABASE_URL);
const targetDatabase = decodeURIComponent(targetUrl.pathname.replace(/^\//, ''));
const isolatedDevDatabase = targetUrl.pathname.endsWith('_dev_web') || targetDatabase === 'smartspec_dev';
if (devEnv.SMARTSPEC_ENVIRONMENT !== 'development' || !isolatedDevDatabase ||
    targetUrl.pathname === sourceUrl.pathname || devEnv.APP_URL !== 'https://aimarkethubs.com')
  throw new Error('An isolated aimarkethubs development database is required');
const apply = process.argv.includes('--apply');
const source = new pg.Client({ connectionString: sourceEnv.DATABASE_URL,
  options: '-c default_transaction_read_only=on', statement_timeout: 10000 });
const target = new pg.Client({ connectionString: devEnv.DATABASE_URL, statement_timeout: 10000 });
const evidence = `${homedir()}/.local/share/smartspec-dev/evidence`;
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const assetMap = new Map();
const omitted = new Set();
function transform(value, key = '') {
  if (/secret|password|credential|api.?key|access.?token|refresh.?token|private.?key/i.test(key)) {
    omitted.add(key); return undefined;
  }
  if (typeof value === 'string') {
    for (const [original, local] of assetMap) value = value.replaceAll(original, local);
    return value.replace(/https?:\/\/(?:www\.)?smartaihub\.app(?=[/:?#\s"']|$)/g, devEnv.APP_URL);
  }
  if (value instanceof Date || value === null) return value;
  if (Array.isArray(value)) return value.map(item => transform(item));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,transform(v,k)]).filter(([,v]) => v !== undefined));
  return value;
}
const fields = ['name','status','plan','description','logoUrl','websiteLogoUrl','faviconUrl',
  'seoConfig','themeConfig','contactInfo','settings','featureFlags',
  'max_users','max_projects','max_storage_gb','max_api_calls_per_month'];
const retiredFlag = /agency|workpack|workflow|opensandbox|sandbox/i;
async function upsertRows(table, rows, key, tenantId) {
  let count = 0;
  for (const row of rows) {
    const { id, tenantId: oldTenant, createdAt, updatedAt, ...rest } = row;
    const values = { ...transform(rest), tenantId };
    const existing = await target.query(`SELECT id FROM "${table}" WHERE "tenantId"=$1 AND "${key}"=$2`, [tenantId, values[key]]);
    const columns = Object.keys(values);
    // JSON arrays must be JSON text, not PostgreSQL array parameters.
    const params = columns.map(k => values[k] !== null && typeof values[k] === 'object' ? JSON.stringify(values[k]) : values[k]);
    if (existing.rowCount) {
      await target.query(`UPDATE "${table}" SET ${columns.map((k,i)=>`"${k}"=$${i+1}`).join(',')}, "updatedAt"=now() WHERE "tenantId"=$${params.length+1} AND "${key}"=$${params.length+2}`, [...params, tenantId, values[key]]);
    } else {
      await target.query(`INSERT INTO "${table}" (${columns.map(k=>`"${k}"`).join(',')}) VALUES (${params.map((_,i)=>`$${i+1}`).join(',')})`,params);
    }
    count++;
  }
  return count;
}
try {
  await source.connect(); await target.connect();
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const src = (await source.query('SELECT * FROM tenants WHERE "primaryDomain"=$1',['smartaihub.app'])).rows;
  const dst = (await target.query(
    'SELECT * FROM tenants WHERE "primaryDomain"=$1 OR domains::jsonb @> $2::jsonb',
    ['aimarkethubs.com', JSON.stringify(['aimarkethubs.com'])],
  )).rows;
  if (src.length !== 1 || dst.length !== 1 || src[0].id === dst[0].id) throw new Error('Unique separate tenants required');
  const sourceTenant = src[0], devTenant = dst[0];
  const pages = (await source.query('SELECT * FROM tenant_pages WHERE "tenantId"=$1 ORDER BY id',[sourceTenant.id])).rows;
  const seo = (await source.query('SELECT * FROM seo_metadata WHERE "tenantId"=$1 ORDER BY id',[sourceTenant.id])).rows;
  const assetPaths = [...new Set(JSON.stringify([sourceTenant,pages,seo]).match(/\/api\/storage\/files\/[^"\s<>\\)]+/g)||[])];
  const assets = [];
  if (apply && assetPaths.length) {
    const storage = (await source.query('SELECT * FROM storage_settings WHERE "isActive"=true')).rows;
    if (storage.length !== 1 || !['r2','s3'].includes(storage[0].providerType)) throw new Error('Expected one R2/S3 source for public branding assets');
    const s = storage[0];
    const client = new S3Client({ endpoint:s.endpoint, region:s.region||'auto',
      credentials: { accessKeyId:decrypt(s.accessKeyIdEncrypted,sourceEnv.LLM_ENCRYPTION_KEY), secretAccessKey:decrypt(s.secretAccessKeyEncrypted,sourceEnv.LLM_ENCRYPTION_KEY) },
      forcePathStyle:s.configJson?.forcePathStyle??false });
    try {
      for (const assetPath of assetPaths) {
        const key = decodeURI(assetPath.slice('/api/storage/files/'.length));
        if (!key.startsWith(`tenants/${sourceTenant.id}/`) || key.includes('..') || !/\.(png|jpe?g|webp|gif|ico)$/i.test(key)) throw new Error('Only public tenant branding images may be copied');
        const object = await client.send(new GetObjectCommand({ Bucket:s.bucket, Key:key }));
        const bytes = Buffer.from(await object.Body.transformToByteArray());
        if (bytes.length > 10*1024*1024) throw new Error('Branding image too large');
        const digest = hash(bytes), filename = `${digest}${extname(key)}`;
        mkdirSync(resolve(appRoot,'client/public/dev-tenant-assets'),{recursive:true});
        writeFileSync(resolve(appRoot,'client/public/dev-tenant-assets',filename),bytes);
        const local = `/dev-tenant-assets/${filename}?v=${digest.slice(0,8)}`; assetMap.set(assetPath,local);
        assets.push({path:local,sha256:digest,bytes:bytes.length});
      }
    } finally { client.destroy(); }
  }
  const config = Object.fromEntries(fields.filter(k=>k in sourceTenant).map(k=>[k,transform(sourceTenant[k],k)]));
  const disabledRetiredFlags = Object.keys(config.featureFlags||{}).filter(k=>retiredFlag.test(k));
  for (const key of disabledRetiredFlags) config.featureFlags[key] = false;
  const report = {observedAt:new Date().toISOString(),applied:apply,sourceDomain:'smartaihub.app',targetDomain:'aimarkethubs.com',sourceReadOnly:true,tenantIdPreserved:true,pages:pages.length,seo:seo.length,configFields:Object.keys(config),disabledRetiredFlags,omittedSensitiveKeys:[...omitted],assets};
  if (apply) {
    await target.query('BEGIN');
    const lock = await target.query("SELECT pg_try_advisory_xact_lock(hashtext('dev-tenant-config-sync')) AS acquired");
    if (!lock.rows[0].acquired) throw new Error('Another tenant config sync is active');
    mkdirSync(evidence,{recursive:true,mode:0o700});
    const before = {tenant:devTenant,pages:(await target.query('SELECT * FROM tenant_pages WHERE "tenantId"=$1',[devTenant.id])).rows,seo:(await target.query('SELECT * FROM seo_metadata WHERE "tenantId"=$1',[devTenant.id])).rows};
    const backup = `${evidence}/tenant-before-${Date.now()}.json`;
    writeFileSync(backup,JSON.stringify(before),{mode:0o600}); report.backup = backup;
    const cols=Object.keys(config), vals=cols.map(k=>config[k]!==null && typeof config[k]==='object'?JSON.stringify(config[k]):config[k]);
    await target.query(`UPDATE tenants SET ${cols.map((k,i)=>`"${k}"=$${i+1}`).join(',')},"updatedAt"=now() WHERE id=$${vals.length+1}`,[...vals,devTenant.id]);
    await upsertRows('tenant_pages',pages,'pageKey',devTenant.id);
    await upsertRows('seo_metadata',seo,'path',devTenant.id);
    const actual=(await target.query('SELECT * FROM tenants WHERE id=$1',[devTenant.id])).rows[0];
    if(actual.primaryDomain!==devTenant.primaryDomain || actual.ownerId!==devTenant.ownerId || actual.slug!==devTenant.slug) throw new Error('Dev identity was altered');
    for(const field of cols) if(JSON.stringify(actual[field])!==JSON.stringify(config[field])) throw new Error(`Config verification failed: ${field}`);
    for(const [table,rows,key] of [['tenant_pages',pages,'pageKey'],['seo_metadata',seo,'path']]) {
      const got=(await target.query(`SELECT * FROM "${table}" WHERE "tenantId"=$1`,[devTenant.id])).rows;
      for(const row of rows) {
        const expected=transform(row), match=got.find(x=>x[key]===row[key]);
        for(const field of Object.keys(expected).filter(k=>!['id','tenantId','createdAt','updatedAt'].includes(k)))
          if(JSON.stringify(match?.[field])!==JSON.stringify(expected[field])) throw new Error(`Content verification failed: ${table}.${row[key]}.${field}`);
      }
    }
    await target.query('COMMIT');
    report.verified = true; report.configDigest = hash(config);
    writeFileSync(`${evidence}/tenant-config-sync.json`,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  }
  await source.query('COMMIT');
  console.log(JSON.stringify(report));
} catch(error) {
  await target.query('ROLLBACK').catch(()=>{});
  // Driver/cloud errors may contain connection details; show a bounded message.
  console.error(`Tenant sync failed (${error.code || error.name}): ${error.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]')}`);
  process.exitCode=1;
} finally { await source.end(); await target.end(); }
