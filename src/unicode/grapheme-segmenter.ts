// 补建说明：该文件为后续补建，用于统一全库 Intl.Segmenter 实例与单一清理入口，去除 analysis/layout/line-text/terminal-string-width/terminal-grapheme-geometry 五处重复的 grapheme/word 分词器缓存；当前进度：R1 首版，仅做实例去重，分词行为与既有 (granularity, locale) 组合保持一致。
let sharedGraphemeSegmenter: Intl.Segmenter | null = null
let localeGraphemeSegmenter: Intl.Segmenter | null = null
let localeWordSegmenter: Intl.Segmenter | null = null
let segmenterLocale: string | undefined

export function getGraphemeSegmenter(): Intl.Segmenter {
  if (sharedGraphemeSegmenter === null) {
    sharedGraphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  }
  return sharedGraphemeSegmenter
}

export function getLocaleGraphemeSegmenter(): Intl.Segmenter {
  if (localeGraphemeSegmenter === null) {
    localeGraphemeSegmenter = new Intl.Segmenter(segmenterLocale, { granularity: 'grapheme' })
  }
  return localeGraphemeSegmenter
}

export function getLocaleWordSegmenter(): Intl.Segmenter {
  if (localeWordSegmenter === null) {
    localeWordSegmenter = new Intl.Segmenter(segmenterLocale, { granularity: 'word' })
  }
  return localeWordSegmenter
}

export function setSegmenterLocale(locale?: string): void {
  const nextLocale = locale && locale.length > 0 ? locale : undefined
  if (segmenterLocale === nextLocale) return
  segmenterLocale = nextLocale
  localeGraphemeSegmenter = null
  localeWordSegmenter = null
}

export function clearGraphemeSegmenters(): void {
  sharedGraphemeSegmenter = null
  localeGraphemeSegmenter = null
  localeWordSegmenter = null
}
