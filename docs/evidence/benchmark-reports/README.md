<!-- 补建说明：该目录为后续补建，用于存放 optional competitive benchmark JSON evidence reports；当前进度：Task 4 首版说明，默认不要求提交本地生成报告。 -->
# Benchmark Reports

Generated benchmark evidence reports may be written here with:

```sh
bun run benchmark:evidence:tui
```

Reports use schema `pretext-tui-benchmark-evidence@1` and contain raw samples, statistics, source hashes, runtime metadata, dependency versions, and comparator semantic matrices.

Local reports can be dirty-machine development artifacts. Only clean reports with `git.dirty: false` should be used for public performance claims.

## Accepting A Report As The Cited Evidence Report

The generator intentionally emits no `metadata` field. When a clean report is promoted to the cited evidence report, add a top-level `metadata.note` as the first key, containing the repository `补建说明` convention text plus an acceptance statement naming the report's commit (see the accepted reports in this directory for the wording pattern). Then update the live citation surfaces (`README.md`, `STATUS.md`, `TODO.md`, `status/tui-dashboard.json`, the evidence and production matrices, and the `cleanReportId` plus `shortCommit` assertions in `tests/tui/phase10-evidence-pack.test.ts`). Historical decision records and superseded report files keep the old id as records. Do not edit measurement, hash, git, or claimability data in any report.

