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

I will review reports on a best-effort basis and coordinate a fix before any public disclosure.

## Supported Versions

Security fixes, when needed, will be made against the latest published version of `pretext-tui`.

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
