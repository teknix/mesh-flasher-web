// Meshtastic firmware version strings look like "2.7.26.54e0d8d" (three numbers and a commit
// hash) and sometimes carry a leading "v". Only the numbers are compared; the hash is not
// ordered, so "2.7.26.aaaaaaa" and "2.7.26.bbbbbbb" are the same version here.

export function parseVersion(v: string | undefined | null): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec((v || '').trim())
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** -1, 0 or 1 like a comparator; null when either side is not a version. */
export function compareVersions(a: string | undefined | null, b: string | undefined | null): -1 | 0 | 1 | null {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return null
  for (let i = 0; i < 3; i++) {
    if (pa[i]! < pb[i]!) return -1
    if (pa[i]! > pb[i]!) return 1
  }
  return 0
}

/** True when `have` is the pinned version or newer. Unparseable → false (treated as needing an install). */
export function isRecent(have: string | undefined | null, pinned: string | undefined | null): boolean {
  const c = compareVersions(have, pinned)
  return c !== null && c >= 0
}

/** "2.7.26" for display; the hash is noise to a member. */
export function shortVersion(v: string | undefined | null): string {
  const p = parseVersion(v)
  return p ? p.join('.') : (v || '')
}
