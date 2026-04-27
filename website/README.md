<!-- 补建说明：该目录为后续补建，用于承载 pretext-tui 的静态官网源码；当前进度：首版官网已按包的 terminal-first 定位、SEO 元数据与 Cloudflare Pages 可部署形态搭建，且保持在 npm package surface 之外。 -->
# pretext-tui site

This directory contains a dependency-free static website for `pretext-tui`.

It is intentionally outside the npm package `files` allowlist. The site introduces the project, links to public install surfaces, and keeps performance wording tied to evidence report ids instead of copying dynamic benchmark numbers.

## Local Preview

Open `index.html` directly in a browser, or serve the directory with any static file server.

## Cloudflare Pages

Use `website` as the Pages project root/output directory. No build command is required.
