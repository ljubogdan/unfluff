# Security

## Reporting a vulnerability

Please don't open a public issue for security problems. Use GitHub's **Report a vulnerability** button on the repository's Security tab (private vulnerability reporting). You'll get a reply within a few days.

## Design rules

These keep the extension small and auditable. Pull requests that break them won't be merged.

- No remote code, CDNs, or third-party scripts. Everything ships in the repo.
- No `innerHTML`, `eval`, or string-built HTML. DOM is built with `createElement` and `textContent`.
- No new permissions without a strong reason. Today: `storage` and one content script on `linkedin.com`.
- No network requests at all, to any host.
- No automation of user actions (clicking, liking, following, messaging).
- Stored settings are treated as untrusted input and sanitized on load.
