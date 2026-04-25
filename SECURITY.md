# Security Policy

## Reporting a Vulnerability

If you believe you have found a security vulnerability in `pretext-TUI`, please report it privately through GitHub's private vulnerability reporting flow:

<https://github.com/ppppangu/pretext-TUI/security/advisories/new>

Please do not open a public GitHub issue for sensitive reports.

When possible, include:

- A short description of the issue and why it matters
- Affected version(s)
- Reproduction steps or a small proof of concept
- Any suggested fix or mitigation

Maintainers review reports on a best-effort basis and coordinate fixes before public disclosure when the report is in scope.

## Response And Disclosure

Reports are triaged privately through GitHub Security Advisories. Sensitive details should stay out of public issues, release notes, benchmark reports, and marketing copy until a fix, mitigation, or no-impact determination is ready to share.

Expected handling:

- Acknowledge and triage reports as soon as practical, without promising a fixed SLA.
- Confirm whether the issue affects the published package surface, the opt-in rich sidecar, repository-only validation tooling, or an out-of-scope host behavior.
- Coordinate a fix, mitigation, or advisory text privately with the reporter when possible.
- Publish public disclosure through a GitHub advisory, changelog/release note, or issue only after the fix or mitigation path is available, unless earlier disclosure is needed to protect users.
- Keep disclosure host-neutral: this package does not certify or promise behavior for any specific host application.

## Supported Versions

Security fixes, when needed, target the latest published version of `pretext-tui`.

Backports are not guaranteed. They may be considered only for actively used older release lines when the fix is narrow, low risk, and can be validated with the current TUI gates. If a backport is not practical, the supported mitigation is to upgrade to the latest fixed release.

Unpublished branches, local benchmark evidence reports, repository-only planning documents, and consumer host integrations are not supported release lines for security fixes.

## Scope

`pretext-TUI` is a terminal-cell text layout library. The most relevant reports are issues that could affect consumers using the package in real applications, for example:

- Unexpected code execution paths
- Vulnerabilities introduced by published package contents
- Denial-of-service style behavior from malicious inputs
- Rich inline text that reintroduces unsafe terminal controls into visible text or default materialization
- OSC8 policy bypasses, credential leakage, bidi format control bypasses, or raw unsafe payload retention outside explicit policy

For non-security bugs or feature requests, please use public GitHub issues instead.

## Current Security Boundary

The plain terminal core accepts sanitized visible text and rejects raw terminal controls.

The opt-in `pretext-tui/terminal-rich-inline` path parses supported inline `SGR` style metadata and `OSC8` link metadata. Unsupported controls are sanitized by default or rejected under stricter policy. Prepared rich handles do not expose full raw terminal input, diagnostics are redacted, capped, and sample-free by default, and `ansiText` reconstruction is explicit opt-in during materialization.

This package does not open links, execute commands, write clipboard contents, interpret terminal control behavior, or decide host trust policy. Hosts own those behaviors.
