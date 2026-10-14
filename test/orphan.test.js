import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { check, linkGraph, clickDepth, RULES, loadConfig } from '../src/index.js';
import { loadSite } from '../src/site.js';

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;
const rules = (r) => r.findings.map((f) => f.rule);
const site = (files) => { const d = mkdtempSync(join(tmpdir(), 'ob-')); for (const [p, c] of Object.entries(files)) { mkdirSync(join(d, p, '..'), { recursive: true }); writeFileSync(join(d, p), c); } return d; };
const page = (body = '', head = '') => `<!doctype html><html><head><title>t</title>${head}</head><body>${body}</body></html>`;
const a = (...h) => h.map((x) => `<a href="${x}">x</a>`).join(' ');

test('good fixture is clean at --fail-on info', () => { assert.deepEqual(check(fx('good')).findings, []); });
test('bad fixture reports every rule except home-missing', () => {
  const r = rules(check(fx('bad')));
  for (const k of Object.keys(RULES).filter((k) => k !== 'orphan-home-missing')) assert.ok(r.includes(k), k);
});
test('click depth follows followed links only, BFS shortest path', () => {
  const d = site({ 'index.html': page(a('/a.html', '/b.html')), 'a.html': page(a('/c.html')), 'b.html': page(a('/a.html', '/c.html')), 'c.html': page(a('/')) });
  const s = loadSite(d); const g = linkGraph(s, s.pages); const dep = clickDepth(g, s.find('/'));
  assert.equal(dep.get(s.find('/c.html')), 2); assert.equal(dep.get(s.find('/a.html')), 1);
});
test('maxDepth option and config', () => {
  const d = site({ 'index.html': page(a('/a.html')), 'a.html': page(a('/b.html', '/')), 'b.html': page(a('/')) });
  assert.ok(!rules(check(d)).includes('orphan-too-deep'));
  assert.ok(rules(check(d, { maxDepth: 1 })).includes('orphan-too-deep'));
  assert.ok(rules(check(d, {}, { maxDepth: 1 })).includes('orphan-too-deep'));
});
test('noindex and canonicalised pages are not reported as orphans; ignore globs work', () => {
  const d = site({ 'index.html': page(a('/x.html')), 'x.html': page(a('/')), 'n.html': page('', '<meta name="robots" content="noindex">'), 'dup.html': page('', '<link rel="canonical" href="/x.html">'), 'landing/promo.html': page(a('/')) });
  assert.deepEqual(rules(check(d, { singleLink: false })), ['orphan-page']);
  assert.deepEqual(rules(check(d, { singleLink: false, ignore: ['/landing/**'] })), []);
});
test('links resolve with base href, absolute same-origin URLs and trailing slash variants', () => {
  const d = site({ 'index.html': page('<a href="https://ex.com/docs">d</a>', '<link rel="canonical" href="https://ex.com/"><base href="/">'), 'docs/index.html': page(a('/')) });
  assert.deepEqual(rules(check(d, { singleLink: false })), []);
});
test('missing homepage and --start', () => {
  const d = site({ 'home.html': page(a('/a.html')), 'a.html': page(a('/home.html')) });
  assert.ok(rules(check(d)).includes('orphan-home-missing'));
  assert.deepEqual(rules(check(d, { start: '/home.html', singleLink: false })), []);
});
test('allowlist with expiry', () => {
  const d = site({ 'index.html': page(a('/b.html')), 'b.html': page(a('/')), 'lost.html': page(a('/')) });
  const cfg = { allowlist: [{ rule: 'orphan-page', subject: '/lost.html', reason: 'linked from email campaign', expires: '2027-01-01' }] };
  const r = check(d, { now: new Date('2026-10-14'), singleLink: false }, cfg); assert.equal(r.findings.length, 0); assert.equal(r.suppressed.length, 1);
  assert.ok(typeof loadConfig === 'function');
});
test('CLI exit codes and formats', () => {
  const bin = new URL('../bin/orphan-beacon.js', import.meta.url).pathname;
  const run = (...x) => spawnSync(process.execPath, [bin, ...x], { encoding: 'utf8' });
  assert.equal(run(fx('good'), '--fail-on', 'info').status, 0);
  assert.equal(run(fx('bad')).status, 1);
  assert.equal(run(fx('bad'), '--fail-on', 'none').status, 0);
  assert.equal(run('/nonexistent-dir-xyz').status, 2);
  assert.equal(run(fx('good'), '--max-depth', '0').status, 2);
  const s = JSON.parse(run(fx('bad'), '--format', 'sarif', '--fail-on', 'none').stdout); assert.equal(s.version, '2.1.0');
  assert.match(run(fx('bad'), '--format', 'markdown', '--fail-on', 'none').stdout, /\| Severity \|/);
  assert.equal(JSON.parse(run(fx('bad'), '--format', 'json', '--fail-on', 'none').stdout).info.orphans, 2);
});
