// Where the member goes after the radio check. Pure, so the routing is testable without a browser.
//
// Rules (owner, 2026-11-05):
// - Never send a radio to "install the software" without evidence. A radio that sent its metadata
//   has answered — route on its version even if the full handshake did not finish in time (a radio
//   with a big node list streams for a while before it says "configured"). Only a radio that sent
//   nothing at all is "silent", and that screen lets the member decide (brand new radio → install;
//   otherwise cable / port advice) instead of assuming it is blank.
// - "Recent" = the pinned version or newer. A recent radio is not re-flashed; the member is asked
//   whether to apply the group's settings to it ("ready"). Older → install.
import { resolveBoard, type BoardEntry } from '~/utils/board'
import { isRecent, compareVersions } from '~/utils/version'
import type { Snapshot } from '~/utils/groupSetup'

export type CheckRoute
  = { kind: 'silent' }
    | { kind: 'refused', label: string }
    | { kind: 'install', boardId: string, have: string }
    /** Software is recent: ask before applying the group config. `newer` = newer than the pinned version. */
    | { kind: 'ready', boardId: string, have: string, newer: boolean }

/** True when the radio sent anything that identifies it (metadata or node info). */
export function answered(snap: Snapshot | undefined | null): boolean {
  return !!snap && (snap.firmwareVersion !== undefined || snap.hwModel !== undefined || snap.myNodeNum !== undefined)
}

const strip = (v: string | undefined) => (v || '').replace(/^v/, '')

export function routeAfterRead(snap: Snapshot | undefined | null, boards: Record<string, BoardEntry>, pinnedVersion: string): CheckRoute {
  if (!answered(snap)) return { kind: 'silent' }
  const s = snap!
  const res = resolveBoard({ pioEnv: s.pioEnv, hwModel: s.hwModel }, boards)
  if (!res.supported || !res.boardId) return { kind: 'refused', label: res.label }
  const have = strip(s.firmwareVersion)
  if (!isRecent(have, pinnedVersion)) return { kind: 'install', boardId: res.boardId, have }
  return { kind: 'ready', boardId: res.boardId, have, newer: compareVersions(have, pinnedVersion) === 1 }
}
