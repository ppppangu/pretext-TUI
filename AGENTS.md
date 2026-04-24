## pretext-TUI

Use `README.md` as the public source of truth for the terminal-cell package story. Use `DEVELOPMENT.md` for the active command surface and package workflow. Use `TODO.md` for current migration priorities. Use `STATUS.md` for the compact migration map. Every time before you commit, ensure the docs are synced.

Do `bun install` if you're in a fresh worktree.

**Important:** after you're done with a feature and have enough holistic vision, make sure you do a pass over all touched files again and see if you can simplify anything. Don't change things for the sake of it, but if there are simplifications, report **I DID A HOLISTIC PASS AND FOUND SIMPLIFICATIONS** with a brief summary.

**Important:** do NOT monkey-patch. If you found yourself solving the symptom instead of the root cause, reconsider and do a proper fix, then report **I SOLVED THE ROOT CAUSE NOT THE SYMPTOM** with a brief summary.

Changelog updates guideline: don't add dev-facing notes, only user-facing notes. Refer to closed PR numbers when applicable.

### Scope Rules

- Active runtime scope is pure terminal-cell text layout.
- Do not add browser, Canvas, DOM, web page, or web automation dependencies to active package code.
- Do not add renderer-specific or host-specific dependencies.
- Do not add host application adapters to this package.
- Do not keep two public product stories. The package story is terminal-first.
- Browser-oriented source material must stay out of active source, docs, package exports, scripts, and validation.

### Important Files

- `docs/contracts/terminal-contract.md` — normative terminal semantics and kill criteria.
- `docs/contracts/host-app-boundary.md` — host-neutral package boundary and non-goals.
- `docs/plans/2026-04-23-pretext-tui-terminal-layout-plan.md` — detailed implementation plan.
- `package.json` — package identity, exports, scripts, and publish surface.
- `tsconfig.tui.json` — active TUI runtime typecheck boundary.
- `tsconfig.tui-validation.json` — validation scripts/tests typecheck boundary.
- `tsconfig.build.json` — publish-time emit config for `dist/`.
- `scripts/package-smoke-test.ts` — tarball-level JS/TS consumer verification.
- `src/analysis.ts` — normalization, segmentation, glue rules, and text-analysis phase.
- `src/measurement.ts` — terminal-width measurement adapter used by the prepared/layout pipeline.
- `src/line-break.ts` — internal line-walking core.
- `src/line-text.ts` — lazy line materialization helpers.
- `src/terminal.ts` — terminal public API surface.
- `src/terminal-string-width.ts` — terminal cell-width backend.
- `src/terminal-width-profile.ts` — terminal width profile model.
- `src/terminal-rich-inline.ts` — terminal rich metadata surface.
- `tests/tui/` — deterministic TUI tests and fixtures.
- `scripts/tui-*.ts` — static, oracle, corpus, fuzz, and benchmark release gates.

### Implementation Notes

- Keep shipped library source imports runtime-honest with `.js` specifiers inside `.ts` files.
- `prepareTerminal()` should do width-independent analysis and terminal-width preparation.
- `layoutTerminal()` must stay arithmetic-only.
- `walkTerminalLineRanges()` and next-line range APIs should avoid string materialization.
- Materialization should happen only for requested lines/ranges.
- Source mapping uses UTF-16 code unit offsets over sanitized visible source text.
- Tabs remain structural segments and are measured at layout time from current visible column.
- Terminal fitting uses exact integer-cell comparison only.
- Prepared source data and width-dependent line/page caches must remain separate.
- Rich metadata may model style/link/copy semantics, but not host interaction behavior.
- A terminal static gate must reject active runtime imports/usages of browser globals and web pages.

### New Files And Directories

Follow the parent repository rule:

- every new file starts with a short `补建说明` comment
- every new directory gets a `README.md` with purpose and progress

For JSON snapshot files, use a top-level metadata field instead of invalid JSON comments.

### Validation Expectations

Before marking a migration task done, run the task's specific validation commands from the plan.

Current package publish gate should include:

- TUI typecheck
- TUI validation typecheck
- no-browser static gate
- TUI tests
- deterministic TUI oracle
- TUI corpus check
- TUI fuzzing
- TUI benchmark check
- package smoke test

If a task cannot pass because the active source tree still carries source-project behavior, either complete the planned migration step or explicitly move that behavior out of the active TUI surface. Do not paper over failures with shims.
