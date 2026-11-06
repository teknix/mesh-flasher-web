// Browser-side glue: one MeshDevice over one SerialPort, closed cleanly after use.
import { MeshDevice } from '@meshtastic/core'
import { openTransport } from './serialTransport'
import { readDevice, type Snapshot, type ReadOptions } from './groupSetup'

export interface Session {
  device: MeshDevice
  close: () => Promise<void>
  /** Resolves when the radio drops the connection (e.g. reboot after saving settings). */
  closed: Promise<void>
}

export async function openSession(port: SerialPort): Promise<Session> {
  const t = await openTransport(port)
  const device = new MeshDevice(t.transport, Math.floor(Math.random() * 1e9))
  return { device, close: t.close, closed: t.closed }
}

/** Open, run the handshake, and return the open session plus what the radio reported. */
export async function openAndRead(port: SerialPort, timeoutMs = 10000, opts: ReadOptions = {}): Promise<{ session: Session, snapshot: Snapshot }> {
  const session = await openSession(port)
  try {
    const snapshot = await readDevice(session.device, timeoutMs, opts)
    return { session, snapshot }
  }
  catch (e) {
    await session.close()
    throw e
  }
}
