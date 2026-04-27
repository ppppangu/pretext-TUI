<!-- 补建说明：该目录为后续补建，用于记录 pretext-TUI 的生产化、安全与支持边界；当前进度：Phase 10 已 approve with documented residual risk，补齐 security/support/provenance matrix 并收紧 host-neutral claim 边界。 -->
# Production Notes

`pretext-TUI` is a host-neutral terminal text kernel. Production readiness here means the package exposes clear data contracts, explicit policy inputs, validation gates, and support boundaries for package-owned terminal text data.

Current production posture:

- Public runtime subpaths remain limited to `.`, `./terminal`, `./terminal-rich-inline`, and `./package.json`.
- Plain terminal core accepts sanitized visible text and rejects raw controls.
- Rich inline input is opt-in and policy-bound.
- Rich prepared handles never expose full raw terminal input; hosts that need it keep it separately.
- Rich runtime helpers validate package-created rich handles before using indexed span metadata or opt-in rich text reconstruction.
- Rich diagnostics are redacted, capped, structured, and sample-free by default.
- Rich text reconstruction is explicit opt-in during materialization.
- OSC8 links are metadata only; hosts decide whether and how to open them.
- Bidi format controls are sanitized by default and can be rejected.
- DoS limits exist for input size, control sequence size, diagnostic count, span count, raw-visible map entries, URI length, and reconstruction size. Sanitized truncation reports completeness flags for partial rich metadata.

Production evidence entry points:

- [Security, Support, And Provenance Matrix](security-support-provenance-matrix.md)
- `docs/contracts/terminal-security-profile.md`
- `docs/contracts/public-api-boundary.md`
- `docs/contracts/host-app-boundary.md`
- `SECURITY.md`

Production readiness does not currently claim:

- cryptographic sanitization of every terminal dialect
- safe execution or interpretation of terminal output
- bundled adapters for specific terminal hosts
- arbitrary editing or destructive prefix eviction for append flows
- broad append performance claims beyond focused parity and release telemetry evidence
- whole-application memory behavior

Primary supporting documents:

- `docs/contracts/terminal-contract.md`
- `docs/contracts/public-api-boundary.md`
- `docs/contracts/terminal-security-profile.md`
- `docs/evidence/kernel-capability-matrix.md`
- `docs/evidence/correctness-matrix.md`
- `SECURITY.md`
