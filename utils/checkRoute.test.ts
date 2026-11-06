import { describe, it, expect } from 'vitest'
import { routeAfterRead, answered } from './checkRoute'
import { emptySnapshot } from './groupSetup'
import type { BoardEntry } from './board'

const boards: Record<string, BoardEntry> = { 'heltec-v4': { hwModel: 110, displayName: 'Heltec V4', requiresDfu: true } }
const PIN = '2.7.26.54e0d8d'

describe('routeAfterRead', () => {
  it('silent: nothing identified the radio → no install, member decides', () => {
    expect(routeAfterRead(emptySnapshot(), boards, PIN)).toEqual({ kind: 'silent' })
    expect(routeAfterRead(undefined, boards, PIN)).toEqual({ kind: 'silent' })
    expect(answered(emptySnapshot())).toBe(false)
  })
  it('answered on the pinned version → name, even when the handshake never finished', () => {
    const s = emptySnapshot()
    s.myNodeNum = 1
    s.hwModel = 110
    s.firmwareVersion = PIN
    s.configured = false // partial snapshot from a timed-out read
    expect(routeAfterRead(s, boards, PIN)).toEqual({ kind: 'name', boardId: 'heltec-v4', have: PIN })
  })
  it('answered on another version → install', () => {
    const s = emptySnapshot()
    s.hwModel = 110
    s.firmwareVersion = 'v2.6.11.abc'
    expect(routeAfterRead(s, boards, PIN)).toMatchObject({ kind: 'install', boardId: 'heltec-v4', have: '2.6.11.abc' })
  })
  it('metadata without a version string still counts as answered → install', () => {
    const s = emptySnapshot()
    s.myNodeNum = 5
    s.hwModel = 110
    expect(routeAfterRead(s, boards, PIN)).toMatchObject({ kind: 'install', have: '' })
  })
  it('unsupported hardware → refused', () => {
    const s = emptySnapshot()
    s.hwModel = 43
    s.firmwareVersion = PIN
    expect(routeAfterRead(s, boards, PIN)).toMatchObject({ kind: 'refused' })
  })
})
