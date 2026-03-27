Current priorities:

1. Keep the canaries honest

- Mixed app text still has the extractor-sensitive `710px` soft-hyphen miss.
- Chinese is still the clearest active CJK canary: Safari anchors are exact, while Chrome keeps a broader narrow-width positive field and `PingFang SC` is worse than `Songti SC`.
- Myanmar is still informative because some tempting Chrome-only heuristics do not survive Safari.
- Urdu remains a real shaping/context canary, but it is not on the active roadmap right now.

2. Next engine work

- Broaden canaries only when the sources are clean.
- Expand the sampled font matrix where canaries are still imperfect, especially Chinese.
- Revisit the mixed-app `710px` miss only if a cleaner paragraph-scale reproducer emerges.
- Keep the hot `layout()` path simple and allocation-light while the rich path absorbs userland layout needs.

3. Demo work

- Push the dynamic-layout demo toward richer editorial layouts instead of leaving it as a one-off.
- Try an “Old Man and the Sea” resize / reflow demo.
- Revisit a synced multi-view demo only if it earns its complexity again.

Not worth doing right now:

- Do not chase universal exactness as the product claim.
- Do not put measurement back in `layout()`.
- Do not resurrect dirty corpora just to cover another language.
- Do not overfit one-line misses in a single browser/corpus without broader evidence.
- Do not explode the public API with cache or engine knobs.
- Do not replace `Intl.Segmenter` / browser-oriented preprocessing with `text-shaper`'s pure TypeScript segmentation or greedy glyph-line breaker.

Still-open design questions:

- Whether line-fit tolerance should stay as a browser shim or move toward runtime calibration.
- Whether explicit hard breaks / paragraph-aware layout should become first-class.
- If there is strong real-world demand for `system-ui`, whether to add a narrow prepare-time DOM prefix fallback for detected bad tuples instead of trying to force a pure-canvas fix.
- Whether server canvas support should become an explicit supported backend.
- Whether the rich path eventually wants a fuller bidi metadata helper for custom rendering or selection-like work, without changing the hot-path layout architecture.
- Whether automatic hyphenation beyond manual soft hyphen is in scope, and if so whether it should stay entirely preprocess-driven or expose any language or pattern hooks.
- Whether intrinsic sizing / logical width APIs are needed beyond fixed-width height prediction.
- Whether bidi rendering concerns like selection and copy/paste belong here or stay out of scope.
