// Countdown arithmetic for the wait screens. A countdown is a promise to the member: show one
// only for a wait whose length we know, and when it runs out say the one thing to do next.
// Pure functions here; the ticking lives in the WaitPanel component.

export interface Countdown {
  /** Total length in seconds. */
  seconds: number
  /** Date.now() when the wait started. */
  startedAt: number
}

export function startCountdown(seconds: number, now = Date.now()): Countdown {
  return { seconds, startedAt: now }
}

/** Whole seconds left, never below 0. */
export function secondsLeft(c: Countdown, now = Date.now()): number {
  return Math.max(0, Math.ceil(c.seconds - (now - c.startedAt) / 1000))
}

/** 0..100, how much of the wait has passed. */
export function elapsedPercent(c: Countdown, now = Date.now()): number {
  if (c.seconds <= 0) return 100
  return Math.min(100, Math.max(0, Math.round(((now - c.startedAt) / 1000 / c.seconds) * 100)))
}

/** "45 s", "1:30", "2:05" — short enough for a phone screen. */
export function formatSeconds(s: number): string {
  s = Math.max(0, Math.round(s))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

/**
 * Remaining time for a job that reports progress (0..1): elapsed / progress × (1 − progress).
 * Returns null until there is enough progress to say anything honest (2 %).
 */
export function remainingFromProgress(startedAt: number, progress: number, now = Date.now()): number | null {
  if (progress < 0.02) return null
  const elapsed = (now - startedAt) / 1000
  return Math.max(0, (elapsed / progress) * (1 - progress))
}
