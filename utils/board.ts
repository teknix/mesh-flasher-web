// Board identification: map what the radio reports (pioEnv / hwModel) to our board ids.

// hwModel numbers (meshtastic.HardwareModel) for boards we know. 110 is newer than the
// installed protobuf enum, so it is listed by number here.
export const HW_MODEL_BOARD: Record<number, string> = {
  4: 'tbeam',
  43: 'heltec-v3',
  50: 't-deck',
  59: 'heltec-wireless-tracker',
  110: 'heltec-v4',
}

export interface BoardInfo {
  pioEnv?: string
  hwModel?: number
}

export interface BoardResolution {
  /** Our board id when the radio is recognised, else undefined. */
  boardId?: string
  /** True when the board is recognised AND in the group's supported list. */
  supported: boolean
  /** Human-readable name for messages ("heltec-v4", "model 99"). */
  label: string
}

export function normalizePioEnv(s: string | undefined): string {
  return (s || '').trim().toLowerCase()
}

export interface BoardEntry { hwModel?: number, displayName?: string, requiresDfu?: boolean }

/** `boards` = `firmware.boards` from /api/config. Match by hwModel number first, then pioEnv == board id. */
export function resolveBoard(info: BoardInfo, boards: Record<string, BoardEntry>): BoardResolution {
  const env = normalizePioEnv(info.pioEnv)
  if (info.hwModel !== undefined) {
    const hit = Object.entries(boards).find(([, b]) => b.hwModel === info.hwModel)
    if (hit) return { boardId: hit[0], supported: true, label: hit[1].displayName || hit[0] }
  }
  if (env && boards[env]) return { boardId: env, supported: true, label: boards[env]!.displayName || env }
  if (env) return { boardId: undefined, supported: false, label: env }
  if (info.hwModel !== undefined) {
    const known = HW_MODEL_BOARD[info.hwModel]
    return { boardId: undefined, supported: false, label: known || `model number ${info.hwModel}` }
  }
  return { boardId: undefined, supported: false, label: 'unknown model' }
}

// --- names -------------------------------------------------------------------------

const utf8Len = (s: string) => new TextEncoder().encode(s).length

/** Suggest a 4-character short name: initials when there are 2+ words, else the first 4 letters. */
export function suggestShortName(displayName: string): string {
  const words = (displayName || '').normalize('NFKC').replace(/['’]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (words.length === 0) return ''
  const pick = words.length >= 2
    ? words.slice(0, 4).map(w => [...w][0]).join('')
    : [...words[0]!].slice(0, 4).join('')
  return pick.toUpperCase()
}

export interface NameCheck { ok: boolean, problem?: string }

export function checkNames(longName: string, shortName: string): NameCheck {
  const l = longName.trim()
  if (l.length < 1) return { ok: false, problem: 'Type a name.' }
  if (utf8Len(l) > 39) return { ok: false, problem: 'That name is too long (39 characters at most).' }
  const s = shortName.trim()
  if (s.length < 1) return { ok: false, problem: 'Type a short name (1 to 4 characters).' }
  if (utf8Len(s) > 4) return { ok: false, problem: 'The short name can be at most 4 characters.' }
  return { ok: true }
}
