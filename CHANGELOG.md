# Changelog

## 0.0.0

Initial terminal-package migration release.

- Exposes a terminal-first package story under `pretext-tui`.
- Retargets the active package surface toward terminal cells, rows, ranges, and lazy materialization.
- Removes browser demos, browser validation scripts, and browser snapshot dashboards from the active package surface.
- Adds deterministic terminal width profiles and terminal API facade work as the basis for upcoming releases.
- Adds the `./terminal-rich-inline` sidecar for inline SGR/OSC8 metadata.
- Adds TUI-only validation gates covering static checks, goldens, corpus invariants, fuzzing, benchmarks, CI, and package smoke.
- Adds a deterministic terminal demo that shows prepare, resize reflow, and visible-window materialization over a mixed terminal transcript.
- Adds runtime-opaque sparse-anchor virtual text primitives for fixed-column page caching, source-offset lookup, and append invalidation metadata.
- Fixes source-offset lookup/projection exactness so out-of-range requests clamp to a safe boundary with `exact: false`, and rejects invalid runtime bias values.
- Ships a clean publishable tarball with only public root `dist/` wrappers and implementation modules internalized under `dist/internal/`.

This version is intentionally pre-1.0 while the terminal API continues to mature.
