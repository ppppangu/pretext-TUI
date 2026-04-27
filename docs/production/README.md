<!-- 补建说明：该目录为后续补建，用于记录 pretext-TUI 的生产化、安全与支持边界；当前进度：Phase 7 补充 rich sidecar capability gate 与内部 metadata 索引 hardening。 -->
# Production Notes

`pretext-TUI` is a host-neutral terminal text kernel. Production readiness here means the package exposes clear data contracts and safe defaults for untrusted terminal text; it does not mean the package owns rendering, input handling, process execution, clipboard, link opening, persistence, or application policy.

Current production posture:

- Public runtime subpaths remain limited to `.`, `./terminal`, `./terminal-rich-inline`, and `./package.json`.
- Plain terminal core accepts sanitized visible text and rejects raw controls.
- Rich inline input is opt-in and policy-bound.
- Rich prepared handles do not expose full raw terminal input.
- Rich prepared handles never expose full raw terminal input; hosts that need it keep it separately.
- Rich runtime helpers validate package-created rich handles before using indexed span metadata or opt-in ANSI reconstruction.
- Rich diagnostics are redacted, capped, structured, and sample-free by default.
- ANSI reconstruction is explicit opt-in during materialization.
- OSC8 links are metadata only; hosts decide whether and how to open them.
- Bidi format controls are sanitized by default and can be rejected.
- DoS limits exist for input size, control sequence size, diagnostic count, span count, raw-visible map entries, URI length, and ANSI reconstruction size. Sanitized truncation reports completeness flags for partial rich metadata.

Production readiness does not currently claim:

- cryptographic sanitization of every terminal dialect
- safe execution or interpretation of terminal output
- bundled adapters for specific terminal hosts
- browser, DOM, Canvas, or pixel measurement support
- chunked append storage performance beyond the current honest invalidation counters

Primary supporting documents:

- `docs/contracts/terminal-contract.md`
- `docs/contracts/public-api-boundary.md`
- `docs/contracts/terminal-security-profile.md`
- `SECURITY.md`
