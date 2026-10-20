# Changelog

## 1.0.1 - 2026-10-20

- Docs: README badges, credit and support sections, links to the project site; homepage now points to the project site.
- No changes to the package code.

## 1.0.0 (2026-10-14)

First release, by Louis Wright.

- Internal link graph from built HTML (relative, root-relative, same-origin absolute, `<base href>`, clean URLs).
- Orphan pages, unreachable clusters, nofollow-only, noindex-only and script-only inbound links.
- Click depth from the homepage (or `--start`) with `--max-depth`.
- Single-inbound-link (info) and dead-end pages.
- Text/JSON/SARIF/Markdown output, `--fail-on`, exit codes 0/1/2, allowlist with expiry, severity overrides.
- Composite GitHub Action with job summary.
