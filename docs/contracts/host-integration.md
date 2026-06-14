# Host Integration Contract

`pretext-tui` is a host-neutral terminal text-layout engine: it returns layout
*data* (row ranges, widths, source offsets) and never renders or reads input. A
host (an interactive CLI, an editor pane, a custom TUI) supplies its own renderer, input
loop, and theming. Almost everything the host needs is already an ordinary
prepare option or returned data. The **only** injected capability is the host's
character **width truth**.

This document is normative for anyone embedding the engine in a terminal host.

## 1. The one host capability: width

Terminals disagree on the cell width of some clusters (text-default pictographs
like `⚠`, flag pairs, VS15/VS16 sequences, Indic conjuncts, newer emoji). A host
that already has a terminal-tuned width function should inject it so the engine's
wrapping, projection, selection, and search geometry agree *exactly* with what
the host paints. Otherwise selections, clicks, and highlights drift by N cells.

```ts
import { createInjectedTerminalWidthProfile, prepareTerminal } from 'pretext-tui'

const widthProfile = createInjectedTerminalWidthProfile({
  id: 'my-host/<impl>-<version>',     // see §1.2
  graphemeWidth: (cluster) => myWidthOf(cluster),
})

const prepared = prepareTerminal(text, { whiteSpace: 'pre-wrap', widthProfile })
```

The profile flows through `widthProfile` like any built-in profile; pass it to
`prepareTerminal`, `prepareTerminalCellFlow`, and the rich-inline entry points.
Omit `widthProfile` (or pass `'terminal-unicode-narrow@1'`) to use the engine's
built-in Unicode policy.

### 1.1 The width-function contract

`graphemeWidth: (grapheme: string) => number` MUST be:

- **Pure & deterministic** — same cluster ⇒ same width, for the lifetime of the
  process. The engine memoizes per `(cacheKey, cluster)`.
- **Total** — never throw. It only ever receives a *plain visible grapheme
  cluster*: the engine's control/bidi safety gate runs **first**, so the function
  never sees C0/C1 controls, ESC/CSI/OSC sequences, or bidi format controls.
- **Integer ≥ 0** — the engine validates each returned value once per cache miss
  and throws a descriptive error on a non-integer or negative result. There is no
  upper clamp; an over-wide single cluster is handled by the engine's overflow
  path.
- **Cluster-granular** — width is a property of the whole grapheme cluster
  (flags, keycaps, ZWJ sequences, VS16). The engine owns segmentation; do not try
  to influence cluster boundaries from the width function.

Precedence: the injected function overrides **all** built-in width
classification (combining / regional-indicator / emoji / wide / ambiguous). It
never overrides the control/bidi gate, nor the `controlChars` policy (which still
decides how an allowed control is priced when `controlChars !== 'reject'`).

### 1.2 `id` and cache identity

`id` is the human-readable cache identity. The engine keys all width/segment
caches on a `cacheKey` derived from it. **You MUST change `id` whenever the
function's behavior changes** — e.g. encode the runtime/table version that backs
your width truth (`'my-host/runtime-1.2.3'`). Two profiles with the same `id` are
assumed to produce identical widths; if they don't, caches will be poisoned.
`id` must be non-empty and must not contain `;`.

## 2. ANSI and control bytes: use the rich path

The plain entry points (`prepareTerminal`, `prepareTerminalCellFlow`) **reject**
text containing ESC/CSI/OSC sequences, C0/C1 controls (other than `\t \n \r \f`),
and bidi format controls. Real transcript and tool output contains all of these.
To lay out host output that carries ANSI styling or stray control bytes, use the
rich sidecar instead of sanitizing by hand:

```ts
import { prepareTerminalRichInline } from 'pretext-tui/terminal-rich-inline'

const rich = prepareTerminalRichInline(rawAnsiText, {
  profile: 'transcript',          // sanitize policy: strip unsupported controls
  widthProfile,                   // same injected width truth
})
// rich.prepared  -> a PreparedTerminalText over the sanitized visible text
// rich.spans     -> SGR/OSC8 metadata with raw↔visible source offsets
```

The rich path is the engine's canonical sanitizer: it strips/normalizes unsafe
bytes, preserves the raw↔visible offset mapping, and enforces a URI/scheme
security policy for OSC8 links. Do **not** build a per-host sanitizer; a host
function in the width seam cannot express "reject", which is a security
invariant the engine must keep.

Use the plain path only for text the host already knows is plain (no ANSI, no
controls), e.g. pre-stripped search corpora.

## 3. Ownership boundary

| Concern | Owner |
|---|---|
| Character width truth | **Host** (injected `graphemeWidth`) |
| Grapheme segmentation, line breaking, bidi levels, normalization, tabs | Engine |
| Input sanitization / ANSI ingest / OSC8 URI policy | Engine (rich path + prepare options) |
| Rendering, screen diffing, cursor, scrolling | Host |
| Input (keyboard / mouse), focus | Host |
| SGR → theme/style mapping for rich fragments | Host (engine returns style *data*) |
| Opening links, clipboard | Host |

The engine has no `process`/`tty`/runtime references, no rendering, and no host
imports. Portability is a property of this boundary, not of a "port" abstraction:
the dependency arrow points one way (host → `pretext-tui`).

## 4. Reusing the engine in another host

A second host (a different AI-coding CLI, a custom TUI) reuses the engine by
supplying exactly: (a) its width function, (b) its prepare defaults
(`whiteSpace`, `tabSize`, rich `profile`, OSC8 `allowedSchemes`), (c) a mapping
from returned style data to its renderer. Everything else — wrapping, paging,
layout bundles, cell flows, search, selection, coordinate projection — is reused
unchanged. There is no per-host package to publish and no adapter framework to
build.

## 5. Future-optimal width (non-breaking evolution)

Because `widthProfile` is prepare-time identity, hosts converge on a better width
truth by changing one value, with no API change:

1. Inject the host's current width truth (zero regression).
2. Build a real-terminal divergence corpus + quarantine table.
3. When a shared, terminal-validated policy (e.g. a future
   `terminal-consensus@N` built-in profile, or a per-terminal probed profile a
   host constructs) is more correct, swap the `widthProfile` value. Cache
   identity rolls automatically.

Per-terminal width *detection* (CPR / DECRQM-2027 probing) requires terminal I/O
and is therefore a **host** feature, never engine code; it ships as just another
injected profile.
