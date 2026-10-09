import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import openVikingMcp from '../src/index.mjs';
import { loadSettings } from '../src/settings.mjs';
import { resolveConnection } from '../src/connection.mjs';
import { inspectHealth } from '../src/status.mjs';

function fixture(t, client = { url: 'http://127.0.0.1:8080', api_key: 'fake-test-key', account: 'test-account', user: 'test-user' }) {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-openviking-test-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const agentDir = join(cwd, 'agent');
  mkdirSync(agentDir);
  mkdirSync(join(cwd, '.pi'));
  const cliPath = join(cwd, 'ovcli.conf');
  const serverPath = join(cwd, 'server.conf');
  writeFileSync(cliPath, JSON.stringify(client));
  writeFileSync(serverPath, '{}');
  return { cwd, agentDir, env: { OPENVIKING_CLI_CONFIG_FILE: cliPath, OPENVIKING_CONFIG_FILE: serverPath }, cliPath };
}

test('existing ovcli credentials bind the MCP URL and account without copying a key into public status', t => {
  const connection = resolveConnection(fixture(t));
  assert.equal(connection.config.url, 'http://127.0.0.1:8080/mcp');
  assert.equal(connection.config.headers.Authorization, 'Bearer fake-test-key');
  assert.equal(connection.config.headers['X-OpenViking-Account'], 'test-account');
  assert.equal(connection.config.headers['X-OpenViking-User'], 'test-user');
  assert.equal(connection.config.exposure, 'codemode');
  assert.equal(connection.config.timeout, 120);
  assert.ok(!JSON.stringify(connection.publicInfo).includes('fake-test-key'));
});

test('environment endpoint and key override the existing client file together', t => {
  const options = fixture(t);
  Object.assign(options.env, { OPENVIKING_URL: 'https://ov.example.test/api/', OPENVIKING_API_KEY: 'env-key',
    OPENVIKING_ACCOUNT: 'other', OPENVIKING_USER: 'other-user', OPENVIKING_PEER_ID: 'project-peer' });
  const c = resolveConnection(options);
  assert.equal(c.config.url, 'https://ov.example.test/api/mcp');
  assert.equal(c.config.headers.Authorization, 'Bearer env-key');
  assert.equal(c.config.headers['X-OpenViking-Account'], 'other');
  assert.equal(c.config.headers['X-OpenViking-Actor-Peer'], 'project-peer');
});

test('explicit credential source cli preserves the common resolver precedence', t => {
  const options = fixture(t);
  Object.assign(options.env, { OPENVIKING_CREDENTIAL_SOURCE: 'cli', OPENVIKING_URL: 'https://ignored.example.test', OPENVIKING_API_KEY: 'ignored-key' });
  const c = resolveConnection(options);
  assert.equal(c.config.url, 'http://127.0.0.1:8080/mcp');
  assert.equal(c.config.headers.Authorization, 'Bearer fake-test-key');
});

test('project exposure overrides user settings while credentials stay out of those settings', t => {
  const options = fixture(t);
  writeFileSync(join(options.agentDir, 'openviking-mcp.json'), JSON.stringify({ exposure: 'deferred', timeout: 90 }));
  writeFileSync(join(options.cwd, '.pi/openviking-mcp.json'), JSON.stringify({ exposure: 'direct', toolExposure: { 'forget': 'hidden' } }));
  const c = resolveConnection(options);
  assert.equal(c.config.exposure, 'direct');
  assert.equal(c.config.timeout, 90);
  assert.deepEqual(c.config.toolExposure, { forget: 'hidden' });
});

test('disabled package does not resolve invalid connection details', t => {
  const options = fixture(t, { url: 'invalid', api_key: 'fake-test-key' });
  writeFileSync(join(options.cwd, '.pi/openviking-mcp.json'), '{"enabled":false}');
  const c = resolveConnection(options);
  assert.equal(c.settings.enabled, false);
  assert.equal(c.config, undefined);
});

test('no API key supports an explicitly anonymous endpoint without a fake Authorization header', t => {
  const c = resolveConnection(fixture(t, { url: 'http://127.0.0.1:1933' }));
  assert.equal(c.publicInfo.hasApiKey, false);
  assert.equal(c.config.headers, undefined);
});

test('URL credentials and invalid header expressions fail without exposing their values', t => {
  for (const url of ['https://user:secret-value@example.test', 'https://example.test?token=secret-value', 'file:///secret-value']) {
    const options = fixture(t, { url, api_key: 'fake-test-key' });
    assert.throws(() => resolveConnection(options), error => !error.message.includes('secret-value') && !error.message.includes('fake-test-key'));
  }
  for (const account of ['!run-a-command', '${OTHER_ACCOUNT}', 'bad\nheader']) {
    const options = fixture(t, { url: 'http://localhost:8080', api_key: 'fake-test-key', account });
    assert.throws(() => resolveConnection(options));
  }
});

test('malformed behavior settings fail rather than silently connecting with defaults', t => {
  const options = fixture(t);
  const path = join(options.cwd, '.pi/openviking-mcp.json');
  for (const value of [{ apiKey: 'secret-value' }, { timeout: 0 }, { enabled: 'false' }, { exposure: 'unsupported' }, { serverName: 'bad/name' }, { toolExposure: { read: 'bad' } }]) {
    writeFileSync(path, JSON.stringify(value));
    assert.throws(() => loadSettings(options), error => !error.message.includes('secret-value'));
  }
  writeFileSync(path, '{"apiKey":"secret-value" invalid');
  assert.throws(() => loadSettings(options), error => !error.message.includes('secret-value'));
});

test('health diagnostics pass authentication but never return arbitrary server error content', async t => {
  const c = resolveConnection(fixture(t));
  const r = await inspectHealth(c, { fetchImpl: async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:8080/health');
    assert.equal(init.headers.Authorization, 'Bearer fake-test-key');
    assert.equal(init.redirect, 'error');
    return { status: 401, ok: false, json: async () => ({ error: 'fake-test-key' }) };
  } });
  assert.equal(r.httpStatus, 401);
  assert.equal(r.healthy, false);
  assert.ok(!JSON.stringify(r).includes('fake-test-key'));
});

test('successful health response and network failure are distinct', async t => {
  const c = resolveConnection(fixture(t));
  const ok = await inspectHealth(c, { fetchImpl: async () => ({ status: 200, ok: true, json: async () => ({ healthy: true, version: 'test' }) }) });
  assert.equal(ok.healthy, true);
  const failed = await inspectHealth(c, { fetchImpl: async () => { throw new Error('fake-test-key'); } });
  assert.equal(failed.reason, 'request_failed');
  assert.ok(!JSON.stringify(failed).includes('fake-test-key'));
});

test('extension waits for session trust before registration and performs no network at factory load', async t => {
  const options = fixture(t);
  const before = { ...process.env };
  const cwd = process.cwd();
  const fetchBefore = globalThis.fetch;
  const calls = [];
  const events = {};
  try {
    for (const key of Object.keys(process.env)) if (key.startsWith('OPENVIKING_')) delete process.env[key];
    Object.assign(process.env, options.env, { PI_CODING_AGENT_DIR: options.agentDir });
    process.chdir(options.cwd);
    globalThis.fetch = () => { throw new Error('Factory made a network request'); };
    openVikingMcp({ registerMcpServer: (name, config) => calls.push({ name, config }), unregisterMcpServer() {},
      on: (event, handler) => { events[event] = handler; }, registerCommand: name => calls.push({ command: name }) });
    assert.ok(calls.every(c => c.command));
    await events.session_start({}, { cwd: options.cwd, isProjectTrusted: () => true, ui: { notify() {} } });
    assert.equal(calls.at(-1).name, 'openviking');
    assert.equal(calls.at(-1).config.url, 'http://127.0.0.1:8080/mcp');
    assert.ok(calls.some(c => c.command === 'ov-setup'));
    assert.throws(() => openVikingMcp({}), /Pi 1.0 or newer/);
  } finally {
    process.chdir(cwd);
    globalThis.fetch = fetchBefore;
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
  }
});

test('package manifest exposes the extension and shared Skill and treats Pi as a peer', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.pi.extensions, ['./src/index.mjs']);
  assert.deepEqual(manifest.pi.skills, ['./skills']);
  assert.ok(manifest.files.includes('skills/'));
  assert.equal(manifest.peerDependencies['@earendil-works/pi-coding-agent'], '*');
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.scripts.postinstall, undefined);
  assert.ok(!manifest.files.some(name => /config\.json|ovcli|work\/|\.pi\//.test(name)));
});
