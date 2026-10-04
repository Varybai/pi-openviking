import { connectionFromProfile } from './connection.mjs';
import { endpoint, loadProfiles, saveProfile, validateName, validateProfile } from './profiles.mjs';
import { DEFAULTS, settingsPath } from './settings.mjs';
import { inspectHealth } from './status.mjs';
import { selectProfile } from './manage.mjs';

export async function chooseScope(ctx) {
  const choices = ctx.isProjectTrusted() ? ['This project', 'User default'] : ['User default'];
  const choice = await ctx.ui.select('Where should this connection be selected?', choices);
  return choice === undefined ? undefined : choice === 'This project' ? 'project' : 'user';
}

// Collect all values before writing. Dialog cancellation has no side effects.
// Plain UI inputs only accept environment variable names, never API keys.
export async function setupConnection(ctx, options, { health = inspectHealth } = {}) {
  const name = await ctx.ui.input('Connection name', 'team');
  if (name === undefined) return;
  validateName(name);
  if (Object.hasOwn(loadProfiles(options), name)) throw new Error('Connection already exists. Use /ov-use or choose a new name.');
  const rawUrl = await ctx.ui.input('OpenViking HTTP base URL (without /mcp)', 'https://ov.example.com');
  if (rawUrl === undefined) return;
  const profile = { url: endpoint(rawUrl) };
  for (const field of ['account', 'user']) {
    const value = await ctx.ui.input(`OpenViking ${field} (blank if not required)`);
    if (value === undefined) return;
    if (value.trim()) profile[field] = value.trim();
  }
  const auth = await ctx.ui.select('Authentication', ['API key from environment variable', 'No authentication']);
  if (auth === undefined) return;
  if (auth === 'No authentication') profile.auth = { type: 'none' };
  else {
    const variable = await ctx.ui.input('Environment VARIABLE NAME, not the API key', 'OPENVIKING_API_KEY');
    if (variable === undefined) return;
    profile.auth = { type: 'env', variable: variable.trim() || 'OPENVIKING_API_KEY' };
  }
  validateProfile(profile);
  const scope = await chooseScope(ctx);
  if (!scope) return;
  settingsPath(options, scope); // Reject escaping project paths before saving credentials.
  const env = options.env ?? process.env;
  const missingKey = profile.auth.type === 'env' && !env[profile.auth.variable];
  let healthy = false;
  if (!missingKey) healthy = (await health(connectionFromProfile(profile, DEFAULTS, env), { signal: ctx.signal })).healthy;
  const message = [
    `Connection: ${name}\nURL: ${profile.url}\nScope: ${scope}\nAuthentication: ${profile.auth.type}`,
    missingKey ? 'The variable is not set. Save now, then set it in your terminal and restart Pi.' :
      healthy ? 'HTTP health passed. MCP authentication and tools will be checked by Pi after activation.' :
        'HTTP health did not pass. Save this configuration for later connection?',
  ].join('\n\n');
  if (!await ctx.ui.confirm('Save OpenViking connection?', message)) return;
  saveProfile(options, name, profile);
  // If selecting fails, retain the saved profile and report how to recover.
  try { selectProfile(options, name, scope); }
  catch { throw new Error('Connection saved, but selection failed. Fix the settings file and run /ov-use.'); }
  return { name, scope, missingKey, healthy };
}
