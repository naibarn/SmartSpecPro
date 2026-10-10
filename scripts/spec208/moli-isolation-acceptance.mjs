import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const allProxyRequests = [];
const deniedProxyRequests = [];
const deniedProxyUpgrades = [];
const proxy = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://proxy.invalid');
  const authorizationPresent = req.headers['proxy-authorization'] !== undefined;
  allProxyRequests.push({ method: req.method, target: req.url, host: req.headers.host, authorizationPresent });
  const allowed = url.hostname === 'fixture.spec208.invalid' && url.pathname === '/acceptance' && !authorizationPresent;
  if (!allowed) {
    deniedProxyRequests.push({ method: req.method, target: req.url, authorizationPresent });
    res.writeHead(403, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
    res.end('DENIED_BY_NON_PRODUCTION_EGRESS_PROXY');
    return;
  }
  const attempt = url.searchParams.get('attempt');
  const cdpPort = Number(url.searchParams.get('cdp'));
  if (!['tenant-a', 'tenant-b'].includes(attempt) || ![9222, 9223].includes(cdpPort)) {
    res.writeHead(400); res.end('bad fixture request'); return;
  }
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'set-cookie': `http_only_attempt=${attempt}; HttpOnly; SameSite=Lax; Path=/`,
  });
  res.end(`<!doctype html><html><head><title>SPEC208_ACCEPTANCE_${attempt}</title></head><body><main id="result">MOLI_SYNTHETIC_DOM_RESULT_${attempt}</main><script>
    const attempt = ${JSON.stringify(attempt)};
    const cdpPort = ${JSON.stringify(cdpPort)};
    if (!localStorage.getItem('tenant-marker')) localStorage.setItem('tenant-marker', attempt);
    document.cookie = document.cookie || 'script_attempt=' + attempt + '; SameSite=Lax; Path=/';
    const dbRequest = indexedDB.open('spec208-tenant-check', 1);
    dbRequest.onupgradeneeded = () => dbRequest.result.createObjectStore('state');
    dbRequest.onsuccess = () => { const tx = dbRequest.result.transaction('state', 'readwrite'); const store = tx.objectStore('state'); const get = store.get('marker'); get.onsuccess = () => { if (!get.result) store.put(attempt, 'marker'); }; };
    window.protocolProbe = { fetch: 'pending', bidi: 'pending', egress: 'pending', metadata: 'pending' };
    fetch('http://127.0.0.1:' + cdpPort + '/session', { method: 'GET', mode: 'no-cors', signal: AbortSignal.timeout(2500) })
      .then(response => { window.protocolProbe.fetch = (response.status === 403 || response.type === 'opaque') ? 'blocked' : 'connected'; })
      .catch(() => { window.protocolProbe.fetch = 'blocked'; });
    try {
      const bidi = new WebSocket('ws://127.0.0.1:' + cdpPort + '/session');
      bidi.onopen = () => { window.protocolProbe.bidi = 'connected'; bidi.close(); };
      bidi.onerror = () => { window.protocolProbe.bidi = 'blocked'; };
      setTimeout(() => { if (window.protocolProbe.bidi === 'pending') window.protocolProbe.bidi = 'timeout'; }, 2500);
    } catch (_) { window.protocolProbe.bidi = 'blocked'; }
    fetch('http://example.com/', { mode: 'no-cors', signal: AbortSignal.timeout(2500) })
      .then(response => { window.protocolProbe.egress = (response.status === 403 || response.type === 'opaque') ? 'blocked' : 'connected'; })
      .catch(() => { window.protocolProbe.egress = 'blocked'; });
    fetch('http://169.254.169.254/latest/meta-data/', { mode: 'no-cors', signal: AbortSignal.timeout(2500) })
      .then(response => { window.protocolProbe.metadata = (response.status === 403 || response.type === 'opaque') ? 'blocked' : 'connected'; })
      .catch(() => { window.protocolProbe.metadata = 'blocked'; });
    if ('caches' in window) caches.open('spec208-tenant-check').then(cache => cache.match('/tenant-marker').then(found => found || cache.put('/tenant-marker', new Response(attempt)))).catch(() => {});
  </script></body></html>`);
});
proxy.on('connect', (req, socket) => {
  socket.on('error', () => {});
  deniedProxyRequests.push({ method: 'CONNECT', target: req.url, authorizationPresent: req.headers['proxy-authorization'] !== undefined });
  socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
});
proxy.on('upgrade', (req, socket) => {
  socket.on('error', () => {});
  deniedProxyUpgrades.push({ target: req.url, host: req.headers.host });
  socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
});
proxy.on('clientError', (_error, socket) => { socket.on('error', () => {}); socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); });
await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(18080, '127.0.0.1', resolve); });

function cdp(socket, method, params = {}, sessionId) {
  const id = ++socket.nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.pending.delete(id); reject(new Error(`CDP_TIMEOUT:${method}`)); }, 8000);
    socket.pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

function nextRunnerMessage(runtime, timeoutMs = 10_000) {
  if (runtime.stdoutBuffer.includes('\n')) {
    const end = runtime.stdoutBuffer.indexOf('\n');
    const line = runtime.stdoutBuffer.slice(0, end);
    runtime.stdoutBuffer = runtime.stdoutBuffer.slice(end + 1);
    return Promise.resolve(JSON.parse(line));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('RUNNER_MESSAGE_TIMEOUT')), timeoutMs);
    runtime.waiters.push(message => { clearTimeout(timer); resolve(message); });
    runtime.child.once('exit', code => { clearTimeout(timer); reject(new Error(`RUNNER_EXIT_BEFORE_MESSAGE:${code}:${runtime.stderr.join('').slice(-2000)}`)); });
  });
}

async function runRejectedRunnerCase(attempt, expectedError, overrides = {}) {
  const runtimeDigest = process.env.SPEC208_RUNTIME_IMAGE_DIGEST;
  const deadline = new Date(Date.now() + (overrides.deadlineOffsetMs ?? 60_000)).toISOString();
  const jobId = `spec208-${attempt}`;
  const leaseId = `lease-${attempt}`;
  const command = {
    commandId: `command-${attempt}`, commandType: 'execute', contractVersion: 'runner-job-v1', jobId,
    attempt: 1, leaseId, fencingToken: overrides.commandFence ?? 1, tenantId: attempt, userId: 1,
    runnerId: 'spec208-rootless-runner', runnerSessionId: `session-${attempt}`,
    capabilitySnapshotId: 'spec208-test-capabilities', capabilitySnapshotRevision: '1',
    controlPlaneOrigin: 'https://spec208.invalid', executionKind: 'computer_use.moli.acceptance',
    adapterId: 'moli.acceptance.v1', adapterVersionConstraint: '1.1.15', browserEngineConstraint: null,
    idempotencyKey: `moli:${attempt}:1`, deadline, authorizationGrantRef: `grant-${attempt}`,
    inputRef: `synthetic:${attempt}`, payload: { nonProductionTestAuthority: 'spec208-rootless-acceptance-v1', runtimeDigest },
  };
  const lease = { jobId, attemptId: '1', leaseId, fencingVersion: overrides.leaseFence ?? 1, expiresAtMs: Date.now() + (overrides.leaseExpiresOffsetMs ?? 60_000) };
  const expectedLease = { ...lease, fencingVersion: overrides.expectedFence ?? lease.fencingVersion };
  const request = {
    command, lease, expectedLease,
    binding: {
      runnerId: command.runnerId, tenantId: command.tenantId, runnerSessionId: command.runnerSessionId,
      capabilitySnapshotId: command.capabilitySnapshotId, capabilitySnapshotRevision: command.capabilitySnapshotRevision,
      controlPlaneOrigin: command.controlPlaneOrigin, capabilityExpiresAt: deadline,
      browserReady: false, authorizationGrantRef: command.authorizationGrantRef,
    }, runtimeDigest, expectedMoliSha256: overrides.expectedMoliSha256 ?? process.env.SPEC208_MOLI_SHA256,
    moliPath: overrides.moliPath ?? '/usr/bin/moli',
    profilePath: `/profile/${crypto.createHash('sha256').update(`${attempt}:1`).digest('hex')}`, port: 9290,
  };
  const child = spawn('/usr/bin/smartaihub-runner', ['__sah-spec208-moli-acceptance'], {
    cwd: '/profile', env: {
      PATH: '/usr/bin', HOME: '/profile', TMPDIR: '/tmp', SAH_RUNNER_PROFILE: 'shared_container',
      SAH_RUNNER_ID: command.runnerId, SAH_RUNNER_JOB_ID: jobId, SAH_RUNNER_ATTEMPT_ID: '1',
      SAH_RUNNER_LEASE_ID: leaseId, SPEC208_TEST_AUTHORITY: 'spec208-rootless-acceptance-v1',
      SPEC208_RUNTIME_IMAGE_DIGEST: runtimeDigest,
    }, stdio: ['pipe', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdin.end(`${JSON.stringify(request)}\n`);
  const exitCode = await new Promise(resolve => child.once('exit', resolve));
  if (exitCode !== 3 || !stderr.includes(expectedError)) throw new Error(`NEGATIVE_CASE_FAILED:${attempt}:${exitCode}:${stderr}`);
  return { attempt, exitCode, error: expectedError, profileAbsent: !fs.existsSync(request.profilePath) };
}

async function runRunnerNegativeCases() {
  const staleFence = await runRejectedRunnerCase('tenant-stale-fence', 'RUNNER_LEASE_FENCE_MISMATCH', { expectedFence: 2 });
  const expiredDeadline = await runRejectedRunnerCase('tenant-expired-deadline', 'RUNNER_COMMAND_DEADLINE_EXPIRED', { deadlineOffsetMs: -1000 });
  const expiredLease = await runRejectedRunnerCase('tenant-expired-lease', 'RUNNER_LEASE_EXPIRED', { leaseExpiresOffsetMs: -1000 });
  const fakeMoli = `/tmp/spec208-failed-moli-${process.pid}`;
  fs.writeFileSync(fakeMoli, '#!/bin/sh\nexit 0\n', { mode: 0o555, flag: 'wx' });
  try {
    fs.chmodSync(fakeMoli, 0o555);
    const bytes = fs.readFileSync(fakeMoli);
    const failedStartup = await runRejectedRunnerCase('tenant-failed-startup', 'RUNNER_MOLI_START_FAILED', {
      moliPath: fakeMoli, expectedMoliSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    });
    return { staleFence, expiredDeadline, expiredLease, failedStartup };
  } finally { fs.rmSync(fakeMoli, { force: true }); }
}

async function startMoli(attempt, port) {
  const runnerOwned = process.env.SPEC208_RUNNER_ACCEPTANCE === '1';
  const profile = runnerOwned
    ? `/profile/${crypto.createHash('sha256').update(`${attempt}:1`).digest('hex')}`
    : `/profile/${attempt}`;
  if (!runnerOwned) {
    fs.mkdirSync(profile, { mode: 0o700 });
    fs.writeFileSync(`${profile}/runner-owned-marker`, attempt, { mode: 0o600, flag: 'wx' });
  }
  if (runnerOwned) {
    const runtimeDigest = process.env.SPEC208_RUNTIME_IMAGE_DIGEST;
    const jobId = `spec208-${attempt}`;
    const attemptId = '1';
    const leaseId = `lease-${attempt}`;
    const deadline = new Date(Date.now() + 75_000).toISOString();
    const command = {
      commandId: `command-${attempt}`, commandType: 'execute', contractVersion: 'runner-job-v1',
      jobId, attempt: 1, leaseId, fencingToken: 1, tenantId: attempt, userId: 1,
      runnerId: 'spec208-rootless-runner', runnerSessionId: `session-${attempt}`,
      capabilitySnapshotId: 'spec208-test-capabilities', capabilitySnapshotRevision: '1',
      controlPlaneOrigin: 'https://spec208.invalid', executionKind: 'computer_use.moli.acceptance',
      adapterId: 'moli.acceptance.v1', adapterVersionConstraint: '1.1.15', browserEngineConstraint: null,
      idempotencyKey: `moli:${attempt}:1`, deadline, authorizationGrantRef: `grant-${attempt}`,
      inputRef: `synthetic:${attempt}`, payload: { nonProductionTestAuthority: 'spec208-rootless-acceptance-v1', runtimeDigest },
    };
    const lease = { jobId, attemptId, leaseId, fencingVersion: 1, expiresAtMs: Date.now() + 75_000 };
    const binding = {
      runnerId: command.runnerId, tenantId: command.tenantId, runnerSessionId: command.runnerSessionId,
      capabilitySnapshotId: command.capabilitySnapshotId, capabilitySnapshotRevision: command.capabilitySnapshotRevision,
      controlPlaneOrigin: command.controlPlaneOrigin, capabilityExpiresAt: deadline,
      browserReady: false, authorizationGrantRef: command.authorizationGrantRef,
    };
    const child = spawn('/usr/bin/smartaihub-runner', ['__sah-spec208-moli-acceptance'], {
      cwd: '/profile', env: {
        PATH: '/usr/bin', HOME: '/profile', TMPDIR: '/tmp', SAH_RUNNER_PROFILE: 'shared_container',
        SAH_RUNNER_ID: command.runnerId, SAH_RUNNER_JOB_ID: jobId, SAH_RUNNER_ATTEMPT_ID: attemptId,
        SAH_RUNNER_LEASE_ID: leaseId, SPEC208_TEST_AUTHORITY: 'spec208-rootless-acceptance-v1',
        SPEC208_RUNTIME_IMAGE_DIGEST: runtimeDigest,
      }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const runtime = { attempt, port, profile, child, runnerOwned, stderr: [], stdoutBuffer: '', waiters: [] };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      runtime.stdoutBuffer += chunk;
      while (runtime.waiters.length && runtime.stdoutBuffer.includes('\n')) {
        const lineEnd = runtime.stdoutBuffer.indexOf('\n');
        const line = runtime.stdoutBuffer.slice(0, lineEnd);
        runtime.stdoutBuffer = runtime.stdoutBuffer.slice(lineEnd + 1);
        runtime.waiters.shift()(JSON.parse(line));
      }
    });
    child.stderr.on('data', chunk => runtime.stderr.push(chunk.toString()));
    const started = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`RUNNER_START_TIMEOUT:${attempt}`)), 15_000);
      runtime.waiters.push(message => { clearTimeout(timer); resolve(message); });
      child.once('exit', code => { if (code !== null) { clearTimeout(timer); reject(new Error(`RUNNER_EARLY_EXIT:${attempt}:${code}:${runtime.stderr.join('').slice(-2000)}`)); } });
    });
    child.stdin.write(`${JSON.stringify({ command, lease, expectedLease: lease, binding, runtimeDigest,
      expectedMoliSha256: process.env.SPEC208_MOLI_SHA256, moliPath: '/usr/bin/moli', profilePath: profile, port })}\n`);
    const response = await started;
    if (response.event !== 'started' || !Number.isInteger(response.pid)) throw new Error(`RUNNER_START_REJECTED:${attempt}`);
    runtime.moliPid = response.pid;
    runtime.runnerStart = response;
    const startTime = Date.now();
    while (Date.now() - startTime < 15_000) {
      if (child.exitCode !== null) throw new Error(`RUNNER_EARLY_EXIT:${attempt}:${child.exitCode}:${runtime.stderr.join('').slice(-2000)}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(700) });
        if (response.ok) {
          const endpoint = await response.json();
          if (!endpoint.webSocketDebuggerUrl || new URL(endpoint.webSocketDebuggerUrl).hostname !== '127.0.0.1') throw new Error('MOLI_LISTENER_BINDING_INVALID');
          runtime.endpoint = endpoint;
          break;
        }
      } catch (error) { if (error.message === 'MOLI_LISTENER_BINDING_INVALID') throw error; }
      await delay(100);
    }
    if (!runtime.endpoint) throw new Error(`MOLI_START_TIMEOUT:${attempt}:${runtime.stderr.join('').slice(-2000)}`);
    const socket = new WebSocket(runtime.endpoint.webSocketDebuggerUrl);
    socket.pending = new Map(); socket.nextId = 0;
    socket.onmessage = event => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (!message.id) return;
      const pending = socket.pending.get(message.id);
      if (!pending) return;
      socket.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? 'CDP_FAILED'));
      else pending.resolve(message.result ?? {});
    };
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP_CONNECT_TIMEOUT')), 5000);
      socket.onopen = () => { clearTimeout(timer); resolve(); };
      socket.onerror = () => { clearTimeout(timer); reject(new Error('CDP_CONNECT_FAILED')); };
    });
    runtime.socket = socket;
    return runtime;
  }
  const args = ['serve', '--host', '127.0.0.1', '--port', String(port), '--timeout', '8', '--profile-dir', profile,
    '--http-proxy', 'http://127.0.0.1:18080', '--block-private-networks', '--log-level', 'error'];
  const child = spawn('/usr/bin/moli', args, { cwd: profile, env: { PATH: '/usr/bin', HOME: profile, TMPDIR: '/tmp', XDG_CACHE_HOME: `${profile}/cache`, XDG_CONFIG_HOME: `${profile}/config`, XDG_DATA_HOME: `${profile}/data` }, stdio: ['ignore', 'ignore', 'pipe'] });
  const stderr = [];
  child.stderr.on('data', chunk => stderr.push(chunk.toString()));
  const started = Date.now();
  let endpoint;
  while (Date.now() - started < 15000) {
    if (child.exitCode !== null) throw new Error(`MOLI_EARLY_EXIT:${attempt}:${child.exitCode}:${stderr.join('').slice(-2000)}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(700) });
      if (response.ok) { endpoint = await response.json(); break; }
    } catch {}
    await delay(100);
  }
  if (!endpoint?.webSocketDebuggerUrl) throw new Error(`MOLI_START_TIMEOUT:${attempt}:${stderr.join('').slice(-2000)}`);
  const wsEndpoint = new URL(endpoint.webSocketDebuggerUrl);
  if (wsEndpoint.hostname !== '127.0.0.1' || Number(wsEndpoint.port) !== port) throw new Error(`MOLI_LISTENER_BINDING_INVALID:${endpoint.webSocketDebuggerUrl}`);
  const socket = new WebSocket(endpoint.webSocketDebuggerUrl);
  socket.pending = new Map(); socket.nextId = 0;
  socket.onmessage = event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (!message.id) return;
    const pending = socket.pending.get(message.id);
    if (!pending) return;
    socket.pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message ?? 'CDP_FAILED'));
    else pending.resolve(message.result ?? {});
  };
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP_CONNECT_TIMEOUT')), 5000);
    socket.onopen = () => { clearTimeout(timer); resolve(); };
    socket.onerror = () => { clearTimeout(timer); reject(new Error('CDP_CONNECT_FAILED')); };
  });
  return { attempt, port, profile, child, socket, stderr, endpoint };
}

async function navigateAndRead(runtime, attempt) {
  const context = await cdp(runtime.socket, 'Target.createBrowserContext');
  const target = await cdp(runtime.socket, 'Target.createTarget', { url: 'about:blank', browserContextId: context.browserContextId });
  const attached = await cdp(runtime.socket, 'Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await cdp(runtime.socket, 'Page.enable', {}, sessionId);
  await cdp(runtime.socket, 'Runtime.enable', {}, sessionId);
  const url = `http://fixture.spec208.invalid/acceptance?attempt=${attempt}&cdp=${runtime.port}`;
  await cdp(runtime.socket, 'Page.navigate', { url }, sessionId);
  const deadline = Date.now() + 12000;
  let value;
  while (Date.now() < deadline) {
    const result = await cdp(runtime.socket, 'Runtime.evaluate', {
      expression: `JSON.stringify({title:document.title,body:document.querySelector('#result')?.textContent,localStorage:localStorage.getItem('tenant-marker'),cookie:document.cookie,protocolProbe:window.protocolProbe})`,
      returnByValue: true, awaitPromise: true,
    }, sessionId);
    value = JSON.parse(result.result?.value ?? '{}');
    if (value.body && value.protocolProbe && ['fetch','bidi','egress','metadata'].every(key => value.protocolProbe[key] !== 'pending')) break;
    await delay(100);
  }
  const cookies = await cdp(runtime.socket, 'Storage.getCookies');
  const httpOnly = (cookies.cookies ?? []).some(cookie => cookie.name === 'http_only_attempt' && cookie.value === attempt);
  await cdp(runtime.socket, 'Target.closeTarget', { targetId: target.targetId });
  await cdp(runtime.socket, 'Target.disposeBrowserContext', { browserContextId: context.browserContextId });
  return { ...value, httpOnlyCookiePresent: httpOnly };
}

async function stopMoli(runtime, terminal = { type: 'complete' }) {
  if (runtime.socket.readyState === WebSocket.OPEN) runtime.socket.close();
  if (runtime.runnerOwned) {
    runtime.child.stdin.write(`${JSON.stringify(terminal)}\n`);
    const receipt = await nextRunnerMessage(runtime);
    const exitCode = await new Promise(resolve => runtime.child.once('exit', resolve));
    const cleanup = {
      pid: runtime.moliPid, runnerPid: runtime.child.pid, runnerExitCode: exitCode,
      exitCode: receipt.exitCode, signal: receipt.signal, profileRemoved: receipt.profileRemoved,
      receipt: receipt.receipt,
    };
    return cleanup;
  }
  if (runtime.child.exitCode === null) {
    runtime.child.kill('SIGTERM');
    await Promise.race([new Promise(resolve => runtime.child.once('exit', resolve)), delay(4000)]);
    if (runtime.child.exitCode === null) runtime.child.kill('SIGKILL');
  }
  if (runtime.child.exitCode === null) await new Promise(resolve => runtime.child.once('exit', resolve));
  fs.rmSync(runtime.profile, { recursive: true, force: false });
  return { pid: runtime.child.pid, exitCode: runtime.child.exitCode, signal: runtime.child.signalCode, profileRemoved: !fs.existsSync(runtime.profile) };
}

let result;
const processUid = process.getuid();
const rootWriteBlocked = (() => { try { fs.writeFileSync('/opt/spec208/should-not-write', 'x'); return false; } catch { return true; } })();
const profileWriteAllowed = (() => { try { fs.writeFileSync('/profile/service-marker', 'owned', { mode: 0o600, flag: 'wx' }); return true; } catch { return false; } })();
const externalRouteBlocked = await fetch('http://1.1.1.1/', { signal: AbortSignal.timeout(800) }).then(() => false, () => true);
const hostHomeVisible = fs.existsSync('/home/dev');
const hostContainerSocketVisible = fs.existsSync('/run/containerd/containerd.sock');
const profileFsType = fs.statfsSync('/profile').type.toString(16);
const ipv4Routes = fs.readFileSync('/proc/net/route', 'utf8').trim().split('\n').slice(1).filter(Boolean);
const ipv6Routes = fs.readFileSync('/proc/net/ipv6_route', 'utf8').trim().split('\n').filter(Boolean);
const defaultRoutePresent = ipv4Routes.some(line => { const fields = line.trim().split(/\s+/); return fields[1] === '00000000' && fields[7] === '00000000'; }) || ipv6Routes.some(line => { const fields = line.trim().split(/\s+/); return fields[0] === '00000000000000000000000000000000' && fields[1] === '00' && (Number.parseInt(fields[8], 16) & 1) === 1 && fields[9] !== 'lo'; });
const runtimes = [];
try {
  const runnerNegativeCases = process.env.SPEC208_RUNNER_ACCEPTANCE === '1' ? await runRunnerNegativeCases() : null;
  const a = await startMoli('tenant-a', 9222); runtimes.push(a);
  const resultA = await navigateAndRead(a, 'tenant-a');
  const cleanupA = await stopMoli(a, { type: 'complete', result: resultA }); runtimes.pop();
  const b = await startMoli('tenant-b', 9223); runtimes.push(b);
  const resultB = await navigateAndRead(b, 'tenant-b');
  const cleanupB = await stopMoli(b, { type: 'complete', result: resultB }); runtimes.pop();
  let cleanupCancelled;
  let cleanupRevoked;
  let cleanupCrashed;
  if (process.env.SPEC208_RUNNER_ACCEPTANCE === '1') {
    const cancelled = await startMoli('tenant-cancel', 9224); runtimes.push(cancelled);
    cleanupCancelled = await stopMoli(cancelled, { type: 'cancel', reason: 'synthetic-cancel' }); runtimes.pop();
    const revoked = await startMoli('tenant-revoke', 9225); runtimes.push(revoked);
    cleanupRevoked = await stopMoli(revoked, { type: 'revoke', reason: 'synthetic-revocation' }); runtimes.pop();
    const crashed = await startMoli('tenant-crash', 9226); runtimes.push(crashed);
    process.kill(crashed.moliPid, 'SIGKILL');
    const crashReceipt = await nextRunnerMessage(crashed);
    const runnerExitCode = await new Promise(resolve => crashed.child.once('exit', resolve));
    cleanupCrashed = { pid: crashed.moliPid, runnerPid: crashed.child.pid, runnerExitCode,
      exitCode: crashReceipt.exitCode, signal: crashReceipt.signal, profileRemoved: crashReceipt.profileRemoved,
      receipt: crashReceipt.receipt };
    runtimes.pop();
  }
  const syntheticResult = {
    resultA: { title: resultA.title, body: resultA.body, localStorage: resultA.localStorage },
    resultB: { title: resultB.title, body: resultB.body, localStorage: resultB.localStorage },
  };
  result = {
    result: 'PASS', runtime: 'rootless-systemd-acceptance-not-cloudflare-certified',
    harnessReceipt: {
      receiptId: `local-acceptance:${crypto.randomUUID()}`,
      resultSha256: crypto.createHash('sha256').update(JSON.stringify(syntheticResult)).digest('hex'),
      settlement: 'synthetic-local-harness-success',
      controlPlaneReceipt: false,
    },
    uid: processUid, rootWriteBlocked, profileWriteAllowed, externalRouteBlocked, hostHomeVisible, hostContainerSocketVisible, profileFsType, defaultRoutePresent, ipv4Routes, ipv6Routes, ipv6RouteCount: ipv6Routes.length,
    nodeVersion: process.version, moliVersionOutput: spawnSync('/usr/bin/moli', ['--version'], { encoding: 'utf8' }).stdout.trim(),
    moliBinarySha256: crypto.createHash('sha256').update(fs.readFileSync('/usr/bin/moli')).digest('hex'),
    runtimeImageDigest: process.env.SPEC208_RUNTIME_IMAGE_DIGEST ?? 'unbound',
    moliVersion: '1.1.15', moliPidA: cleanupA.pid, runnerPidA: cleanupA.runnerPid, runnerExitA: cleanupA.runnerExitCode, moliExitA: cleanupA.exitCode, moliSignalA: cleanupA.signal, profileCleanupA: cleanupA.profileRemoved, runnerReceiptA: cleanupA.receipt,
    moliPidB: cleanupB.pid, runnerPidB: cleanupB.runnerPid, runnerExitB: cleanupB.runnerExitCode, moliExitB: cleanupB.exitCode, moliSignalB: cleanupB.signal, profileCleanupB: cleanupB.profileRemoved, runnerReceiptB: cleanupB.receipt,
    cleanupCancelled, cleanupRevoked, cleanupCrashed, runnerNegativeCases,
    resultA, resultB, allProxyRequests, deniedProxyRequests, deniedProxyUpgrades,
  };
} catch (error) {
  for (const runtime of [...runtimes].reverse()) {
    try { await stopMoli(runtime); } catch {}
  }
  result = { result: 'FAIL', error: String(error), uid: processUid, rootWriteBlocked, profileWriteAllowed, externalRouteBlocked,
    allProxyRequests, deniedProxyRequests, deniedProxyUpgrades, stderr: runtimes.flatMap(runtime => runtime.stderr).join('').slice(-4000) };
} finally {
  proxy.close();
}
console.log(JSON.stringify(result));
if (result.result !== 'PASS' || processUid === 0 || !rootWriteBlocked || !profileWriteAllowed || !externalRouteBlocked || result.hostHomeVisible || result.hostContainerSocketVisible || result.profileFsType !== '1021994' || result.defaultRoutePresent || result.moliVersionOutput !== 'moli 1.1.15' || result.moliBinarySha256 !== 'f927b72192905c092ec95c8f528e35087224f3fe8750f72fb2147efa676eab8d' || !result.profileCleanupA || !result.profileCleanupB || (process.env.SPEC208_RUNNER_ACCEPTANCE === '1' && (!result.cleanupCancelled?.profileRemoved || !result.cleanupRevoked?.profileRemoved || !result.cleanupCrashed?.profileRemoved || result.cleanupCrashed?.receipt?.payload?.receipt?.eventType !== 'EXECUTION_FAILED' || result.cleanupCrashed?.receipt?.payload?.receipt?.payload?.terminalAction !== 'process_crashed' || !result.runnerNegativeCases?.staleFence?.profileAbsent || !result.runnerNegativeCases?.expiredDeadline?.profileAbsent || !result.runnerNegativeCases?.failedStartup?.profileAbsent || result.runnerReceiptA?.payload?.receipt?.payload?.profileRemoved !== true || result.runnerReceiptB?.payload?.receipt?.payload?.profileRemoved !== true || result.cleanupCancelled?.receipt?.payload?.receipt?.payload?.terminalAction !== 'cancel' || result.cleanupRevoked?.receipt?.payload?.receipt?.payload?.terminalAction !== 'revoke')) || result.resultA.localStorage !== 'tenant-a' || result.resultB.localStorage !== 'tenant-b' || result.resultA.cookie.includes('tenant-a') === false || result.resultB.cookie.includes('tenant-a') || !result.resultA.httpOnlyCookiePresent || !result.resultB.httpOnlyCookiePresent || result.resultA.protocolProbe?.bidi === 'connected' || result.resultA.protocolProbe?.fetch !== 'blocked' || result.resultA.protocolProbe?.bidi !== 'blocked' || result.resultA.protocolProbe?.egress !== 'blocked' || result.resultA.protocolProbe?.metadata !== 'blocked' || result.resultB.protocolProbe?.fetch !== 'blocked' || result.resultB.protocolProbe?.bidi !== 'blocked' || result.resultB.protocolProbe?.egress !== 'blocked' || result.resultB.protocolProbe?.metadata !== 'blocked' || !deniedProxyRequests.some(item => item.target.includes('example.com')) || !deniedProxyRequests.some(item => item.target.includes('169.254.169.254')) || !deniedProxyRequests.some(item => item.target.includes('127.0.0.1:9222/session')) || !deniedProxyRequests.some(item => item.target.includes('127.0.0.1:9223/session')) || allProxyRequests.some(item => item.authorizationPresent)) process.exitCode = 1;
