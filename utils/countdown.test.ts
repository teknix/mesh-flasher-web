import { describe, it, expect } from 'vitest'
import { startCountdown, secondsLeft, elapsedPercent, formatSeconds, remainingFromProgress } from './countdown'

describe('countdown', () => {
  const c = startCountdown(90, 1000_000)
  it('counts down whole seconds and stops at zero', () => {
    expect(secondsLeft(c, 1000_000)).toBe(90)
    expect(secondsLeft(c, 1000_000 + 500)).toBe(90)
    expect(secondsLeft(c, 1000_000 + 1000)).toBe(89)
    expect(secondsLeft(c, 1000_000 + 89_400)).toBe(1)
    expect(secondsLeft(c, 1000_000 + 95_000)).toBe(0)
  })
  it('reports elapsed percent 0..100', () => {
    expect(elapsedPercent(c, 1000_000)).toBe(0)
    expect(elapsedPercent(c, 1000_000 + 45_000)).toBe(50)
    expect(elapsedPercent(c, 1000_000 + 200_000)).toBe(100)
    expect(elapsedPercent(startCountdown(0, 0), 0)).toBe(100)
  })
  it('formats for a phone screen', () => {
    expect(formatSeconds(45)).toBe('45 s')
    expect(formatSeconds(60)).toBe('1:00')
    expect(formatSeconds(125)).toBe('2:05')
    expect(formatSeconds(-3)).toBe('0 s')
  })
  it('estimates remaining time from progress, and says nothing too early', () => {
    expect(remainingFromProgress(0, 0.01, 10_000)).toBeNull()
    expect(remainingFromProgress(0, 0.25, 10_000)).toBe(30) // 10 s for a quarter → 30 s left
    expect(remainingFromProgress(0, 1, 10_000)).toBe(0)
  })
})
