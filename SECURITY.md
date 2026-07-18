# Security Policy

## Supported Versions

This project is pre-1.0 and published from the `main` branch. Security fixes
are made against the latest release only.

| Version | Supported |
| ------- | --------- |
| 0.x     | ✅        |

## Reporting a Vulnerability

Please **do not open a public GitHub issue** for security vulnerabilities.

Instead, report it privately using
[GitHub's private vulnerability reporting](https://github.com/shubhamtaywade82/trading-concepts-ts/security/advisories/new)
for this repository (Security tab → "Report a vulnerability"). If that isn't
available, open a draft security advisory or contact the maintainer directly
through their GitHub profile.

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce (a minimal code sample is ideal)
- The affected version(s)

You should expect an initial response within a few days. Once a fix is
available, it will be released and the advisory will be published with credit
to the reporter (unless anonymity is requested).

## Scope

This library is a pure computation engine — it consumes candle data you
provide and returns computed pattern/zone data. It does not make network
requests, execute dynamic code, or touch the filesystem. The most relevant
security surface is:

- **Supply chain**: dependency vulnerabilities (tracked via Dependabot,
  `npm audit`/`audit-ci` in CI, and CodeQL)
- **Input handling**: malformed candle data should throw a clear error
  (`validateCandles`), not silently produce incorrect signals or crash in an
  unexpected way

Reports about either are welcome.
