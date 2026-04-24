<!-- 补建说明：该目录为后续补建，用于存放 optional competitive benchmark JSON evidence reports；当前进度：Task 4 首版说明，默认不要求提交本地生成报告。 -->
# Benchmark Reports

Generated benchmark evidence reports may be written here with:

```sh
bun run benchmark:evidence:tui
```

Reports use schema `pretext-tui-benchmark-evidence@1` and contain raw samples, statistics, source hashes, runtime metadata, dependency versions, and comparator semantic matrices.

Local reports can be dirty-machine development artifacts. Only clean reports with `git.dirty: false` should be used for public performance claims.

