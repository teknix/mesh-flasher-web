// A per-connection Meshtastic transport over a Web Serial port.
//
// Why not @meshtastic/transport-web-serial: its constructor pipes the module-level singleton
// Utils.toDeviceStream into the port (transport.ts: `Utils.toDeviceStream.readable.pipeTo(...)`),
// so a second connection in one page load cannot write, and the class has no close(). This one
// owns its streams, can be closed cleanly, and never calls port.forget().
import { Utils } from '@meshtastic/core'
import type { Types } from '@meshtastic/core'

export interface OpenTransport {
  transport: Types.Transport
  /** Release the streams and close the port. The SerialPort object stays usable. */
  close: () => Promise<void>
  /** Resolves when the read side ends (closed here, or the radio rebooted / was unplugged). */
  closed: Promise<void>
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Open a port, retrying on InvalidStateError (port still busy after a reset). */
export async function openPortWithRetry(port: SerialPort, baudRate = 115200, tries = 5, waitMs = 500): Promise<void> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try {
      await port.open({ baudRate })
      return
    }
    catch (e) {
      last = e
      const name = (e as { name?: string })?.name
      // InvalidStateError: already open / still closing. NetworkError: device re-enumerating.
      if (name !== 'InvalidStateError' && name !== 'NetworkError') throw e
      await sleep(waitMs)
    }
  }
  throw last
}

export function frame(chunk: Uint8Array): Uint8Array {
  const n = chunk.length
  const out = new Uint8Array(4 + n)
  out[0] = 0x94
  out[1] = 0xC3
  out[2] = (n >> 8) & 0xFF
  out[3] = n & 0xFF
  out.set(chunk, 4)
  return out
}

export async function openTransport(port: SerialPort, baudRate = 115200): Promise<OpenTransport> {
  await openPortWithRetry(port, baudRate)
  if (!port.readable || !port.writable) throw new Error('Stream not accessible')

  const reader = port.readable.getReader()
  const writer = port.writable.getWriter()

  let resolveClosed!: () => void
  const closed = new Promise<void>(r => (resolveClosed = r))
  let stopping = false

  // Read side: we own the reader, so close() can stop it deterministically.
  const raw = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          if (value && value.length) controller.enqueue(value)
        }
      }
      catch {
        // Port lost (reboot / unplug): fall through and end the stream cleanly.
      }
      try { controller.close() } catch { /* already closed */ }
      resolveClosed()
    },
  })
  const fromDevice = raw.pipeThrough(Utils.fromDeviceStream())

  const toDevice = new WritableStream<Uint8Array>({
    async write(chunk) {
      if (stopping) return
      await writer.write(frame(chunk))
    },
  })

  const close = async () => {
    stopping = true
    try { await reader.cancel() } catch { /* already gone */ }
    await Promise.race([closed, sleep(1000)])
    try { reader.releaseLock() } catch { /* pending read settled above */ }
    try { await writer.close() } catch { /* port may already be gone */ }
    try { writer.releaseLock() } catch { /* ignore */ }
    try { await port.close() } catch { /* already closed */ }
  }

  return { transport: { toDevice, fromDevice }, close, closed }
}
