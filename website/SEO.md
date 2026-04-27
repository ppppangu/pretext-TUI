<!-- 补建说明：该文件为后续补建，用于给 pretext-tui 官网上线后的 SEO 与宣发团队提供关键词、页面扩展和发布检查清单；当前进度：首版围绕 terminal-first package story 和 evidence-safe claims 编写。 -->
# SEO launch notes

## Primary positioning

`pretext-tui` is a host-neutral terminal-cell text layout package for long TUI, CLI, log, transcript, editor-pane, and dashboard buffers.

## Target queries

- terminal text layout TypeScript
- TUI text wrapping library
- CLI log viewer text layout
- terminal transcript viewport
- terminal cell width wrapping
- ANSI rich text metadata TypeScript
- source-aware terminal layout
- long terminal buffer paging

## Claim rules

- Cite evidence report ids and workload ids instead of copying dynamic timing numbers.
- Do not claim broad renderer performance, event-loop performance, terminal emulator behavior, or browser text measurement compatibility.
- Keep the product boundary clear: the package owns layout data; hosts own rendering, input, focus, scrolling, clipboard, and product behavior.

## Launch checklist

- Update `index.html` canonical URL after choosing the production domain.
- Update `robots.txt` and `sitemap.xml` to the production domain.
- Submit the production URL to Google Search Console and Bing Webmaster Tools.
- Link to the site from the GitHub repository description, npm package homepage field, and README once the domain is live.
- Use the npm package URL and GitHub repository URL as primary trust anchors.

## Expansion pages

- `/terminal-text-layout` - explain terminal-cell wrapping vs browser pixel measurement.
- `/log-viewer-text-layout` - target log viewer and transcript viewport searches.
- `/ansi-rich-metadata` - explain SGR/OSC8 sidecar security boundaries.
- `/docs` - route to GitHub docs until dedicated docs pages exist.
