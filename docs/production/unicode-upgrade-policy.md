<!-- 补建说明：该文件为后续补建，用于规定 pretext-TUI 采用新 Unicode 版本的治理流程：新版本作为新的 width profile 版本落地、永不变更已发布版本的语义；当前进度：首版定义 regenerate/re-validate/cache identity/deprecation 与每次升级独立 approval record 的要求，未采用 terminal-unicode-narrow@2。 -->
# Unicode Upgrade Policy

`pretext-TUI` pins one width profile version, `terminal-unicode-narrow@1`, at one
Unicode data version. This policy governs how a new Unicode version is adopted.

## Core Rule

A new Unicode version lands as a new width profile version, for example
`terminal-unicode-narrow@2`. It never mutates the published semantics of an existing
profile version. `terminal-unicode-narrow@1` keeps its frozen behavior even after a
later version exists.

## What Regenerates

- `src/unicode/generated/bidi-data.ts` is regenerated through `bun run generate:bidi-data`
  from a new `DerivedBidiClass` data file. The generator reads the versioned source
  filename (today `scripts/unicode/DerivedBidiClass-17.0.0.txt`); a new version adds a
  new versioned source file rather than overwriting the old one.
- The width tables in `src/unicode/terminal-string-width.ts` are hand-maintained. They
  do not regenerate automatically and need manual review against the new Unicode data
  before a new profile version is published.
- The profile identity fields (`version`, `unicodeVersion`, and the derived `cacheKey`)
  change for the new profile version.

## What Re-Validates

- The reference goldens gain new `@2` cases. The existing `@1` cases must stay
  byte-identical. Dependency to flag: the golden `widthProfile` shape may need
  extending so a case can select which profile version it pins.
- The terminal conformance kit gets a parallel `@2` kit version alongside the `@1` kit;
  the `@1` kit data is not edited.
- The corpus and fuzz gates run under both profile versions during the transition so
  both behaviors stay covered.

## Cache Identity

The `cacheKey` embeds the profile `name@version`, the Unicode data version, and the
policy fields. Because of this, `@1` and `@2` prepared data and width-dependent caches
never collide; a host can hold prepared text from both versions at once without
cross-contamination.

## Deprecation

Old profile versions are kept indefinitely before `1.0`. Removing a profile version is
a breaking change that requires a major version bump and its own approval record.

## Approval

Each Unicode upgrade requires its own approval record describing the new profile
version, the regenerated data, the re-validation evidence, and any residual risk.
