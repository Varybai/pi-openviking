import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const dir = mkdtempSync(join(tmpdir(), 'pi-openviking-pack-'));
try {
  const r = spawnSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', dir], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  const raw = JSON.parse(r.stdout);
  const pack = Array.isArray(raw) ? raw[0] : raw.files ? raw : Object.values(raw)[0];
  assert.ok(pack.files.some(f => f.path === 'src/index.mjs'));
  for (const file of pack.files) {
    assert.match(file.path, /^(?:package\.json|README\.md|LICENSE|NOTICE|src\/[^/]+\.mjs|vendor\/credentials\.mjs|bin\/pi-openviking\.mjs|docs\/[^/]+\.md)$/);
    const text = readFileSync(file.path, 'utf8');
    assert.ok(!/\/Users\/|\/home\/[^/]+\/|fake-test-key|stdin-secret|wizard-secret/.test(text), `Unexpected local/test data in ${file.path}`);
  }
  console.log(JSON.stringify({ name: pack.name, version: pack.version, files: pack.files.length, bytes: pack.size, shasum: pack.shasum }));
} finally { rmSync(dir, { recursive: true, force: true }); }
