// Time limits for serial work. Web Serial and esptool-js calls can wait forever when the radio
// stops answering, which leaves the member looking at a frozen screen with no message.

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}

/** Resolve or reject with `p`, or reject with TimeoutError after `ms`. `p` keeps running. */
export function withTimeout<T>(p: Promise<T>, ms: number, message = 'Timed out'): Promise<T> {
  let t: ReturnType<typeof setTimeout>
  const limit = new Promise<never>((_, reject) => { t = setTimeout(() => reject(new TimeoutError(message)), ms) })
  return Promise.race([p, limit]).finally(() => clearTimeout(t))
}

/** Wait for `p` at most `ms`, swallowing its errors. For clean-up steps that must not block. */
export async function settleWithin(p: Promise<unknown>, ms: number): Promise<void> {
  try { await withTimeout(p, ms) }
  catch { /* timed out or failed: clean-up is best effort */ }
}

/**
 * Like withTimeout, but the limit restarts every time `touch()` is called: rejects only after
 * `ms` with no activity. Use for long jobs that report progress (a flash write).
 */
export function withStallLimit<T>(run: (touch: () => void) => Promise<T>, ms: number, message = 'Stalled'): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined
  let fail!: (e: Error) => void
  const limit = new Promise<never>((_, reject) => { fail = reject })
  const touch = () => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fail(new TimeoutError(message)), ms)
  }
  touch()
  return Promise.race([run(touch), limit]).finally(() => { if (t) clearTimeout(t) })
}
