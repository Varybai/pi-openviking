#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { resolveConnection, connectionFromProfile } from '../src/connection.mjs';
import { inspectHealth } from '../src/status.mjs';
import { publicProfiles, saveProfile, validateProfile } from '../src/profiles.mjs';
import { DEFAULTS, updateSettings } from '../src/settings.mjs';
import { deleteProfile, selectProfile } from '../src/manage.mjs';

const HELP = `pi-openviking: configure the Pi OpenViking MCP package
  add NAME --url URL (--key-env VARIABLE | --api-key-stdin | --anonymous)
      [--account ID] [--user ID] [--peer-id ID] [--mcp-url URL] [--offline]
  use NAME [--local]     Select a profile; 'legacy' uses ovcli/environment
  list                  List profiles without keys
  remove NAME           Refuses profiles selected by user/current project
  disable [--local]     Disable package registration
  status                Check HTTP health (use Pi /mcp for MCP authentication)

Profiles and secrets: user agent directory, mode 0600. API keys are never argv.
add saves a profile; use selects it. Default scope: user; --local: this project.
Run /reload in an open Pi after CLI changes. No service or data is installed.`;

async function readKey(input) {
  if (input.isTTY) throw new Error('--api-key-stdin requires piped input, for example from a password manager.');
  let value = '';
  for await (const chunk of input) {
    value += chunk.toString();
    if (Buffer.byteLength(value) > 16384) throw new Error('API key input is too large.');
  }
  return value.replace(/\r?\n$/, '');
}
export async function run(argv, { options = {}, input = process.stdin, output = console.log, health = inspectHealth } = {}) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, options: {
      url: { type: 'string' }, 'mcp-url': { type: 'string' }, 'key-env': { type: 'string' },
      'api-key-stdin': { type: 'boolean' }, anonymous: { type: 'boolean' }, account: { type: 'string' },
      user: { type: 'string' }, 'peer-id': { type: 'string' }, local: { type: 'boolean' },
      offline: { type: 'boolean' }, help: { type: 'boolean' },
    } });
  } catch { throw new Error('Invalid arguments. Use --help. API keys must not be command-line arguments.'); }
  const { values: v, positionals } = parsed;
  const [command, name] = positionals;
  if (v.help || !command) { output(HELP); return 0; }
  const allowed = {
    add: ['url', 'mcp-url', 'key-env', 'api-key-stdin', 'anonymous', 'account', 'user', 'peer-id', 'offline'],
    use: ['local'], disable: ['local'], remove: [], list: [], status: [],
  };
  if (!Object.hasOwn(allowed, command) || Object.keys(v).some(k => !allowed[command].includes(k))
    || positionals.length !== (['add', 'use', 'remove'].includes(command) ? 2 : 1)) throw new Error('Invalid command arguments. Use --help.');
  const scope = v.local ? 'project' : 'user';
  if (command === 'add') {
    if ([v['key-env'] !== undefined, v['api-key-stdin'], v.anonymous].filter(Boolean).length !== 1) {
      throw new Error('Choose one of --key-env, --api-key-stdin or --anonymous.');
    }
    const auth = v['key-env'] !== undefined ? { type: 'env', variable: v['key-env'] } :
      v['api-key-stdin'] ? { type: 'token', value: await readKey(input) } : { type: 'none' };
    const p = validateProfile({ url: v.url, auth,
      ...(v['mcp-url'] ? { mcpUrl: v['mcp-url'] } : {}), ...(v.account ? { account: v.account } : {}),
      ...(v.user ? { user: v.user } : {}), ...(v['peer-id'] ? { peerId: v['peer-id'] } : {}) });
    if (!v.offline) {
      const result = await health(connectionFromProfile(p, DEFAULTS, options.env ?? process.env));
      if (!result.healthy) throw new Error('HTTP health did not pass. Check URL/service, or use --offline to save without checking.');
    }
    saveProfile(options, name, p);
    output('Connection saved. Run use NAME [--local] to select it; /mcp checks MCP authentication and tools.');
  } else if (command === 'use') {
    const settings = selectProfile(options, name, scope);
    output(`Selection saved. Effective profile: ${settings.profile ?? 'legacy'}. Project settings override user defaults. Run /reload in Pi.`);
  } else if (command === 'list') output(JSON.stringify(publicProfiles(options), null, 2));
  else if (command === 'remove') { deleteProfile(options, name); output('Connection removed.'); }
  else if (command === 'disable') { updateSettings(options, scope, { enabled: false }); output('Disabled in selected scope. Run /reload in Pi.'); }
  else if (command === 'status') {
    const result = await health(resolveConnection(options));
    output(JSON.stringify(result, null, 2));
    return result.healthy ? 0 : 1;
  }
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  try { process.exitCode = await run(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
