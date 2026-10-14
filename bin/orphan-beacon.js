#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mainCli, check, RULES, SITE_OPTIONS, SITE_HELP, UsageError, splitList } from '../src/index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
mainCli({
  name: 'orphan-beacon', version: pkg.version, configKey: 'orphanBeacon', rules: RULES,
  tagline: 'find orphan pages and measure click depth in your built static site',
  usage: 'Usage: orphan-beacon [site-dir] [options]',
  help: `${SITE_HELP}Checks
      --max-depth <n>          Report pages more than n clicks from the homepage (default 3)
      --start <path>           Entry page for click depth (default /)
      --ignore <globs>         Pages that are fine without inbound links (landing pages, campaign pages)
      --no-single-link         Do not report pages with only one inbound link
`,
  options: { ...SITE_OPTIONS, 'max-depth': { type: 'string' }, start: { type: 'string' }, ignore: { type: 'string', multiple: true }, 'no-single-link': { type: 'boolean' } },
  run: async ({ dir, values: o, config, configFile }) => {
    let md; if (o['max-depth'] != null) { md = Number(o['max-depth']); if (!Number.isInteger(md) || md < 1) throw new UsageError('--max-depth must be a positive integer'); }
    return check(dir, { cli: o, maxDepth: md, start: o.start, ignore: splitList(o.ignore), singleLink: o['no-single-link'] ? false : undefined, toolVersion: pkg.version }, config, configFile);
  },
});
