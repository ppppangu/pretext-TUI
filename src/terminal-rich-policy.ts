// 补建说明：该文件为后续补建，用于集中定义 terminal rich sidecar 的 host-neutral 安全策略、诊断脱敏、OSC8 URI 校验与 DoS limit；当前进度：Task 2 首版，为默认、transcript 与 audit-strict profile 提供统一解析边界。
import {
  hasTerminalBidiFormatControls,
  hasUnsafeTerminalControlChar,
  isTerminalBidiFormatControlCodePoint,
} from './terminal-control-policy.js'

export type TerminalRichSecurityProfileName = 'default' | 'transcript' | 'audit-strict'
export type TerminalRichRawRetentionPolicy = 'none' | 'fingerprint' | 'capped-sample'
export type TerminalRichUnsupportedControlMode = 'sanitize' | 'reject'
export type TerminalRichBidiFormatPolicy = 'sanitize' | 'reject'
export type TerminalRichAnsiReemitPolicy = 'none' | 'sgr' | 'sgr-osc8'

export type TerminalRichControlFamily =
  | 'sgr'
  | 'csi'
  | 'osc'
  | 'osc8'
  | 'dcs'
  | 'pm'
  | 'apc'
  | 'sos'
  | 'c0'
  | 'c1'
  | 'esc'
  | 'bidi-format'
  | 'input'
  | 'span'
  | 'raw-map'

export type TerminalRichDiagnostic = Readonly<{
  kind: 'unsupported-control' | 'malformed-sequence' | 'policy-violation' | 'limit-exceeded'
  code: string
  controlFamily?: TerminalRichControlFamily
  rawStart: number
  rawEnd: number
  rawLength: number
  escapedSample?: string
  sampleTruncated: boolean
  fingerprint: string
  redacted: true
  profile: TerminalRichSecurityProfileName
}>

export type TerminalRichOsc8UriPolicy = Readonly<{
  allowedSchemes: readonly string[]
  allowCredentials: boolean
  maxUriCodeUnits: number
}>

export type TerminalRichDiagnosticPolicy = Readonly<{
  maxDiagnostics: number
  sampleCodeUnits: number
}>

export type TerminalRichLimits = Readonly<{
  maxInputCodeUnits: number
  maxControlSequenceCodeUnits: number
  maxSpans: number
  maxRawVisibleMapEntries: number
  maxAnsiOutputCodeUnits: number
}>

export type TerminalRichSecurityPolicyInput = Readonly<{
  profile?: TerminalRichSecurityProfileName
  unsupportedControlMode?: TerminalRichUnsupportedControlMode
  rawRetention?: TerminalRichRawRetentionPolicy
  bidiFormatControls?: TerminalRichBidiFormatPolicy
  osc8?: Partial<TerminalRichOsc8UriPolicy>
  diagnostics?: Partial<TerminalRichDiagnosticPolicy>
  limits?: Partial<TerminalRichLimits>
  ansiReemit?: TerminalRichAnsiReemitPolicy
}>

export type TerminalRichResolvedPolicy = Readonly<{
  profile: TerminalRichSecurityProfileName
  unsupportedControlMode: TerminalRichUnsupportedControlMode
  rawRetention: TerminalRichRawRetentionPolicy
  bidiFormatControls: TerminalRichBidiFormatPolicy
  osc8: TerminalRichOsc8UriPolicy
  diagnostics: TerminalRichDiagnosticPolicy
  limits: TerminalRichLimits
  ansiReemit: TerminalRichAnsiReemitPolicy
}>

export type TerminalRichPolicySummary = Readonly<{
  profile: TerminalRichSecurityProfileName
  unsupportedControlMode: TerminalRichUnsupportedControlMode
  rawRetention: TerminalRichRawRetentionPolicy
  bidiFormatControls: TerminalRichBidiFormatPolicy
  osc8AllowedSchemes: readonly string[]
  ansiReemit: TerminalRichAnsiReemitPolicy
  maxAnsiOutputCodeUnits: number
}>

export type TerminalRichRawSummary = Readonly<{
  rawLength: number
  fingerprint: string
  escapedSample?: string
  sampleTruncated: boolean
}>

export type TerminalRichCompleteness = Readonly<{
  diagnosticsTruncated: boolean
  spansTruncated: boolean
  rawVisibleMapTruncated: boolean
}>

const DEFAULT_LIMITS: TerminalRichLimits = Object.freeze({
  maxInputCodeUnits: 2_000_000,
  maxControlSequenceCodeUnits: 8_192,
  maxSpans: 20_000,
  maxRawVisibleMapEntries: 200_000,
  maxAnsiOutputCodeUnits: 1_000_000,
})

const DEFAULT_DIAGNOSTICS: TerminalRichDiagnosticPolicy = Object.freeze({
  maxDiagnostics: 256,
  sampleCodeUnits: 0,
})

export function resolveTerminalRichPolicy(
  input: TerminalRichSecurityPolicyInput = {},
): TerminalRichResolvedPolicy {
  const record = normalizePolicyInput(input)
  const profile = normalizeEnum(
    ownValue(record, 'profile') ?? 'default',
    ['default', 'transcript', 'audit-strict'] as const,
    'Terminal rich security profile',
  )
  const base = profileDefaults(profile)
  const osc8 = optionalPolicyObject(record, 'osc8', 'Terminal rich osc8')
  const diagnostics = optionalPolicyObject(record, 'diagnostics', 'Terminal rich diagnostics')
  const limits = optionalPolicyObject(record, 'limits', 'Terminal rich limits')
  return Object.freeze({
    profile,
    unsupportedControlMode: normalizeEnum(
      ownValue(record, 'unsupportedControlMode') ?? base.unsupportedControlMode,
      ['sanitize', 'reject'] as const,
      'Terminal rich unsupportedControlMode',
    ),
    rawRetention: normalizeEnum(
      ownValue(record, 'rawRetention') ?? base.rawRetention,
      ['none', 'fingerprint', 'capped-sample'] as const,
      'Terminal rich rawRetention',
    ),
    bidiFormatControls: normalizeEnum(
      ownValue(record, 'bidiFormatControls') ?? base.bidiFormatControls,
      ['sanitize', 'reject'] as const,
      'Terminal rich bidiFormatControls',
    ),
    ansiReemit: normalizeEnum(
      ownValue(record, 'ansiReemit') ?? base.ansiReemit,
      ['none', 'sgr', 'sgr-osc8'] as const,
      'Terminal rich ansiReemit',
    ),
    osc8: Object.freeze({
      allowedSchemes: Object.freeze(normalizeSchemes(ownValue(osc8, 'allowedSchemes') ?? base.osc8.allowedSchemes)),
      allowCredentials: normalizeBoolean(
        ownValue(osc8, 'allowCredentials') ?? base.osc8.allowCredentials,
        'Terminal rich OSC8 allowCredentials',
      ),
      maxUriCodeUnits: normalizePositiveInteger(
        ownValue(osc8, 'maxUriCodeUnits') ?? base.osc8.maxUriCodeUnits,
        'Terminal rich OSC8 maxUriCodeUnits',
      ),
    }),
    diagnostics: Object.freeze({
      maxDiagnostics: normalizeNonNegativeInteger(
        ownValue(diagnostics, 'maxDiagnostics') ?? base.diagnostics.maxDiagnostics,
        'Terminal rich diagnostics maxDiagnostics',
      ),
      sampleCodeUnits: normalizeNonNegativeInteger(
        ownValue(diagnostics, 'sampleCodeUnits') ?? base.diagnostics.sampleCodeUnits,
        'Terminal rich diagnostics sampleCodeUnits',
      ),
    }),
    limits: Object.freeze({
      maxInputCodeUnits: normalizePositiveInteger(
        ownValue(limits, 'maxInputCodeUnits') ?? base.limits.maxInputCodeUnits,
        'Terminal rich maxInputCodeUnits',
      ),
      maxControlSequenceCodeUnits: normalizePositiveInteger(
        ownValue(limits, 'maxControlSequenceCodeUnits') ?? base.limits.maxControlSequenceCodeUnits,
        'Terminal rich maxControlSequenceCodeUnits',
      ),
      maxSpans: normalizeNonNegativeInteger(
        ownValue(limits, 'maxSpans') ?? base.limits.maxSpans,
        'Terminal rich maxSpans',
      ),
      maxRawVisibleMapEntries: normalizeNonNegativeInteger(
        ownValue(limits, 'maxRawVisibleMapEntries') ?? base.limits.maxRawVisibleMapEntries,
        'Terminal rich maxRawVisibleMapEntries',
      ),
      maxAnsiOutputCodeUnits: normalizePositiveInteger(
        ownValue(limits, 'maxAnsiOutputCodeUnits') ?? base.limits.maxAnsiOutputCodeUnits,
        'Terminal rich maxAnsiOutputCodeUnits',
      ),
    }),
  })
}

export function summarizeTerminalRichPolicy(
  policy: TerminalRichResolvedPolicy,
): TerminalRichPolicySummary {
  return Object.freeze({
    profile: policy.profile,
    unsupportedControlMode: policy.unsupportedControlMode,
    rawRetention: policy.rawRetention,
    bidiFormatControls: policy.bidiFormatControls,
    osc8AllowedSchemes: Object.freeze([...policy.osc8.allowedSchemes]),
    ansiReemit: policy.ansiReemit,
    maxAnsiOutputCodeUnits: policy.limits.maxAnsiOutputCodeUnits,
  })
}

export function createTerminalRichRawSummary(
  rawText: string,
  policy: TerminalRichResolvedPolicy,
): TerminalRichRawSummary | undefined {
  if (policy.rawRetention === 'none') return undefined
  const escapedSample = policy.rawRetention === 'capped-sample'
    ? escapeTerminalSample(rawText, policy.diagnostics.sampleCodeUnits)
    : undefined
  const summary: {
    rawLength: number
    fingerprint: string
    escapedSample?: string
    sampleTruncated: boolean
  } = {
    rawLength: rawText.length,
    fingerprint: fingerprintText(rawText),
    sampleTruncated: rawText.length > policy.diagnostics.sampleCodeUnits,
  }
  if (escapedSample !== undefined) summary.escapedSample = escapedSample
  return Object.freeze(summary)
}

export function createTerminalRichDiagnostic(input: {
  kind: TerminalRichDiagnostic['kind']
  code: string
  controlFamily?: TerminalRichControlFamily
  rawStart: number
  rawEnd: number
  sequence: string
  policy: TerminalRichResolvedPolicy
}): TerminalRichDiagnostic {
  const diagnostic: {
    kind: TerminalRichDiagnostic['kind']
    code: string
    controlFamily?: TerminalRichControlFamily
    rawStart: number
    rawEnd: number
    rawLength: number
    escapedSample?: string
    sampleTruncated: boolean
    fingerprint: string
    redacted: true
    profile: TerminalRichSecurityProfileName
  } = {
    kind: input.kind,
    code: input.code,
    rawStart: input.rawStart,
    rawEnd: input.rawEnd,
    rawLength: Math.max(0, input.rawEnd - input.rawStart),
    sampleTruncated: input.sequence.length > input.policy.diagnostics.sampleCodeUnits,
    fingerprint: fingerprintText(input.sequence),
    redacted: true,
    profile: input.policy.profile,
  }
  if (input.controlFamily !== undefined) diagnostic.controlFamily = input.controlFamily
  if (input.policy.diagnostics.sampleCodeUnits > 0) {
    diagnostic.escapedSample = escapeTerminalSample(input.sequence, input.policy.diagnostics.sampleCodeUnits)
  }
  return Object.freeze(diagnostic)
}

export function validateTerminalRichOsc8Uri(
  uri: string,
  policy: TerminalRichResolvedPolicy,
): { ok: true; uri: string } | { ok: false; code: string } {
  if (uri === '') return { ok: true, uri }
  if (uri.length > policy.osc8.maxUriCodeUnits) return { ok: false, code: 'osc8-uri-too-long' }
  if (hasUnsafeTerminalControlChar(uri)) return { ok: false, code: 'osc8-uri-control' }
  if (hasTerminalBidiFormatControls(uri)) return { ok: false, code: 'osc8-uri-bidi-format-control' }

  const schemeMatch = /^([A-Za-z][A-Za-z0-9+.-]*):/u.exec(uri)
  if (schemeMatch === null) return { ok: false, code: 'osc8-uri-not-absolute' }

  const scheme = schemeMatch[1]!.toLowerCase()
  if (!policy.osc8.allowedSchemes.includes(scheme)) {
    return { ok: false, code: 'osc8-uri-scheme-denied' }
  }
  const afterScheme = uri.slice(schemeMatch[0].length)
  const authority = afterScheme.startsWith('//')
    ? afterScheme.slice(2).split(/[/?#]/u, 1)[0] ?? ''
    : ''
  if (!policy.osc8.allowCredentials && authority.includes('@')) {
    return { ok: false, code: 'osc8-uri-credentials-denied' }
  }
  return { ok: true, uri }
}

export function isBidiFormatControlCodePoint(code: number): boolean {
  return isTerminalBidiFormatControlCodePoint(code)
}

export function isBidiFormatControlText(text: string): boolean {
  return hasTerminalBidiFormatControls(text)
}

export function escapeTerminalSample(text: string, maxCodeUnits: number): string {
  let escaped = ''
  const slice = text.slice(0, maxCodeUnits)
  for (let i = 0; i < slice.length; i++) {
    const code = slice.charCodeAt(i)
    if (code === 0x1b) escaped += '\\x1B'
    else if (code === 0x7f) escaped += '\\x7F'
    else if (code <= 0x1f || (code >= 0x80 && code <= 0x9f)) {
      escaped += `\\x${code.toString(16).toUpperCase().padStart(2, '0')}`
    } else if (isTerminalBidiFormatControlCodePoint(code)) {
      escaped += `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`
    } else {
      escaped += slice[i]
    }
  }
  return escaped
}

export function fingerprintText(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function profileDefaults(profile: TerminalRichSecurityProfileName): TerminalRichResolvedPolicy {
  if (profile === 'audit-strict') {
    return Object.freeze({
      profile,
      unsupportedControlMode: 'reject',
      rawRetention: 'none',
      bidiFormatControls: 'reject',
      ansiReemit: 'none',
      osc8: Object.freeze({
        allowedSchemes: Object.freeze(['https']),
        allowCredentials: false,
        maxUriCodeUnits: 1024,
      }),
      diagnostics: DEFAULT_DIAGNOSTICS,
      limits: DEFAULT_LIMITS,
    })
  }
  if (profile === 'transcript') {
    return Object.freeze({
      profile,
      unsupportedControlMode: 'sanitize',
      rawRetention: 'fingerprint',
      bidiFormatControls: 'sanitize',
      ansiReemit: 'sgr-osc8',
      osc8: Object.freeze({
        allowedSchemes: Object.freeze(['https', 'http', 'mailto']),
        allowCredentials: false,
        maxUriCodeUnits: 4096,
      }),
      diagnostics: DEFAULT_DIAGNOSTICS,
      limits: Object.freeze({
        ...DEFAULT_LIMITS,
        maxInputCodeUnits: 8_000_000,
        maxControlSequenceCodeUnits: 16_384,
      }),
    })
  }
  return Object.freeze({
    profile,
    unsupportedControlMode: 'sanitize',
    rawRetention: 'none',
    bidiFormatControls: 'sanitize',
    ansiReemit: 'sgr-osc8',
    osc8: Object.freeze({
      allowedSchemes: Object.freeze(['https', 'http', 'mailto']),
      allowCredentials: false,
      maxUriCodeUnits: 2048,
    }),
    diagnostics: DEFAULT_DIAGNOSTICS,
    limits: DEFAULT_LIMITS,
  })
}

function normalizePolicyInput(input: TerminalRichSecurityPolicyInput): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Terminal rich security policy input must be an object')
  }
  return input as Record<string, unknown>
}

function optionalPolicyObject(
  input: Record<string, unknown>,
  key: string,
  label: string,
): Record<string, unknown> {
  const value = ownValue(input, key)
  if (value === undefined) return {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function ownValue(record: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined
}

function normalizeSchemes(schemes: unknown): readonly string[] {
  if (!Array.isArray(schemes)) {
    throw new Error('Terminal rich OSC8 allowedSchemes must be an array')
  }
  const normalized = schemes.map(scheme => {
    if (typeof scheme !== 'string') {
      throw new Error('Terminal rich OSC8 allowedSchemes must contain strings')
    }
    return scheme.replace(/:$/u, '').toLowerCase()
  })
  if (normalized.some(scheme => !/^[a-z][a-z0-9+.-]*$/u.test(scheme))) {
    throw new Error('Terminal rich OSC8 allowedSchemes must contain valid URI schemes')
  }
  return [...new Set(normalized)]
}

function normalizeBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean`)
  }
  return value
}

function normalizePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer, got ${formatUnknown(value)}`)
  }
  return value
}

function normalizeEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${label} must be one of ${allowed.join(', ')}`)
  }
  return value as T[number]
}

function normalizeNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer, got ${formatUnknown(value)}`)
  }
  return value
}

function formatUnknown(value: unknown): string {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value)
  }
  return typeof value
}
