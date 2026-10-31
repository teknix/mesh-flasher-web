// Decide whether this browser can do the radio steps (Web Serial = desktop Chrome/Edge).

export interface GateInput {
  hasSerial: boolean
  userAgent: string
  maxTouchPoints?: number
}

export type Browser = 'chrome' | 'edge' | 'safari' | 'firefox' | 'other'
export type Os = 'ios' | 'android' | 'mac' | 'chromeos' | 'windows' | 'linux' | 'other'

export interface GateResult {
  ok: boolean
  reason: 'ok' | 'phone' | 'no-serial'
  browser: Browser
  os: Os
  /** One plain sentence telling this visitor what to do. */
  advice: string
}

export const CHROME_URL = 'https://www.google.com/chrome/'

export const CASE_ADVICE = {
  safari: 'Safari can\'t do this step. Open this link in Chrome or Edge instead.',
  firefox: 'Firefox can\'t do this step. Open this link in Chrome or Edge instead.',
  mac: 'On a Mac, install Chrome (link below), then open this page in it.',
  chromebook: 'On a Chromebook, open this page in the Chrome browser that came with it.',
} as const

export function detectGate(input: GateInput): GateResult {
  const ua = input.userAgent || ''
  const touch = input.maxTouchPoints ?? 0
  let os: Os = 'other'
  if (/iPhone|iPad|iPod/.test(ua)) os = 'ios'
  else if (/Android/.test(ua)) os = 'android'
  else if (/CrOS/.test(ua)) os = 'chromeos'
  else if (/Macintosh|Mac OS X/.test(ua)) os = touch > 1 ? 'ios' : 'mac' // iPadOS says "Macintosh"
  else if (/Windows/.test(ua)) os = 'windows'
  else if (/Linux|X11/.test(ua)) os = 'linux'

  let browser: Browser = 'other'
  if (/Edg\//.test(ua)) browser = 'edge'
  else if (/Firefox\/|FxiOS/.test(ua)) browser = 'firefox'
  else if (/Chrome\/|CriOS/.test(ua)) browser = 'chrome'
  else if (/Safari\//.test(ua)) browser = 'safari'

  const phoneOrTablet = os === 'ios' || os === 'android'
  if (phoneOrTablet) {
    return { ok: false, reason: 'phone', browser, os, advice: 'Open this link on a laptop or desktop computer, in Chrome or Edge.' }
  }
  if (!input.hasSerial) {
    let advice = 'Open this link in Chrome or Edge on a laptop or desktop computer.'
    if (browser === 'safari') advice = CASE_ADVICE.safari
    else if (browser === 'firefox') advice = CASE_ADVICE.firefox
    else if (os === 'mac') advice = CASE_ADVICE.mac
    else if (os === 'chromeos') advice = CASE_ADVICE.chromebook
    return { ok: false, reason: 'no-serial', browser, os, advice }
  }
  return { ok: true, reason: 'ok', browser, os, advice: '' }
}
