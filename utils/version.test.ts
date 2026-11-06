import { describe, it, expect } from 'vitest'
import { parseVersion, compareVersions, isRecent, shortVersion } from './version'

describe('firmware versions', () => {
  it('parses the three numbers and ignores the hash and a leading v', () => {
    expect(parseVersion('2.7.26.54e0d8d')).toEqual([2, 7, 26])
    expect(parseVersion('v2.6.11.abc')).toEqual([2, 6, 11])
    expect(parseVersion('')).toBeNull()
    expect(parseVersion('garbage')).toBeNull()
  })
  it('compares numerically, not as strings', () => {
    expect(compareVersions('2.7.26.a', '2.7.26.b')).toBe(0)
    expect(compareVersions('2.7.9.a', '2.7.26.b')).toBe(-1)
    expect(compareVersions('2.10.0', '2.9.9')).toBe(1)
    expect(compareVersions('3.0.0', '2.7.26')).toBe(1)
    expect(compareVersions(undefined, '2.7.26')).toBeNull()
  })
  it('recent = same or newer than the pinned version', () => {
    const PIN = '2.7.26.54e0d8d'
    expect(isRecent('2.7.26.54e0d8d', PIN)).toBe(true)
    expect(isRecent('2.7.26.ffffff0', PIN)).toBe(true) // same numbers, other build
    expect(isRecent('2.7.27.1234567', PIN)).toBe(true)
    expect(isRecent('2.8.0.1234567', PIN)).toBe(true)
    expect(isRecent('2.7.25.1234567', PIN)).toBe(false)
    expect(isRecent('2.6.11.1234567', PIN)).toBe(false)
    expect(isRecent('', PIN)).toBe(false)
    expect(isRecent(undefined, PIN)).toBe(false)
  })
  it('shows a member-friendly short version', () => {
    expect(shortVersion('2.7.26.54e0d8d')).toBe('2.7.26')
    expect(shortVersion('')).toBe('')
  })
})
