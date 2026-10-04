import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import extension from '../src/index.mjs';
import { saveProfile } from '../src/profiles.mjs';
import { selectProfile } from '../src/manage.mjs';
import { updateSettings } from '../src/settings.mjs';

test('session commands switch, disable and re-enable native registration, with no stale key on failure', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi ov lifecycle '));
  const agentDir = join(cwd, 'agent');
  const before = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  t.after(() => {
    if (before === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = before;
    rmSync(cwd, { recursive: true, force: true });
  });
  const opts = { cwd, agentDir };
  saveProfile(opts, 'a', { url: 'https://a.example.test', auth: { type: 'token', value: 'key-a' } });
  saveProfile(opts, 'b', { url: 'https://b.example.test', auth: { type: 'token', value: 'key-b' } });
  saveProfile(opts, 'missing', { url: 'https://missing.example.test', auth: { type: 'env', variable: 'PI_OV_LIFECYCLE_UNSET_KEY' } });
  selectProfile(opts, 'a');
  const events = {}, commands = {}, registered = new Map(), notifications = [];
  const ctx = { cwd, hasUI: true, isProjectTrusted: () => true, ui: {
    select: async () => 'This project', notify: text => notifications.push(text),
  } };
  extension({ on: (name, fn) => { events[name] = fn; }, registerCommand: (name, cmd) => { commands[name] = cmd; },
    registerMcpServer: (name, config) => registered.set(name, config), unregisterMcpServer: name => registered.delete(name) });
  assert.equal(registered.size, 0);
  await events.session_start({}, ctx);
  assert.equal(registered.get('openviking').headers.Authorization, 'Bearer key-a');
  await commands['ov-use'].handler('b', ctx);
  assert.equal(registered.get('openviking').url, 'https://b.example.test/mcp');
  assert.equal(registered.get('openviking').headers.Authorization, 'Bearer key-b');
  await commands['ov-disconnect'].handler('', ctx);
  assert.equal(registered.size, 0);
  await commands['ov-use'].handler('a', ctx);
  assert.equal(registered.size, 1);
  updateSettings(opts, 'project', { serverName: 'team_ov' });
  await events.session_start({}, ctx);
  assert.equal(registered.has('openviking'), false);
  assert.equal(registered.has('team_ov'), true);
  await commands['ov-use'].handler('missing', ctx);
  assert.equal(registered.size, 0);
  assert.ok(notifications.some(s => s.includes('API key is missing')));
  assert.ok(!notifications.join('\n').includes('key-a'));
  assert.ok(!notifications.join('\n').includes('key-b'));
});
