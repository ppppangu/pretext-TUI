# TODO

Current priorities for hardening the publishable `pretext-TUI` baseline into a host-neutral terminal text kernel.

## Active Next

- Turn production/security readiness into broader adoption material: support matrix, provenance notes, and recipe-level threat-model callouts.
- Keep upcoming chunked append storage host-neutral as it moves from contract planning into implementation.
- Use the explicit benchmark instrumentation now in the release gate to reduce remaining line materialization, width-prefix, and rich fragment work.
- Design chunked append storage before making any append-storage performance claim.
- Prepare launch assets and copy from `docs/marketing/` while keeping performance claims tied to clean benchmark reports.

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
- Unified layout bundles have landed as incubating opaque handles that coordinate source-offset, line-index, and page-cache invalidation for page/projection workflows.
- Generic range sidecar indexes have landed as incubating opaque handles for host-neutral source range lookup with inert metadata only.
- Source-first search sessions have landed as incubating opaque handles over sanitized visible source text with literal/regex modes, generic scopes, optional projection data, and no UI state.
- Selection/extraction helpers have landed as incubating immutable data APIs for coordinate/source selection projection, deterministic source/visible extraction, generic range matches, and rich sidecar fragments without clipboard or active selection state.
- Rich metadata hardening has landed internally: rich handles and materialize options are runtime validated, span/raw-visible maps have indexed range lookup, and release benchmarks track rich index counters without expanding public API.
- Holistic release pass has internalized legacy public-looking dist modules under `dist/internal/`, hardened package smoke, and verified docs/package exports/tarball contents tell one terminal-first story.
- Initial competitive benchmark harness, marketing guardrails, adoption-growth playbook, and post-publishability technical roadmap have landed.
- Post-publishability master plan has landed to coordinate future API, security, recipes, benchmark, performance, append, and launch-readiness swarms.
- Public API boundary gate has landed with opaque prepared handles, declaration snapshots, runtime export allowlists, and negative package smoke checks.
- Production/security rich sidecar gate has landed with host-neutral profiles, raw retention policy, redacted diagnostics, OSC8/bidi/DoS policy, and opt-in ANSI reconstruction.
- Host-neutral recipes have landed for structured transcript-like viewports, terminal pane resize, editor source mapping, and rich ANSI log viewers, with public-import scanning and incubating API labels.
- Benchmark evidence gate has landed: the optional competitive benchmark emits `pretext-tui-benchmark-evidence@1` JSON with raw samples, p50/p95 policy, hashes, runtime/dependency metadata, and comparator semantic matrices.
- Initial terminal hot-path performance pass has landed: prepared grapheme/source geometry is reused across layout/source/append paths, page-cache misses seek once then walk sequentially, anchor/source lookup insertion avoids per-anchor sorting, and release benchmark counters now expose line/rich lookup behavior instead of relying on wall-clock timing alone.

## Not Worth Doing Now

- Do not chase browser pixel parity.
- Do not add Canvas or DOM fallback.
- Do not monkey-patch web globals.
- Do not build a host app framework.
- Do not add renderer-specific dependencies.
- Do not expose host-specific security profiles or adapter-specific knobs.
- Do not keep duplicate public docs for old and new products.

## Fixed Decisions

- The default width profile is `terminal-unicode-narrow@1`.
- Rich materialization exposes structured metadata by default and emits ANSI text only through explicit, policy-bound opt-in.
- Root-level `dist/` is reserved for public wrappers; implementation modules ship only under `dist/internal/` for declaration/runtime resolution.
