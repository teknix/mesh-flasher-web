import { describe, it, expect } from 'vitest'
import { sha256Hex, matchesSha256 } from './sha256'

describe('sha256', () => {
  it('hashes known vectors', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await sha256Hex(new Uint8Array(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
  it('matches case-insensitively and rejects bad input', async () => {
    const d = new TextEncoder().encode('abc')
    expect(await matchesSha256(d, 'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD')).toBe(true)
    expect(await matchesSha256(d, 'ba78')).toBe(false)
    expect(await matchesSha256(new TextEncoder().encode('abd'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')).toBe(false)
  })
})
