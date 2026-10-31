import { describe, it, expect } from 'vitest'
import { frame } from './serialTransport'

describe('frame', () => {
  it('adds the 0x94 0xC3 length header', () => {
    const f = frame(new Uint8Array([1, 2, 3]))
    expect([...f]).toEqual([0x94, 0xC3, 0, 3, 1, 2, 3])
  })
  it('encodes lengths over 255', () => {
    const f = frame(new Uint8Array(300))
    expect([f[2], f[3]]).toEqual([1, 44])
    expect(f.length).toBe(304)
  })
})
