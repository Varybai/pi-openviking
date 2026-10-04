import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveConnection } from '../src/connection.mjs';
import { loadProfiles, publicProfiles, profilesPath, saveProfile, validateProfile } from '../src/profiles.mjs';
import { loadSettings, updateSettings } from '../src/settings.mjs';
import { deleteProfile, selectProfile } from '../src/manage.mjs';
import { setupConnection } from '../src/setup.mjs';
import { inspectHealth } from '../src/status.mjs';
import { run } from '../bin/pi-openviking.mjs';

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'pi ov connections '));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const agentDir = join(cwd, 'private agent');
  mkdirSync(agentDir);
  return { cwd, agentDir, projectTrusted: true, env: {
    OPENVIKING_CLI_CONFIG_FILE: join(cwd, 'missing-client'), OPENVIKING_CONFIG_FILE: join(cwd, 'missing-server'),
  } };
}
const profile = (url = 'https://ov.example.test', key = 'fake-secret') => ({ url, auth: { type: 'token', value: key } });

test('fresh machine stays unconfigured without network or filesystem writes', async t => {
  const options = fixture(t);
  const c = resolveConnection(options);
  assert.equal(c.config, undefined);
  assert.equal(c.publicInfo.configured, false);
  const status = await inspectHealth(c, { fetchImpl: () => assert.fail('network must not run') });
  assert.equal(status.reason, 'setup_required');
  assert.equal(existsSync(profilesPath(options)), false);
});

test('profile selection binds URL/key as one unit and ignores unrelated legacy credentials', t => {
  const o = fixture(t);
  saveProfile(o, 'team', profile());
  saveProfile(o, 'lab', { url: 'http://localhost:8080', auth: { type: 'none' } });
  Object.assign(o.env, { OPENVIKING_URL: 'https://old.example.test', OPENVIKING_API_KEY: 'old-secret' });
  selectProfile(o, 'team');
  assert.equal(resolveConnection(o).config.headers.Authorization, 'Bearer fake-secret');
  selectProfile(o, 'lab');
  assert.equal(resolveConnection(o).config.headers, undefined);
  assert.equal(resolveConnection(o).config.url, 'http://localhost:8080/mcp');
  assert.equal(statSync(profilesPath(o)).mode & 0o777, 0o600);
  const settings = readFileSync(join(o.cwd, '.pi/openviking-mcp.json'), 'utf8');
  assert.ok(!settings.includes('secret'));
  assert.ok(!settings.includes('localhost'));
  assert.ok(!JSON.stringify(publicProfiles(o)).includes('secret'));
});

test('environment references stay references; missing keys fail without falling back', t => {
  const o = fixture(t);
  saveProfile(o, 'team', { url: 'https://ov.example.test', auth: { type: 'env', variable: 'TEAM_OV_KEY' } });
  selectProfile(o, 'team', 'user');
  o.env.OPENVIKING_API_KEY = 'unrelated-secret';
  assert.throws(() => resolveConnection(o), /API key is missing/);
  o.env.TEAM_OV_KEY = 'team-secret';
  assert.equal(resolveConnection(o).config.headers.Authorization, 'Bearer team-secret');
  assert.ok(!readFileSync(profilesPath(o), 'utf8').includes('team-secret'));
});

test('untrusted projects cannot override the user profile or disable its connection', t => {
  const o = fixture(t);
  saveProfile(o, 'user', profile());
  selectProfile(o, 'user', 'user');
  updateSettings(o, 'project', { enabled: false });
  assert.equal(resolveConnection(o).config, undefined);
  const untrusted = { ...o, projectTrusted: false };
  assert.equal(resolveConnection(untrusted).config.url, 'https://ov.example.test/mcp');
  assert.throws(() => updateSettings(untrusted, 'project', { enabled: true }), /Trust/);
});

test('strict schema rejects cross-origin MCP URLs and credential expressions without echoing them', () => {
  for (const p of [
    { ...profile(), mcpUrl: 'https://other.example.test/mcp' },
    { ...profile(), url: 'https://secret@example.test' },
    { ...profile(), auth: { type: 'env', variable: 'bad-secret-value' } },
    { ...profile(), auth: { type: 'token', value: '${secret}' } },
    { ...profile(), auth: { type: 'token', value: '!secret' } },
    { ...profile(), auth: { type: 'token', value: 'secret\n' } },
    { ...profile(), auth: { type: 'none', value: 'secret' } },
  ]) assert.throws(() => validateProfile(p), e => !e.message.includes('secret'));
});

test('a changed legacy endpoint cannot reuse a file key from another server', t => {
  const o = fixture(t);
  writeFileSync(o.env.OPENVIKING_CLI_CONFIG_FILE, JSON.stringify({ url: 'https://old.example.test', api_key: 'secret' }));
  o.env.OPENVIKING_URL = 'https://new.example.test';
  assert.throws(() => resolveConnection(o), /differs from credential file/);
});

test('duplicate, invalid and locked writes preserve existing credentials and other profiles', t => {
  const o = fixture(t);
  saveProfile(o, 'one', profile());
  saveProfile(o, 'two', profile('https://two.example.test'));
  const before = readFileSync(profilesPath(o), 'utf8');
  assert.throws(() => saveProfile(o, 'one', profile('https://wrong.example.test')), /already exists/);
  assert.throws(() => saveProfile(o, '__proto__', profile()), /reserved/);
  assert.throws(() => saveProfile(o, 'bad', { url: 'not-a-url' }));
  mkdirSync(`${profilesPath(o)}.lock`);
  assert.throws(() => saveProfile(o, 'three', profile()), /locked/);
  assert.equal(readFileSync(profilesPath(o), 'utf8'), before);
});

test('removal protects selected connections; dangling selectors fail instead of using a different endpoint', t => {
  const o = fixture(t);
  saveProfile(o, 'one', profile());
  saveProfile(o, 'two', profile());
  selectProfile(o, 'one');
  assert.throws(() => deleteProfile(o, 'one'), /selected/);
  deleteProfile(o, 'two');
  assert.deepEqual(Object.keys(loadProfiles(o)), ['one']);
  updateSettings(o, 'project', { profile: 'two' });
  assert.throws(() => resolveConnection(o), /missing/);
});

test('project symlink escapes and private store symlinks are refused', t => {
  const o = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), 'pi ov outside '));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  symlinkSync(outside, join(o.cwd, '.pi'));
  assert.throws(() => updateSettings(o, 'project', { enabled: false }), /escapes/);
  const target = join(outside, 'connections');
  writeFileSync(target, JSON.stringify({ version: 1, profiles: {} }));
  symlinkSync(target, profilesPath(o));
  assert.throws(() => saveProfile(o, 'one', profile()), /symlink refused/);
  assert.equal(readFileSync(target, 'utf8'), JSON.stringify({ version: 1, profiles: {} }));
});

function wizardContext(o, cancelAt = -1, confirm = true) {
  const answers = ['team', 'https://ov.example.test', '', '', 'API key from environment variable', 'TEAM_KEY', 'This project'];
  let cursor = 0;
  const answer = async () => cursor === cancelAt ? (cursor++, undefined) : answers[cursor++];
  return { cwd: o.cwd, hasUI: true, isProjectTrusted: () => true,
    ui: { input: answer, select: answer, confirm: async () => confirm } };
}

test('wizard cancellation at every input and final confirmation leaves files untouched', async t => {
  for (let i = 0; i < 8; i++) {
    const o = fixture(t);
    o.env.TEAM_KEY = 'secret';
    const result = await setupConnection(wizardContext(o, i, i !== 7), o, { health: async () => ({ healthy: true }) });
    assert.equal(result, undefined);
    assert.equal(existsSync(profilesPath(o)), false);
    assert.equal(existsSync(join(o.cwd, '.pi/openviking-mcp.json')), false);
  }
});

test('wizard checks health and saves an environment reference plus project selector', async t => {
  const o = fixture(t);
  o.env.TEAM_KEY = 'wizard-secret';
  let healthCalls = 0;
  const result = await setupConnection(wizardContext(o), o, { health: async c => {
    healthCalls++;
    assert.equal(c.config.headers.Authorization, 'Bearer wizard-secret');
    return { healthy: true };
  } });
  assert.equal(healthCalls, 1);
  assert.equal(result.name, 'team');
  assert.equal(loadSettings(o).profile, 'team');
  assert.ok(!readFileSync(profilesPath(o), 'utf8').includes('wizard-secret'));
});

test('missing environment key can be saved explicitly without network or legacy fallback', async t => {
  const o = fixture(t);
  const result = await setupConnection(wizardContext(o), o, { health: () => assert.fail('network') });
  assert.equal(result.missingKey, true);
  assert.throws(() => resolveConnection(o), /missing/);
});

test('CLI stores piped keys privately, selects local scope and prints only redacted output', async t => {
  const o = fixture(t);
  const messages = [];
  const runtime = { options: o, input: Readable.from(['stdin-secret\n']), output: v => messages.push(v), health: async () => ({ healthy: true }) };
  await run(['add', 'team', '--url', 'https://ov.example.test', '--api-key-stdin'], runtime);
  await run(['use', 'team', '--local'], runtime);
  await run(['list'], runtime);
  assert.ok(!messages.join('\n').includes('stdin-secret'));
  assert.equal(resolveConnection(o).config.headers.Authorization, 'Bearer stdin-secret');
  assert.ok(!readFileSync(join(o.cwd, '.pi/openviking-mcp.json'), 'utf8').includes('stdin-secret'));
  await assert.rejects(() => run(['add', 'bad', '--api-key', 'unsafe-secret'], runtime), e => !e.message.includes('unsafe-secret'));
});

test('CLI failed health check writes nothing; offline mode is explicit', async t => {
  const o = fixture(t);
  const runtime = { options: o, output() {}, health: async () => ({ healthy: false }) };
  const args = ['add', 'team', '--url', 'https://ov.example.test', '--anonymous'];
  await assert.rejects(() => run(args, runtime), /health did not pass/);
  assert.equal(existsSync(profilesPath(o)), false);
  await run([...args, '--offline'], runtime);
  assert.deepEqual(Object.keys(loadProfiles(o)), ['team']);
});

test('CLI entry executes through a symlink in a path with spaces', t => {
  const o = fixture(t);
  const link = join(o.cwd, 'cli link.mjs');
  symlinkSync(fileURLToPath(new URL('../bin/pi-openviking.mjs', import.meta.url)), link);
  const result = spawnSync(process.execPath, [link, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /pi-openviking: configure/);
});
