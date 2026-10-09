import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../skills/openviking', import.meta.url));

test('Skill remains usable when only its directory is copied to another agent', t => {
  const temp = mkdtempSync(join(tmpdir(), 'openviking standalone skill '));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const installed = join(temp, 'openviking');
  cpSync(source, installed, { recursive: true });
  const files = readdirSync(installed, { recursive: true, withFileTypes: true }).filter(f => f.isFile());
  let links = 0;
  for (const file of files.filter(f => f.name.endsWith('.md'))) {
    const path = join(file.parentPath, file.name);
    const text = readFileSync(path, 'utf8');
    for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (/^(?:https?:|#)/.test(target)) continue;
      const destination = resolve(dirname(path), target.split('#')[0]);
      const rel = relative(installed, destination);
      assert.ok(!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../'), `Skill link escapes installation: ${target}`);
      assert.ok(existsSync(destination), `Skill reference missing after copy: ${target}`);
      links++;
    }
  }
  assert.ok(links > 0);
  assert.equal(existsSync(join(temp, 'src')), false);
  assert.equal(existsSync(join(temp, 'bin')), false);
  assert.equal(readFileSync(join(installed, 'LICENSE'), 'utf8'), readFileSync(new URL('../LICENSE', import.meta.url), 'utf8'));
});
