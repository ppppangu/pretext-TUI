<!-- 补建说明：该文件为后续补建，用于冻结 terminal rich sidecar 的 host-neutral 安全 profile 与 raw/ANSI/OSC8/bidi 策略；当前进度：Task 2 首版，作为 API、测试、文档和 review gate 的共同依据。 -->
# Terminal Security Profile

This contract defines the security boundary for `pretext-tui/terminal-rich-inline`.

The goal is not to become a terminal emulator, renderer, shell, clipboard layer, or host application policy engine. The goal is narrower: turn raw rich terminal inline text into safe visible text plus structured metadata while preserving enough provenance for search, copy, audit, and source-range mapping.

## Public Profiles

The public profile names are host-neutral:

| Profile | Intended workload | Default behavior |
| --- | --- | --- |
| `default` | general TUI/log/editor-pane rich inline input | sanitize unsupported controls, do not retain raw text, allow `https`, `http`, and `mailto` OSC8 metadata |
| `transcript` | long append-heavy transcript or log records that need provenance | sanitize unsupported controls, retain raw fingerprint only, use higher input/control limits |
| `audit-strict` | high-sensitivity inspection or ingestion pipelines | reject unsupported controls and bidi format controls, do not retain raw text, allow `https` OSC8 only, disable ANSI re-emission |

These names intentionally do not encode product names or host frameworks. A host can map them to its own policy presets without turning this package into a named-host adapter.

## Raw Retention

Prepared rich handles must not expose full raw terminal input.

Raw retention policies:

- `none`: no raw summary is exposed.
- `fingerprint`: expose raw length and stable fingerprint only.
- `capped-sample`: expose escaped capped sample plus fingerprint.

Full raw terminal input is not part of the public prepared handle contract. Hosts that need full raw audit storage should keep it in host-owned storage and use pretext ranges/fingerprints to correlate back to it.

Diagnostics must not expose full unsafe `sequence` fields. They expose:

- diagnostic kind and code
- control family
- raw start/end offsets
- raw length
- redaction flag
- escaped capped sample only when explicitly configured
- stable fingerprint
- policy profile name

## OSC8 Policy

OSC8 is metadata over visible text, not host-owned behavior.

The package validates:

- URI has an absolute scheme.
- Scheme is in the profile allowlist.
- Credentials are denied unless explicitly allowed.
- URI length is capped.
- URI contains no terminal controls.

The package does not open links, fetch URLs, route clicks, or infer user trust. Hosts own all link actions.

## ANSI Re-Emission

Materialization returns `fragments` as the safe default.

`ansiText` is only emitted when the caller explicitly asks for it:

```ts
materializeTerminalRichLineRange(prepared, line, { ansiText: 'sgr' })
materializeTerminalRichLineRange(prepared, line, { ansiText: 'sgr-osc8' })
```

The prepared policy can cap or disable re-emission. `audit-strict` disables it by default.

## Bidi Format Controls

Trojan Source-style bidi format controls are not valid visible terminal text for this library.

The rich path sanitizes them by default and can reject them. The plain core rejects them before preparation.

## DoS Limits

Policy limits cover:

- max input code units
- max control sequence code units
- max spans
- max raw-visible map entries
- max diagnostics
- max OSC8 URI code units
- max reconstructed ANSI output code units

When a limit is hit, sanitize-mode records a redacted diagnostic and marks completeness state where public arrays may be partial; reject-mode throws without including unsafe raw payloads in the error message.

## Host Boundary

Hosts remain responsible for:

- rendering fragments
- applying themes
- opening links
- clipboard policy
- trust prompts
- persistence and audit storage
- network, file, shell, or process behavior

`pretext-TUI` only supplies terminal text coordinates, visible text, rich metadata, and policy-bound diagnostics.
