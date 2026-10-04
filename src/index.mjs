import { resolveConnection } from './connection.mjs';
import { inspectHealth } from './status.mjs';
import { publicProfiles } from './profiles.mjs';
import { updateSettings } from './settings.mjs';
import { chooseScope, setupConnection } from './setup.mjs';
import { deleteProfile, selectProfile } from './manage.mjs';

export default function openVikingMcp(pi) {
  if (typeof pi.registerMcpServer !== 'function' || typeof pi.unregisterMcpServer !== 'function') {
    throw new Error('pi-openviking requires Pi 1.0 or newer with native MCP support.');
  }
  let registered;
  let current;
  let busy = false;
  const options = ctx => ({ cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted() });
  const activate = ctx => {
    const connection = resolveConnection(options(ctx));
    if (registered && (!connection.config || registered !== connection.settings.serverName)) {
      pi.unregisterMcpServer(registered);
      registered = undefined;
    }
    if (connection.config) {
      try { pi.registerMcpServer(connection.settings.serverName, connection.config); }
      catch { throw new Error('Pi could not register OpenViking MCP. Check /mcp and the Pi version.'); }
      registered = connection.settings.serverName;
    }
    current = connection;
    return connection;
  };
  const activateSafely = ctx => {
    try { return activate(ctx); }
    catch (error) {
      // A removed profile or missing key must not leave the previous connection active.
      if (registered) pi.unregisterMcpServer(registered);
      registered = undefined;
      current = undefined;
      throw error;
    }
  };
  const command = (name, description, handler, interactive = false) => pi.registerCommand(name, {
    description,
    async handler(args, ctx) {
      if (busy) { ctx.ui.notify('OpenViking configuration is busy. Retry when the current command finishes.', 'warning'); return; }
      if (interactive && !ctx.hasUI) { ctx.ui.notify('Use interactive Pi for setup, or the package CLI for headless configuration.', 'warning'); return; }
      busy = true;
      try { await handler(args.trim(), ctx); }
      catch (error) { ctx.ui.notify(error.message, 'error'); }
      finally { busy = false; }
    },
  });
  // Project configuration is read only after Pi has supplied its trust decision.
  pi.on('session_start', async (_event, ctx) => {
    try {
      const connection = activateSafely(ctx);
      if (connection.settings.enabled && !connection.config) ctx.ui.notify('OpenViking is not configured. Run /ov-setup.', 'info');
    } catch (error) { ctx.ui.notify(error.message, 'error'); }
  });
  command('ov-setup', 'Add an OpenViking connection and choose its scope.', async (_args, ctx) => {
    const result = await setupConnection(ctx, options(ctx));
    if (!result) return;
    let connection;
    try { connection = activateSafely(ctx); }
    catch (error) {
      if (!result.missingKey) throw error;
      ctx.ui.notify('Connection saved. Set its API key environment variable, then restart Pi.', 'info');
      return;
    }
    ctx.ui.notify(`Saved ${result.name}. Effective connection: ${connection.settings.profile ?? 'legacy'}. Use /mcp to check tools. Project settings override user defaults.`, 'info');
  }, true);
  command('ov-use', 'Select a saved connection (or legacy ovcli/environment settings).', async (args, ctx) => {
    const opts = options(ctx);
    const name = args || await ctx.ui.select('Select OpenViking connection', [...publicProfiles(opts).map(p => p.name), 'legacy']);
    if (!name) return;
    const scope = await chooseScope(ctx);
    if (!scope) return;
    selectProfile(opts, name, scope);
    const connection = activateSafely(ctx);
    ctx.ui.notify(`Effective connection: ${connection.settings.profile ?? 'legacy'}. Use /mcp to check tools. Project settings override user defaults.`, 'info');
  }, true);
  command('ov-connections', 'List saved connection names and endpoints without keys.', async (_args, ctx) => {
    ctx.ui.notify(JSON.stringify(publicProfiles(options(ctx)), null, 2), 'info');
  });
  command('ov-remove', 'Remove a saved connection after confirmation.', async (args, ctx) => {
    const opts = options(ctx);
    const name = args || await ctx.ui.select('Remove OpenViking connection', publicProfiles(opts).map(p => p.name));
    if (!name || !await ctx.ui.confirm('Remove connection?', `Remove ${name} from this user? Other projects selecting it will need /ov-use.`)) return;
    deleteProfile(opts, name);
    ctx.ui.notify('Connection removed.', 'info');
  }, true);
  command('ov-disconnect', 'Disable the package connection in project or user settings.', async (_args, ctx) => {
    const scope = await chooseScope(ctx);
    if (!scope) return;
    updateSettings(options(ctx), scope, { enabled: false });
    const c = activateSafely(ctx);
    ctx.ui.notify(c.config ? 'User default disabled; this project still enables the connection. Select project scope to disable here.' :
      'Package connection disabled. /ov-use enables it again. File-configured MCP servers are managed by /mcp.', 'info');
  }, true);
  command('ov-mcp-status', 'Check HTTP health; use /mcp for the effective MCP connection and tool list.', async (_args, ctx) => {
    const desired = resolveConnection(options(ctx));
    const status = await inspectHealth(desired, { signal: ctx.signal });
    status.reloadNeeded = JSON.stringify(current?.config) !== JSON.stringify(desired.config);
    ctx.ui.notify(JSON.stringify(status, null, 2) + '\nHTTP health does not prove MCP authentication. Use /mcp for transport and tools. A same-name mcp.json entry overrides this package.', status.healthy ? 'info' : 'warning');
  });
}
