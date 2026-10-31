import { describe, it, expect } from 'vitest'
import { detectGate } from './browserGate'

const UA = {
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  chromeos: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
}

describe('detectGate', () => {
  it('lets desktop Chrome with serial through', () => {
    expect(detectGate({ hasSerial: true, userAgent: UA.winChrome }).ok).toBe(true)
  })
  it('blocks phones even if serial exists (Android Chrome)', () => {
    const g = detectGate({ hasSerial: true, userAgent: UA.android })
    expect(g.ok).toBe(false)
    expect(g.reason).toBe('phone')
  })
  it('blocks iPhone and iPad-as-Mac', () => {
    expect(detectGate({ hasSerial: false, userAgent: UA.iphone }).reason).toBe('phone')
    expect(detectGate({ hasSerial: false, userAgent: UA.macSafari, maxTouchPoints: 5 }).reason).toBe('phone')
  })
  it('gives Safari-on-Mac, Firefox and Chromebook their own advice', () => {
    expect(detectGate({ hasSerial: false, userAgent: UA.macSafari }).advice).toMatch(/Safari/)
    expect(detectGate({ hasSerial: false, userAgent: UA.firefox }).advice).toMatch(/Firefox/)
    expect(detectGate({ hasSerial: false, userAgent: UA.chromeos }).advice).toMatch(/Chromebook/)
  })
})
