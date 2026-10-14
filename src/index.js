// orphan-beacon: orphan pages and click depth from the internal link graph of a built static site. Louis Wright, MIT.
import { contentPages, runBeacon, finder, SITE_OPTIONS, SITE_HELP, siteOptions, robotsDirectives, isNoindex, canonicalOf, matchAny } from './site.js';
import { buildReport, UsageError } from './core.js';

export * from './core.js';
export { SITE_OPTIONS, SITE_HELP, siteOptions };

export const RULES = {
  'orphan-page': { severity: 'high', title: 'Indexable page has no internal links pointing to it' },
  'orphan-unreachable': { severity: 'high', title: 'Page has inbound links but cannot be reached by following links from the homepage' },
  'orphan-nofollow-only': { severity: 'medium', title: 'Every internal link to the page is rel=nofollow' },
  'orphan-noindex-only': { severity: 'medium', title: 'Page is only linked from noindex pages' },
  'orphan-too-deep': { severity: 'medium', title: 'Page is more than maxDepth clicks from the homepage' },
  'orphan-single-link': { severity: 'info', title: 'Page has only one internal inbound link' },
  'orphan-home-missing': { severity: 'medium', title: 'No homepage (index.html) found, so click depth cannot be measured' },
  'orphan-dead-end': { severity: 'low', title: 'Indexable page has no outgoing internal links' },
  'orphan-js-only-links': { severity: 'low', title: 'Page is only linked via javascript:/onclick or <a> without href, which crawlers do not follow' },
};

/** Build the internal link graph. Returns Map(page -> { out: Set(page), in: Map(page -> {nofollow, line}) }). */
export function linkGraph(site, pages) {
  const g = new Map(pages.map((p) => [p, { out: new Set(), in: new Map(), jsIn: new Set() }]));
  for (const pg of pages) {
    const node = g.get(pg);
    for (const a of pg.doc.anchors) {
      const u = site.resolve(pg, a.href);
      if (!u || (site.origin ? u.origin !== site.origin : u.origin !== 'http://site.invalid')) continue;
      const t = site.find(u);
      if (!t || t === pg || !g.has(t)) continue;
      const nofollow = a.rel.includes('nofollow') || a.rel.includes('ugc') || a.rel.includes('sponsored');
      node.out.add(t);
      const prev = g.get(t).in.get(pg);
      g.get(t).in.set(pg, { nofollow: prev ? prev.nofollow && nofollow : nofollow, line: prev?.line ?? a.line });
    }
    for (const e of pg.doc.all) {
      if (e.tag !== 'a' && e.tag !== 'button' && e.tag !== 'div' && e.tag !== 'span') continue;
      const js = (e.attrs.href && /^javascript:/i.test(e.attrs.href) ? e.attrs.href : '') + ' ' + (e.attrs.onclick || '');
      const m = /(?:location(?:\.href)?\s*=|window\.open\(|navigate\()\s*['"]([^'"]+)['"]/.exec(js);
      if (m) { const u = site.resolve(pg, m[1]); const t = u && site.find(u); if (t && t !== pg && g.has(t)) g.get(t).jsIn.add(pg); }
    }
  }
  return g;
}

/** Breadth-first click depth from a start page following followed links. */
export function clickDepth(graph, start) {
  const depth = new Map(); if (!start) return depth;
  depth.set(start, 0); const q = [start];
  while (q.length) { const p = q.shift(); for (const t of graph.get(p).out) { if (!depth.has(t) && !graph.get(t).in.get(p)?.nofollow) { depth.set(t, depth.get(p) + 1); q.push(t); } } }
  return depth;
}

export function analyze(site, opts = {}, config = {}) {
  const { findings, add } = finder(RULES);
  const maxDepth = opts.maxDepth ?? config.maxDepth ?? 3;
  const ignore = [...(config.ignore || []), ...(opts.ignore || [])];
  const startPath = opts.start ?? config.start ?? '/';
  const pages = contentPages(site);
  const g = linkGraph(site, pages);
  const home = site.find(startPath);
  if (!home && pages.length) add('orphan-home-missing', startPath, `No page found at ${startPath}`, 'Build an index.html, or pass --start with the entry page.', {});
  const depth = clickDepth(g, home);
  const indexable = (p) => !isNoindex(robotsDirectives(site, p)) && (() => { const c = canonicalOf(site, p).url; if (!c) return true; const t = site.find(c); return !t || t === p; })();
  let orphans = 0; let maxSeen = 0;
  for (const pg of pages) {
    if (pg === home || !indexable(pg) || matchAny(ignore, pg.path) || matchAny(ignore, pg.file)) continue;
    const n = g.get(pg); const inbound = [...n.in.entries()];
    const at = { file: pg.file };
    if (!inbound.length) {
      orphans++;
      if (n.jsIn.size) add('orphan-js-only-links', pg.path, `${pg.path} is only reachable via script navigation from ${[...n.jsIn].map((p) => p.path).slice(0, 3).join(', ')}`, 'Use a real <a href> link so crawlers can follow it.', at);
      else add('orphan-page', pg.path, `${pg.path} has no internal links pointing to it`, 'Link to it from a relevant page, hub or navigation, or noindex/remove it if it should not be found.', at);
      continue;
    }
    if (inbound.every(([, v]) => v.nofollow)) { add('orphan-nofollow-only', pg.path, `All ${inbound.length} internal link(s) to ${pg.path} are nofollow`, 'Drop rel=nofollow on internal links to pages you want crawled.', { file: inbound[0][0].file, line: inbound[0][1].line }); continue; }
    const fromIndexable = inbound.filter(([p]) => indexable(p));
    if (!fromIndexable.length) { add('orphan-noindex-only', pg.path, `${pg.path} is only linked from noindex page(s): ${inbound.map(([p]) => p.path).slice(0, 3).join(', ')}`, 'Link to it from an indexable page as well.', { file: inbound[0][0].file, line: inbound[0][1].line }); continue; }
    if (home) {
      if (!depth.has(pg)) add('orphan-unreachable', pg.path, `${pg.path} cannot be reached from ${home.path} (linked only from ${inbound.map(([p]) => p.path).slice(0, 3).join(', ')})`, 'Connect this cluster of pages to the main navigation or a hub page.', at);
      else { const d = depth.get(pg); maxSeen = Math.max(maxSeen, d); if (d > maxDepth) add('orphan-too-deep', pg.path, `${pg.path} is ${d} clicks from ${home.path} (max ${maxDepth})`, 'Link to it from a higher-level page (category hub, related posts, footer).', at); }
    }
    if (inbound.length === 1 && (opts.singleLink ?? config.singleLink ?? true)) add('orphan-single-link', pg.path, `${pg.path} has one internal inbound link (from ${inbound[0][0].path})`, 'Add contextual links from related pages.', at);
  }
  for (const pg of pages) if (indexable(pg) && !g.get(pg).out.size && pages.length > 1 && !matchAny(ignore, pg.path)) add('orphan-dead-end', pg.path, `${pg.path} has no outgoing internal links`, 'Add navigation or related links so users and crawlers can continue.', { file: pg.file });
  return { findings, info: { orphans, maxDepth: maxSeen, start: home?.path ?? null }, summary: `${pages.length} page(s); ${orphans} orphan(s); deepest page ${maxSeen} click(s) from ${home?.path ?? '(no homepage)'}` };
}

export function check(dir, opts = {}, config = {}, configFile) {
  const tool = { name: 'orphan-beacon', version: opts.toolVersion || '1.0.0', rules: RULES, emoji: '🧭', defaultFile: 'index.html' };
  return runBeacon(tool, dir, { ...opts, UsageError }, config, configFile, analyze, buildReport);
}
