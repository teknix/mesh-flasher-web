import { describe, expect, it, vi } from 'vitest'
import { settleWithin, TimeoutError, withStallLimit, withTimeout } from './timeout'

const never = () => new Promise<never>(() => {})

describe('withTimeout', () => {
  it('passes a result through', async () => {
    await expect(withTimeout(Promise.resolve(3), 50)).resolves.toBe(3)
  })
  it('rejects with TimeoutError when the call never settles', async () => {
    vi.useFakeTimers()
    const p = withTimeout(never(), 1000, 'radio did not answer')
    vi.advanceTimersByTime(1001)
    await expect(p).rejects.toBeInstanceOf(TimeoutError)
    vi.useRealTimers()
  })
})

describe('settleWithin', () => {
  it('returns after the limit even if the call hangs', async () => {
    vi.useFakeTimers()
    const p = settleWithin(never(), 500)
    vi.advanceTimersByTime(501)
    await expect(p).resolves.toBeUndefined()
    vi.useRealTimers()
  })
  it('swallows errors', async () => {
    await expect(settleWithin(Promise.reject(new Error('x')), 50)).resolves.toBeUndefined()
  })
})

describe('withStallLimit', () => {
  it('keeps going while there is activity', async () => {
    vi.useFakeTimers()
    let touchIt!: () => void
    let finish!: (v: string) => void
    const p = withStallLimit(touch => { touchIt = touch; return new Promise<string>(r => (finish = r)) }, 1000)
    for (let i = 0; i < 5; i++) { vi.advanceTimersByTime(900); touchIt() }
    finish('ok')
    await expect(p).resolves.toBe('ok')
    vi.useRealTimers()
  })
  it('rejects after the limit with no activity', async () => {
    vi.useFakeTimers()
    const p = withStallLimit(() => never(), 1000, 'stalled')
    vi.advanceTimersByTime(1001)
    await expect(p).rejects.toThrow('stalled')
    vi.useRealTimers()
  })
})
