// Headless firmware install (esptool-js) from OUR origin, with a SHA-256 check before writing.
import { ESPLoader, Transport, type FlashOptions, type LoaderOptions } from 'esptool-js'
import { matchesSha256 } from './sha256'
import { openPortWithRetry } from './serialTransport'


export interface FlashEntry { name: string, address: string }
export interface BoardFirmware {
  hwModel?: number
  displayName?: string
  mcu?: string
  requiresDfu?: boolean
  partitionScheme?: string
  /** Full install: erase everything, write each entry at its address. */
  clean: FlashEntry[]
  update?: FlashEntry[]
}

export interface FirmwareInfo {
  version: string
  boards: Record<string, BoardFirmware>
  files: Record<string, { sha256: string, size: number }>
  base: string
}

export class FirmwareError extends Error {
  constructor(message: string, public kind: 'download' | 'hash' | 'connect' | 'write' | 'reset') {
    super(message)
    this.name = 'FirmwareError'
  }
}

/** Download a firmware file from our own origin and verify its SHA-256 before returning it. */
export async function fetchVerified(fw: FirmwareInfo, name: string, onProgress?: (fraction: number) => void): Promise<Uint8Array> {
  const meta = fw.files[name]
  if (!meta) throw new FirmwareError('That file is not on the group\'s approved list.', 'hash')
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new FirmwareError('Bad file name.', 'hash')
  let resp: Response
  try {
    resp = await fetch(fw.base + name, { credentials: 'same-origin' })
  }
  catch {
    throw new FirmwareError('Could not download the software. Check your internet and try again.', 'download')
  }
  if (!resp.ok) throw new FirmwareError(`Could not download the software (error ${resp.status}).`, 'download')
  const chunks: Uint8Array[] = []
  let got = 0
  if (resp.body) {
    const reader = resp.body.getReader()
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      chunks.push(value)
      got += value.length
      onProgress?.(meta.size ? Math.min(1, got / meta.size) : 0)
    }
  }
  const data = new Uint8Array(got)
  let off = 0
  for (const c of chunks) { data.set(c, off); off += c.length }
  if (!(await matchesSha256(data, meta.sha256))) {
    throw new FirmwareError('The downloaded software does not match what the group approved, so it was NOT installed. Nothing was changed on your radio.', 'hash')
  }
  return data
}

function toBinaryString(bytes: Uint8Array): string {
  let s = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode(...bytes.subarray(i, i + step))
  return s
}

const quiet = { clean() {}, writeLine() {}, write() {} }
const FLASH_BAUD = 115200 // upstream web-flasher default; faster rates unverified on this hardware
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export interface FlashOptionsIn {
  port: SerialPort
  /** Verified images with their flash addresses (the board's `clean` list), written after a full erase. */
  images: Array<{ data: Uint8Array, address: number }>
  onProgress?: (percent: number) => void
}

export function parseAddress(a: string): number {
  const n = Number(a)
  if (!Number.isInteger(n) || n < 0) throw new FirmwareError('Bad install address in the group settings.', 'download')
  return n
}

/**
 * Erase and write every image at its address, hard-reset and close esptool's handle. Follow with
 * reacquirePort() before talking to the radio again.
 */
export async function flashImages({ port, images, onProgress }: FlashOptionsIn): Promise<void> {
  const transport = new Transport(port, false)
  let loader: ESPLoader
  try {
    loader = new ESPLoader({ transport, baudrate: FLASH_BAUD, romBaudrate: 115200, terminal: quiet } as LoaderOptions)
    await loader.main()
  }
  catch (e) {
    try { await transport.disconnect() } catch { /* ignore */ }
    throw new FirmwareError('Could not talk to the radio\'s installer. Put the radio in install mode again (hold PRG, tap RST, let go of PRG), then try again.', 'connect')
  }
  try {
    await loader.writeFlash({
      fileArray: images.map(i => ({ data: toBinaryString(i.data), address: i.address })),
      flashSize: 'keep',
      flashMode: 'keep',
      flashFreq: 'keep',
      eraseAll: true,
      compress: true,
      reportProgress: (i, written, total) => onProgress?.(total ? Math.round(((i + written / total) / images.length) * 100) : 0),
    } as FlashOptions)
  }
  catch {
    try { await transport.disconnect() } catch { /* ignore */ }
    throw new FirmwareError('Installing the software stopped partway. The radio is safe to retry: keep it plugged in and try again.', 'write')
  }
  try {
    try {
      await loader.after('hard_reset')
    }
    catch {
      // Fallback: pulse RTS ourselves (what upstream's flasher does).
      await transport.setRTS(true)
      await sleep(100)
      await transport.setRTS(false)
    }
  }
  catch {
    throw new FirmwareError('The software is installed but the radio did not restart by itself. Unplug it, plug it back in, then continue.', 'reset')
  }
  try { await transport.disconnect() } catch { /* port may have re-enumerated */ }
}

/**
 * After a reset, check the same SerialPort object opens again (retrying InvalidStateError up to
 * 5x, 500 ms apart). If the radio came back as a new port object (native USB re-enumeration),
 * fall back to the one previously granted port. Never calls forget(). Returns null if neither works.
 */
export async function reacquirePort(port: SerialPort): Promise<SerialPort | null> {
  await sleep(1500)
  try {
    await openPortWithRetry(port, 115200, 5, 500)
    try { await port.close() } catch { /* ignore */ }
    return port
  }
  catch { /* fall through */ }
  try {
    const granted = await navigator.serial.getPorts()
    if (granted.length === 1) {
      const p = granted[0]!
      await openPortWithRetry(p, 115200, 5, 500)
      try { await p.close() } catch { /* ignore */ }
      return p
    }
  }
  catch { /* fall through */ }
  return null
}
