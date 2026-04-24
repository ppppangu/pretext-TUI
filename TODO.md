# TODO

Current priorities for turning `pretext-TUI` into a publishable terminal-cell layout package.

## Completed

- Initial package contracts are frozen.
- Browser product surface has been removed from active package exports, scripts, workflow, and status docs.
- Initial terminal width backend and measurement boundary have landed.
- Initial terminal-first API facade and TUI core tests have landed.
- Package exports and smoke tests now target the terminal API surface.
- Initial terminal rich metadata sidecar has landed.
- TUI-only validation stack and CI have landed.
- Terminal vertical slice demo has landed with a mixed transcript fixture, row-count precomputation, resize reflow, and visible-window materialization.
- Sparse-anchor virtual text primitives have landed with opaque handles, source-offset lookup, fixed-column page caching, append invalidation metadata, and benchmark counters.

## 1. Holistic Release Pass

- Remove or internalize any remaining legacy public-looking internals from the tarball.
- Re-run the full validation gate.
- Verify docs, package exports, and tarball contents tell one terminal-first story.

## Not Worth Doing Now

- Do not chase browser pixel parity.
- Do not add Canvas or DOM fallback.
- Do not monkey-patch web globals.
- Do not build a host app framework.
- Do not add renderer-specific dependencies.
- Do not expose many knobs before the terminal profile model is stable.
- Do not keep duplicate public docs for old and new products.

## Open Questions

- Should internal layout modules be split before publish so `dist/layout.js` no longer contains legacy-shaped helper exports?

## Fixed Decisions

- The default width profile is `terminal-unicode-narrow@1`.
- Rich materialization should expose structured metadata and may also emit ANSI text for consumers that need terminal strings.
