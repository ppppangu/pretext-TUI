# TUI Corpus Taxonomy

This taxonomy is for selecting terminal text fixtures, not classifying browser layout mismatches.

## Useful Fixture Classes

- ASCII prose and logs
- CJK prose
- Korean and Japanese mixed punctuation
- right-to-left scripts
- Indic scripts and combining marks
- Thai, Lao, Khmer, and Myanmar text
- emoji and emoji ZWJ sequences
- URLs and query strings
- hard spaces, word joiners, zero-width breaks, and soft hyphens
- mixed app text with commands, labels, and status-like fragments

## Selection Rules

- Prefer clean source text over noisy scraped scaffolding.
- Prefer fixtures that expose terminal cell-width or wrapping behavior.
- Avoid adding a fixture only because it used to be a browser-specific mismatch.

## Future Work

Later TUI corpus scripts should assign deterministic columns and terminal width profiles for these fixture classes.
