# TUI Text Corpora

This directory contains reusable plain-text fixtures for terminal layout testing.

The corpora are source text inputs that later TUI oracle, fuzz, and benchmark scripts may sample under terminal column widths.

## Contents

- `*.txt` files are the reusable text fixtures.
- `sources.json` records source metadata that is useful for attribution and fixture selection.

## Scope

These files should stay free of browser-specific status claims.

Terminal validation scripts should decide their own column widths, width profiles, and sampling strategy.

## Maintenance Rules

- Keep clean source text.
- Prefer fixtures that broaden real terminal text classes: CJK, right-to-left scripts, emoji, combining marks, URLs, hard spaces, tabs, and mixed app text.
- Do not add browser font, pixel, or page-rendering assumptions to this directory.
