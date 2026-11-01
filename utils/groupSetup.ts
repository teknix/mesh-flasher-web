// Transport-agnostic group setup: build the messages for a group's config, write them to a
// radio (MeshDevice), then read the radio back and compare. No DOM, no browser APIs, so a
// Node harness (scripts/hw-spike.mjs) can reuse it. Secrets (channel keys, MQTT password)
// are never logged and never appear in any result object.
import { create } from '@bufbuild/protobuf'
import { Protobuf, Types } from '@meshtastic/core'
import type { MeshDevice } from '@meshtastic/core'

// ---------------------------------------------------------------------------------------
// Config shape (what GET /api/config returns under `config`)
// ---------------------------------------------------------------------------------------

export interface GroupChannel {
  index: number
  role: 'PRIMARY' | 'SECONDARY'
  name: string
  /** base64 of 0, 1, 16 or 32 bytes */
  psk: string
  uplink: boolean
  downlink: boolean
  positionPrecision: number
}

export interface GroupConfig {
  lora: { region: string, modemPreset: string, hopLimit: number, txPower: number, channelNum?: number }
  channels: GroupChannel[]
  mqtt: {
    address: string
    username: string
    password: string
    tls: boolean
    root: string
    encryption: boolean
    json: boolean
    mapReporting: boolean
  }
  device: { role: string }
  [k: string]: unknown
}

export interface Names { longName: string, shortName: string }

export class SetupError extends Error {
  // Plain fields (no parameter properties) so Node can run this file with type-stripping only.
  stepId?: string
  cause?: unknown
  constructor(message: string, stepId?: string, cause?: unknown) {
    super(message)
    this.name = 'SetupError'
    this.stepId = stepId
    this.cause = cause
  }
}

// ---------------------------------------------------------------------------------------
// Snapshot: what a radio reports during its connect handshake
// ---------------------------------------------------------------------------------------

export interface Snapshot {
  myNodeNum?: number
  pioEnv?: string
  hwModel?: number
  firmwareVersion?: string
  lora?: Protobuf.Config.Config_LoRaConfig
  network?: Protobuf.Config.Config_NetworkConfig
  device?: Protobuf.Config.Config_DeviceConfig
  mqtt?: Protobuf.ModuleConfig.ModuleConfig_MQTTConfig
  owner?: { longName: string, shortName: string }
  channels: Record<number, Protobuf.Channel.Channel>
  configured: boolean
}

export function emptySnapshot(): Snapshot {
  return { channels: {}, configured: false }
}

const DEVICE_CONFIGURED = Types.DeviceStatusEnum.DeviceConfigured

/**
 * Attach listeners, send the configure request, and resolve with a Snapshot once the radio
 * reports DeviceConfigured. Does NOT await device.configure() (its promise never resolves
 * normally; it rejects after 60 s). On timeout rejects with a SetupError whose `cause` is the
 * partial Snapshot.
 */
export function readDevice(device: MeshDevice, timeoutMs = 10000): Promise<Snapshot> {
  const snap = emptySnapshot()
  const nodes = new Map<number, { longName: string, shortName: string }>()
  const unsubs: Array<() => void> = []
  const ev = device.events

  unsubs.push(ev.onMyNodeInfo.subscribe((m) => {
    snap.myNodeNum = m.myNodeNum
    if (m.pioEnv) snap.pioEnv = m.pioEnv
  }))
  unsubs.push(ev.onDeviceMetadataPacket.subscribe((p) => {
    snap.firmwareVersion = p.data.firmwareVersion
    snap.hwModel = p.data.hwModel as number
  }))
  unsubs.push(ev.onConfigPacket.subscribe((c) => {
    const v = c.payloadVariant
    if (v.case === 'lora') snap.lora = v.value
    else if (v.case === 'network') snap.network = v.value
    else if (v.case === 'device') snap.device = v.value
  }))
  unsubs.push(ev.onModuleConfigPacket.subscribe((c) => {
    const v = c.payloadVariant
    if (v.case === 'mqtt') snap.mqtt = v.value
  }))
  unsubs.push(ev.onChannelPacket.subscribe((c) => {
    snap.channels[c.index] = c
  }))
  unsubs.push(ev.onNodeInfoPacket.subscribe((n) => {
    if (n.user) nodes.set(n.num, { longName: n.user.longName, shortName: n.user.shortName })
  }))

  const finish = () => {
    for (const u of unsubs) { try { u() } catch { /* already gone */ } }
    if (snap.myNodeNum !== undefined) snap.owner = nodes.get(snap.myNodeNum)
  }

  return new Promise<Snapshot>((resolve, reject) => {
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      finish()
      reject(new SetupError('The radio did not answer in time.', 'read', snap))
    }, timeoutMs)
    unsubs.push(ev.onDeviceStatus.subscribe((s) => {
      if (s === DEVICE_CONFIGURED && !done) {
        done = true
        clearTimeout(timer)
        snap.configured = true
        finish()
        resolve(snap)
      }
    }))
    // configure() resolves only if wantConfigId is acked, which it is not; ignore its outcome.
    device.configure().catch(() => { /* expected: queue timeout */ })
  })
}

// ---------------------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------------------

export interface Expectation {
  id: string
  label: string
  expected: string | number | boolean
  /** Secret fields are compared but never displayed or returned. */
  secret?: boolean
  read: (s: Snapshot) => string | number | boolean | undefined
}

export interface Plan {
  lora: Protobuf.Config.Config
  network: Protobuf.Config.Config
  device: Protobuf.Config.Config
  mqtt: Protobuf.ModuleConfig.ModuleConfig
  owner: Protobuf.Mesh.User
  channels: Protobuf.Channel.Channel[]
  expect: Expectation[]
}

export function base64ToBytes(b64: string): Uint8Array {
  if (!b64) return new Uint8Array(0)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function enumValue<T extends Record<string, string | number>>(e: T, name: string, what: string): number {
  const v = e[name]
  if (typeof v !== 'number') throw new SetupError(`The group's ${what} setting "${name}" is not one this page knows.`, 'plan')
  return v
}

const C = Protobuf.Config
const MC = Protobuf.ModuleConfig

/** Set of fields to preserve from the radio's current config (so only our fields change). */
function keep<T extends object>(base: T | undefined): Partial<T> {
  if (!base) return {}
  const copy: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  delete copy.$typeName
  delete copy.$unknown
  return copy as Partial<T>
}

/** `base` = the radio's current config (from readDevice); when given, untouched fields are kept. */
export function buildPlan(config: GroupConfig, names: Names, base?: Snapshot): Plan {
  const region = enumValue(C.Config_LoRaConfig_RegionCode as never, config.lora.region, 'region')
  const preset = enumValue(C.Config_LoRaConfig_ModemPreset as never, config.lora.modemPreset, 'modem preset')
  const role = enumValue(C.Config_DeviceConfig_Role as never, config.device?.role ?? 'CLIENT', 'device role')

  const lora = create(C.ConfigSchema, {
    payloadVariant: {
      case: 'lora',
      value: {
        ...keep(base?.lora),
        usePreset: true,
        modemPreset: preset,
        region,
        hopLimit: config.lora.hopLimit,
        txEnabled: true,
        txPower: config.lora.txPower,
        // frequency slot; 0 = derived from the primary channel name. Groups that should
        // hear each other carry the same number. Left alone when the config has none.
        ...(config.lora.channelNum !== undefined ? { channelNum: config.lora.channelNum } : {}),
      },
    },
  })
  const network = create(C.ConfigSchema, {
    payloadVariant: { case: 'network', value: { ...keep(base?.network), wifiEnabled: false } },
  })
  const device = create(C.ConfigSchema, {
    payloadVariant: { case: 'device', value: { ...keep(base?.device), role } },
  })
  const m = config.mqtt
  const mqtt = create(MC.ModuleConfigSchema, {
    payloadVariant: {
      case: 'mqtt',
      value: {
        ...keep(base?.mqtt),
        enabled: true,
        address: m.address,
        username: m.username,
        password: m.password,
        encryptionEnabled: m.encryption,
        jsonEnabled: m.json,
        tlsEnabled: m.tls,
        root: m.root,
        proxyToClientEnabled: true,
        mapReportingEnabled: m.mapReporting,
      },
    },
  })
  const owner = create(Protobuf.Mesh.UserSchema, { longName: names.longName.trim(), shortName: names.shortName.trim() })
  const channels = config.channels.map(ch => create(Protobuf.Channel.ChannelSchema, {
    index: ch.index,
    role: enumValue(Protobuf.Channel.Channel_Role as never, ch.role, 'channel role'),
    settings: {
      name: ch.name,
      psk: base64ToBytes(ch.psk),
      uplinkEnabled: ch.uplink,
      downlinkEnabled: ch.downlink,
      moduleSettings: { positionPrecision: ch.positionPrecision },
    },
  }))
  // A radio that skips the flash keeps whatever channels it had (seen on hardware 2026-10-31:
  // a stale SECONDARY in slot 1). Clear every slot 1..7 the group does not define, unless the
  // radio already reports it as DISABLED.
  const defined = new Set(config.channels.map(c => c.index))
  const clearedSlots: number[] = []
  for (let i = 1; i <= 7; i++) {
    if (defined.has(i)) continue
    const current = base?.channels[i]
    if (current && current.role === Protobuf.Channel.Channel_Role.DISABLED) continue
    clearedSlots.push(i)
    channels.push(create(Protobuf.Channel.ChannelSchema, { index: i, role: Protobuf.Channel.Channel_Role.DISABLED, settings: {} }))
  }

  const expect: Expectation[] = [
    { id: 'lora.region', label: 'Region', expected: region, read: s => s.lora?.region },
    { id: 'lora.usePreset', label: 'Use a preset', expected: true, read: s => s.lora?.usePreset },
    { id: 'lora.modemPreset', label: 'Speed preset', expected: preset, read: s => s.lora?.modemPreset },
    { id: 'lora.hopLimit', label: 'Hop limit', expected: config.lora.hopLimit, read: s => s.lora?.hopLimit },
    ...(config.lora.channelNum !== undefined
      ? [{ id: 'lora.channelNum', label: 'Frequency slot', expected: config.lora.channelNum, read: (s: Snapshot) => s.lora?.channelNum } as Expectation]
      : []),
    { id: 'network.wifiEnabled', label: 'WiFi off', expected: false, read: s => s.network?.wifiEnabled },
    { id: 'device.role', label: 'Radio role', expected: role, read: s => s.device?.role },
    { id: 'mqtt.enabled', label: 'Internet link on', expected: true, read: s => s.mqtt?.enabled },
    { id: 'mqtt.address', label: 'Internet link address', expected: m.address, read: s => s.mqtt?.address },
    { id: 'mqtt.username', label: 'Internet link username', expected: m.username, read: s => s.mqtt?.username },
    { id: 'mqtt.password', label: 'Internet link password', expected: m.password, secret: true, read: s => s.mqtt?.password },
    { id: 'mqtt.root', label: 'Internet link topic', expected: m.root, read: s => s.mqtt?.root },
    { id: 'mqtt.tlsEnabled', label: 'Internet link encrypted (TLS)', expected: m.tls, read: s => s.mqtt?.tlsEnabled },
    { id: 'mqtt.jsonEnabled', label: 'JSON topics', expected: m.json, read: s => s.mqtt?.jsonEnabled },
    { id: 'mqtt.encryptionEnabled', label: 'Message encryption', expected: m.encryption, read: s => s.mqtt?.encryptionEnabled },
    { id: 'mqtt.proxyToClientEnabled', label: 'Phone internet bridge', expected: true, read: s => s.mqtt?.proxyToClientEnabled },
    { id: 'mqtt.mapReportingEnabled', label: 'Map reporting', expected: m.mapReporting, read: s => s.mqtt?.mapReportingEnabled },
    { id: 'owner.longName', label: 'Name', expected: names.longName.trim(), read: s => s.owner?.longName },
    { id: 'owner.shortName', label: 'Short name', expected: names.shortName.trim(), read: s => s.owner?.shortName },
  ]
  for (const ch of config.channels) {
    const i = ch.index
    expect.push(
      { id: `channel.${i}.name`, label: `Channel ${i} name`, expected: ch.name, read: s => s.channels[i]?.settings?.name },
      { id: `channel.${i}.uplink`, label: `Channel ${i} uplink`, expected: ch.uplink, read: s => s.channels[i]?.settings?.uplinkEnabled },
      { id: `channel.${i}.downlink`, label: `Channel ${i} downlink`, expected: ch.downlink, read: s => s.channels[i]?.settings?.downlinkEnabled },
      { id: `channel.${i}.psk`, label: `Channel ${i} key`, expected: ch.psk, secret: true,
        read: (s) => {
          const k = s.channels[i]?.settings?.psk
          return k && k.length ? bytesToBase64(k) : undefined
        } },
    )
  }
  for (const i of clearedSlots) {
    expect.push({ id: `channel.${i}.cleared`, label: `Channel ${i} cleared`, expected: true,
      read: s => { const c = s.channels[i]; return c === undefined || c.role === Protobuf.Channel.Channel_Role.DISABLED } })
  }
  return { lora, network, device, mqtt, owner, channels, expect }
}

// ---------------------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------------------

export interface PlanStep { id: string, label: string }

/** The ordered steps applyPlan performs (for a progress checklist). */
export function planSteps(plan: Plan): PlanStep[] {
  return [
    { id: 'lora', label: 'Radio settings' },
    { id: 'network', label: 'WiFi off' },
    { id: 'device', label: 'Radio role' },
    { id: 'mqtt', label: 'Internet link' },
    { id: 'owner', label: 'Your name' },
    ...plan.channels.map(c => ({ id: `channel-${c.index}`, label: c.role === Protobuf.Channel.Channel_Role.DISABLED ? `Clear unused channel ${c.index}` : `Channel ${c.index}` })),
    { id: 'commit', label: 'Saving to the radio' },
  ]
}

export type StepState = 'working' | 'done' | 'failed' | 'unconfirmed'

function withTimeout<T>(p: Promise<T>, ms: number, stepId: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new SetupError('The radio did not answer in time.', stepId)), ms)
    p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
  })
}

export interface ApplyResult {
  /** 'acked' = the radio confirmed the save; 'unconfirmed' = it rebooted/dropped first (verify to be sure). */
  commit: 'acked' | 'unconfirmed'
}

/**
 * Write the plan. Order matters: only setConfig opens the edit transaction, so a setConfig
 * goes first; the commit then applies everything at once and the radio reboots.
 */
export async function applyPlan(
  device: MeshDevice,
  plan: Plan,
  onStep?: (id: string, state: StepState) => void,
  stepTimeoutMs = 30000,
): Promise<ApplyResult> {
  const run = async (id: string, fn: () => Promise<unknown>) => {
    onStep?.(id, 'working')
    try {
      await withTimeout(fn(), stepTimeoutMs, id)
      onStep?.(id, 'done')
    }
    catch (e) {
      onStep?.(id, 'failed')
      throw e instanceof SetupError ? e : new SetupError('The radio refused a setting.', id, e)
    }
  }
  await run('lora', () => device.setConfig(plan.lora))
  await run('network', () => device.setConfig(plan.network))
  await run('device', () => device.setConfig(plan.device))
  await run('mqtt', () => device.setModuleConfig(plan.mqtt))
  await run('owner', () => device.setOwner(plan.owner))
  for (const ch of plan.channels) await run(`channel-${ch.index}`, () => device.setChannel(ch))

  // The radio reboots on commit, so its acknowledgement may never arrive.
  onStep?.('commit', 'working')
  try {
    await withTimeout(device.commitEditSettings(), 15000, 'commit')
    onStep?.('commit', 'done')
    return { commit: 'acked' }
  }
  catch {
    onStep?.('commit', 'unconfirmed')
    return { commit: 'unconfirmed' }
  }
}

// ---------------------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------------------

export type FieldStatus = 'ok' | 'mismatch' | 'missing' | 'unreadable'

export interface FieldResult {
  id: string
  label: string
  status: FieldStatus
  /** Present for non-secret fields only. */
  expected?: string | number | boolean
  got?: string | number | boolean
}

export interface VerifyResult {
  /** True when no field is a mismatch or missing ("unreadable" secrets are not failures). */
  ok: boolean
  fields: FieldResult[]
  snapshot: Snapshot
}

export function compareSnapshot(plan: Plan, snap: Snapshot): VerifyResult {
  const fields: FieldResult[] = plan.expect.map((x) => {
    const got = x.read(snap)
    if (x.secret) {
      // Firmware may withhold secrets; an empty value is "not readable", not a failure.
      if (got === undefined || got === '') return { id: x.id, label: x.label, status: 'unreadable' as const }
      return { id: x.id, label: x.label, status: got === x.expected ? 'ok' as const : 'mismatch' as const }
    }
    if (got === undefined) return { id: x.id, label: x.label, status: 'missing' as const, expected: x.expected }
    return { id: x.id, label: x.label, status: got === x.expected ? 'ok' as const : 'mismatch' as const, expected: x.expected, got }
  })
  return { ok: fields.every(f => f.status === 'ok' || f.status === 'unreadable'), fields, snapshot: snap }
}

/** Read the radio back (handshake) and compare to the plan. `device` must be a fresh, unconfigured connection. */
export async function verifyPlan(device: MeshDevice, plan: Plan, timeoutMs = 20000): Promise<VerifyResult> {
  const snap = await readDevice(device, timeoutMs)
  return compareSnapshot(plan, snap)
}

/** "0xf66f1e38" -> "!f66f1e38" */
export function nodeIdFromNum(num: number): string {
  return '!' + (num >>> 0).toString(16).padStart(8, '0')
}
