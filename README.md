# orphan-beacon

> Find the pages in your built static site that nothing links to, and measure how many clicks every page is from the homepage.

Search engines discover and weigh pages through internal links. A page that only exists in the sitemap, a blog series that only links to itself, or a product buried six clicks deep gets crawled rarely and ranks poorly. `orphan-beacon` builds the internal link graph from your built HTML, walks it from the homepage like a crawler, and reports orphans, unreachable clusters and deep pages with the file, severity and a **concrete fix**.

CLI, library and GitHub Action. Node.js 18+, **zero runtime dependencies**. Works on any static build output (Astro, Next.js `output: 'export'`, Eleventy, Hugo, Jekyll, Docusaurus, VitePress, plain HTML) and runs offline: point it at the folder your build writes. By Louis Wright.

## Features

- **Orphans:** indexable pages with no internal inbound links (noindex pages and pages canonicalised elsewhere are skipped).
- **Reachability:** pages that are linked, but only from a cluster that the homepage cannot reach; pages linked only with `rel=nofollow`/`ugc`/`sponsored`; pages linked only from noindex pages; pages only reachable via `javascript:`/`onclick` navigation.
- **Click depth:** breadth-first shortest path from the homepage (or `--start`) following crawlable links; pages deeper than `--max-depth` (default 3).
- **Link equity hints:** pages with a single inbound link (info) and dead-end pages with no outgoing internal links.
- Resolves relative, root-relative and absolute same-origin links, `<base href>`, trailing-slash, `index.html` and `--clean-urls` variants.
- Text/JSON/SARIF/Markdown output, `--fail-on`, exit codes 0/1/2, allowlist with expiry, severity overrides, GitHub Action with job summary.

### Scope

orphan-beacon measures the link graph; it does not report broken links or missing targets (use static-link-sentinel) and does not follow redirects (redirect-sentinel). Links to pages that are not in the build are ignored.

## Rules

| Rule | Default severity | What it means |
|---|---|---|
| `orphan-page` | high | Indexable page has no internal links pointing to it |
| `orphan-unreachable` | high | Page has inbound links but cannot be reached by following links from the homepage |
| `orphan-nofollow-only` | medium | Every internal link to the page is rel=nofollow |
| `orphan-noindex-only` | medium | Page is only linked from noindex pages |
| `orphan-too-deep` | medium | Page is more than maxDepth clicks from the homepage |
| `orphan-single-link` | info | Page has only one internal inbound link |
| `orphan-home-missing` | medium | No homepage (index.html) found, so click depth cannot be measured |
| `orphan-dead-end` | low | Indexable page has no outgoing internal links |
| `orphan-js-only-links` | low | Page is only linked via javascript:/onclick or <a> without href, which crawlers do not follow |
| `allowlist-expired` | medium | An allowlist entry is past its `expires` date |
| `allowlist-unused` | info | An allowlist entry matched nothing |

## Install and run

```bash
npx orphan-beacon dist
npx orphan-beacon dist --max-depth 4 --fail-on medium
npx orphan-beacon public --ignore "/landing/**,/campaign-*"
npx orphan-beacon out --clean-urls --format json > link-graph.json
```

Pages are mapped to URLs the way static hosts serve them: `index.html` → `/`, `blog/index.html` → `/blog/`, `about.html` → `/about.html` (or `/about` with `--clean-urls`). Pass `--base-url` with your public URL, or let it be inferred from canonical / `og:url` tags. Meta-refresh redirect stubs and `404.html` are skipped. `X-Robots-Tag` and `Link` headers are read from Netlify/Cloudflare `_headers` and `vercel.json`.

### Sample output

```text
orphan-beacon — /workspace/orphan-beacon/test/fixtures/bad
13 page(s); 2 orphan(s); deepest page 5 click(s) from /

HIGH     island-a.html /island-a.html cannot be reached from / (linked only from /island-b.html) [orphan-unreachable]
         ↳ fix: Connect this cluster of pages to the main navigation or a hub page.
HIGH     island-b.html /island-b.html cannot be reached from / (linked only from /island-a.html) [orphan-unreachable]
         ↳ fix: Connect this cluster of pages to the main navigation or a hub page.
HIGH     orphan.html /orphan.html has no internal links pointing to it [orphan-page]
         ↳ fix: Link to it from a relevant page, hub or navigation, or noindex/remove it if it should not be found.
MEDIUM   d.html /d.html is 4 clicks from / (max 3) [orphan-too-deep]
         ↳ fix: Link to it from a higher-level page (category hub, related posts, footer).
MEDIUM   dead.html /dead.html is 5 clicks from / (max 3) [orphan-too-deep]
```

## Options

```text
orphan-beacon 1.0.0 — find orphan pages and measure click depth in your built static site

Usage: orphan-beacon [site-dir] [options]

Site
      --base-url <url>        Public URL of the site, e.g. https://example.com (default: inferred from canonical/og:url)
      --include <globs>       Only check these pages (file or URL path globs, comma-separated)
      --exclude <globs>       Skip these pages
      --clean-urls            Pages are served without .html (about.html -> /about)
Checks
      --max-depth <n>          Report pages more than n clicks from the homepage (default 3)
      --start <path>           Entry page for click depth (default /)
      --ignore <globs>         Pages that are fine without inbound links (landing pages, campaign pages)
      --no-single-link         Do not report pages with only one inbound link

Common
  -c, --config <file>     JSON config (default: .orphan-beacon.json or "orphanBeacon" in package.json)
  -f, --format <fmt>      text (default) | json | sarif | markdown
      --json <file>       Also write a JSON report
      --sarif <file>      Also write SARIF 2.1.0
      --markdown <file>   Also write Markdown (e.g. for a job summary)
      --fail-on <sev>     critical | high | medium | low | info | none (default: high)
      --list-rules        Print rules and default severities
      --no-fixes          Hide fix suggestions in text output
      --no-color          Disable colours
  -v, --version / -h, --help

Exit codes: 0 = passed, 1 = findings at or above --fail-on, 2 = usage, config or read error.
```

## Configuration and allowlist

Options can live in `.orphan-beacon.json` (or a `"orphanBeacon"` key in `package.json`, or `--config <file>`):

```json
{
  "failOn": "medium",
  "severity": {
    "orphan-page": "low"
  },
  "allowlist": [
    {
      "rule": "orphan-page",
      "subject": "/campaign/*",
      "reason": "Campaign pages are reached from email and ads only",
      "expires": "2027-03-31"
    }
  ],
  "maxDepth": 3,
  "ignore": [
    "/campaign/**"
  ]
}
```

- **`severity`** changes a rule's severity, or turns it `"off"`.
- **`allowlist`** entries suppress matching findings. Each needs a `reason` and matches on any combination of `rule`, `file`, `subject` (globs with `*`) and `match` (a substring of the message). Add `expires` (`YYYY-MM-DD`) so the exception is time-boxed: once it lapses the finding comes back along with an `allowlist-expired` finding (medium). Entries that no longer match anything are reported as `allowlist-unused` (info).

Config can also set `baseUrl`, `include`, `exclude` and `cleanUrls`. The config file is looked up in the site directory first, then in the current directory, so `.orphan-beacon.json` can live at your repository root. Other keys: `maxDepth` (default 3), `start` (default `/`), `ignore` (globs) and `"singleLink": false`.

## Output and exit codes

- `--format text` (default), `json`, `sarif` (SARIF 2.1.0 for GitHub code scanning) or `markdown` (for job summaries and PR comments). `--json`, `--sarif` and `--markdown` write extra report files in the same run.
- `--fail-on <severity>` sets the threshold (`critical`, `high`, `medium`, `low`, `info`, `none`; default `high`).
- Exit codes: **0** passed, **1** findings at or above `--fail-on`, **2** usage, config or read error.

## GitHub Action

```yaml
permissions:
  contents: read
  security-events: write   # only needed for the SARIF upload
jobs:
  orphan-beacon:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with: { persist-credentials: false }
      - run: npm ci && npm run build   # produce the static site first
      - uses: MrLouisWright/orphan-beacon@v1
        with:
          path: dist
          fail-on: high
          sarif: orphan-beacon.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: orphan-beacon.sarif }
```

| Input | Description | Default |
|---|---|---|
| `path` | Built site directory (e.g. dist, public, _site) | `.` |
| `base-url` | Public URL of the site, e.g. https://example.com | |
| `fail-on` | Failure threshold | `high` |
| `config` | Config file path | |
| `sarif` / `json` | Write SARIF / JSON report to this path | |
| `job-summary` | Add the Markdown report to the job summary | `true` |
| `args` | Extra CLI arguments | |

The action runs the bundled CLI with Node 20; it has no dependencies to install. Pin it to a commit SHA if your policy requires it.

## Library

```js
import { check } from "orphan-beacon";
const report = check("dist", { maxDepth: 4 });
console.log(report.info); // { pages, orphans, maxDepth, start }
```

Types are included.

## Requirements

Node.js 18 or newer. Zero runtime dependencies.

## Licence

MIT © Louis Wright. See [LICENSE](LICENSE).
