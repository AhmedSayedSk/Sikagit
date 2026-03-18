# Security Policy

## Supported Versions

| Version | Supported |
|:--------|:----------|
| Latest (`master`) | Yes |
| Older releases | No |

## Reporting a Vulnerability

If you discover a security vulnerability in SikaGit, please report it responsibly.

**Do NOT open a public issue.** Instead, email us directly:

**info@sikasio.com**

Include the following in your report:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Response Timeline

- **Acknowledgment:** Within 48 hours
- **Initial assessment:** Within 5 business days
- **Fix & disclosure:** We aim to resolve confirmed vulnerabilities within 30 days

## Scope

This policy covers the SikaGit application code in this repository. It does not cover third-party dependencies — please report those to their respective maintainers.

## Security Best Practices for Users

- **Never expose SikaGit to the public internet.** It is designed to run locally or on a trusted private network.
- **Keep your `.env` file private.** It may contain tokens and credentials.
- **Use SSH keys** for git remote operations instead of embedding credentials in URLs.
- **Keep Docker updated** to get the latest security patches.

## Recognition

We appreciate responsible disclosure. Contributors who report valid security issues will be credited in the release notes (unless they prefer to remain anonymous).
