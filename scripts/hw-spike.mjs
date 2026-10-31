#!/usr/bin/env node
// Hardware spike: run the same write+verify code the web page uses, from Node, against a radio
// on a serial port.   node scripts/hw-spike.mjs --port /dev/ttyACM0 --config config.json --name "Dee Smith" --short DS
// config.json = the `config` object from GET /api/config (or the whole response; `.config` is used).
// Secrets (channel keys, MQTT password) are never printed; any error text is redacted.
import { readFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { parseArgs } from 'node:util'
import { SerialPort } from 'serialport'
import { MeshDevice, Utils } from '@meshtastic/core'
import { buildPlan, applyPlan, readDevice, compareSnapshot, planSteps, nodeIdFromNum } from '../utils/groupSetup.ts'

const { values: a } = parseArgs({ options: {
  port: { type: 'string' }, config: { type: 'string' }, name: { type: 'string' }, short: { type: 'string' },
  'skip-apply': { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
} })
if (a.help || !a.port || !a.config || !a.name || !a.short) {
  console.log('usage: node scripts/hw-spike.mjs --port /dev/ttyACM0 --config config.json --name "X" --short XY [--skip-apply]')
  process.exit(a.help ? 0 : 2)
}

const raw = JSON.parse(readFileSync(a.config, 'utf8'))
const config = raw.config ?? raw
const secrets = [config.mqtt?.password, ...(config.channels ?? []).map(c => c.psk)].filter(s => s && s.length >= 4)
const redact = (s) => secrets.reduce((t, x) => t.split(x).join('<REDACTED>'), String(s))
const sleep = ms => new Promise(r => setTimeout(r, ms))

function frame(chunk) {
  const out = new Uint8Array(4 + chunk.length)
  out.set([0x94, 0xC3, (chunk.length >> 8) & 0xFF, chunk.length & 0xFF])
  out.set(chunk, 4)
  return out
}

async function connect(path, tries = 10) {
  for (let i = 0; i < tries; i++) {
    try {
      const port = await new Promise((resolve, reject) => {
        const p = new SerialPort({ path, baudRate: 115200, autoOpen: false })
        p.open(err => (err ? reject(err) : resolve(p)))
      })
      const fromDevice = Readable.toWeb(port).pipeThrough(Utils.fromDeviceStream())
      const toDevice = new WritableStream({ write: chunk => new Promise((res, rej) => port.write(frame(chunk), e => (e ? rej(e) : res()))) })
      const device = new MeshDevice({ toDevice, fromDevice }, Math.floor(Math.random() * 1e9))
      return { device, port, close: () => new Promise(res => (port.isOpen ? port.close(() => res()) : res())) }
    }
    catch (e) {
      if (i === tries - 1) throw e
      await sleep(1500)
    }
  }
}

function table(rows) {
  const w = Math.max(...rows.map(r => r[1].length))
  for (const [mark, label, extra] of rows) console.log(` ${mark}  ${label.padEnd(w)}  ${extra}`)
}

let conn
try {
  conn = await connect(a.port)
  console.log('connected; reading the radio...')
  const snap = await readDevice(conn.device, 20000)
  console.log(`radio: pioEnv=${snap.pioEnv ?? '?'} hwModel=${snap.hwModel ?? '?'} firmware=${snap.firmwareVersion ?? '?'} node=${snap.myNodeNum !== undefined ? nodeIdFromNum(snap.myNodeNum) : '?'}`)
  const plan = buildPlan(config, { longName: a.name, shortName: a.short }, snap)

  if (!a['skip-apply']) {
    console.log('\nwriting:')
    const res = await applyPlan(conn.device, plan, (id, st) => {
      if (st !== 'working') console.log(` ${st === 'done' ? '✓' : st === 'unconfirmed' ? '?' : '✗'} ${planSteps(plan).find(s => s.id === id)?.label ?? id}${st === 'unconfirmed' ? ' (no answer: radio is probably rebooting)' : ''}`)
    })
    console.log(`commit: ${res.commit}`)
    await sleep(6000) // let the radio drop and reboot
    await conn.close()
    conn = await connect(a.port, 20)
  }

  console.log('\nreading back...')
  const result = compareSnapshot(plan, await readDevice(conn.device, 30000))
  table(result.fields.map(f => [
    f.status === 'ok' ? '✓' : f.status === 'unreadable' ? '–' : '✗',
    f.label,
    f.status === 'ok' ? '' : f.status === 'unreadable' ? 'not readable (radio withholds it)' : `${f.status}: expected ${JSON.stringify(f.expected)} got ${JSON.stringify(f.got)}`,
  ]))
  console.log(result.ok ? '\nPASS' : '\nFAIL')
  await conn.close()
  process.exit(result.ok ? 0 : 1)
}
catch (e) {
  console.error('error: ' + redact(e?.message ?? e))
  try { await conn?.close() } catch { /* ignore */ }
  process.exit(1)
}
