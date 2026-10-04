import { loadProfiles, removeProfile } from './profiles.mjs';
import { loadSettings, settingsPath, updateSettings } from './settings.mjs';
import { readJson } from './storage.mjs';

export function selectProfile(options, name, scope = 'project') {
  if (name !== 'legacy' && !Object.hasOwn(loadProfiles(options), name)) throw new Error('Connection does not exist. Run /ov-setup first.');
  updateSettings(options, scope, { enabled: true, profile: name === 'legacy' ? null : name });
  return loadSettings(options);
}
export function deleteProfile(options, name) {
  const user = readJson(settingsPath(options, 'user'));
  const project = options.projectTrusted === false ? {} : readJson(settingsPath(options));
  if (user.profile === name || project.profile === name) {
    throw new Error('Connection is selected in user or current project settings. Select another connection (or legacy) before removing it.');
  }
  removeProfile(options, name);
}
